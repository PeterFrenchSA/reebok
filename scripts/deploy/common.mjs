import { parseEnv } from "node:util";

export const service = "reebok-house-manager";
export const legacy = "/opt/reebok-house-manager";
export const base = "/opt/reebok-house-manager-deploy";
export const shared = `${base}/shared`;
export const current = `${base}/current`;
export const dropIn = `/etc/systemd/system/${service}.service.d/90-managed-release.conf`;
export const defaultHost = "root@reebok.williamson.co.za";
export const defaultDomain = "reebok.williamson.co.za";

// Apply the app environment only after privilege drop; transport credentials via stdin.
export const userCommandSource = `
  const fs = require('node:fs'), os = require('node:os');
  const {spawnSync} = require('node:child_process');
  const supplied = JSON.parse(fs.readFileSync(0, 'utf8'));
  const result = spawnSync(process.argv[1], process.argv.slice(2), {
    env: {...supplied, HOME: os.userInfo().homedir,
      PATH: '/usr/bin:/usr/sbin:/bin:/sbin:/usr/local/bin', NEXT_TELEMETRY_DISABLED: '1'},
    stdio: 'inherit'
  });
  if (result.error) console.error('Application command could not be started.');
  process.exit(result.status ?? 1);
`;

export function quote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

export function validateTarget(host, port, domain) {
  if (!/^root@[a-zA-Z0-9][a-zA-Z0-9.-]*$/.test(host)) throw Error("Use root@hostname; SSH options cannot be supplied as a host.");
  if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) throw Error("Invalid SSH port.");
  if (!/^[a-zA-Z0-9][a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(domain)) throw Error("Invalid HTTPS domain.");
}

export function validateArchiveNames(names) {
  for (const name of names) {
    const parts = name.replace(/\/$/, "").split("/");
    if (!name || /[\x00-\x1f\x7f\\]/.test(name) || parts.some((p) => !p || p === "." || p === "..")) throw Error("Unsafe source archive path.");
    if (parts.some((p) => [".git", ".next", "node_modules", ".playwright-mcp"].includes(p)) ||
        parts.some((p) => p.startsWith(".env") && p !== ".env.example") ||
        name.startsWith("public/uploads/") || name === "public/uploads") throw Error(`Do not deploy generated or private files: ${name}`);
  }
}

export function productionEnv(content, domain) {
  const env = parseEnv(content);
  const invalid = [];
  try { postgresEnv(env.DATABASE_URL); } catch { invalid.push("DATABASE_URL"); }
  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32 || /change.this|placeholder/i.test(env.SESSION_SECRET)) invalid.push("SESSION_SECRET");
  if (!env.CRON_SECRET || env.CRON_SECRET.length < 32 || /change.this|placeholder/i.test(env.CRON_SECRET)) invalid.push("CRON_SECRET");
  if (env.APP_BASE_URL?.replace(/\/$/, "") !== `https://${domain}`) invalid.push("APP_BASE_URL");
  if (env.NODE_ENV && env.NODE_ENV !== "production") invalid.push("NODE_ENV");
  if (env.ALLOW_DEV_AUTH_HEADERS === "true" || env.SEED_DEMO_USERS === "true") invalid.push("development/demo settings");
  if (invalid.length) throw Error(`Fix production configuration before deployment: ${invalid.join(", ")}. Values have not been printed.`);
  return { ...env, NODE_ENV: "production", ALLOW_DEV_AUTH_HEADERS: "false", SEED_DEMO_USERS: "false" };
}

export const readEnvironment = (content) => parseEnv(content);

export function validateInitialAdmin(email, name) {
  if (typeof email !== "string" || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw Error("Supply --admin-email for the initial super-admin.");
  if (typeof name !== "string" || !name.trim() || name.length > 100 || /[\x00-\x1f\x7f]/.test(name)) throw Error("Supply a valid --admin-name (up to 100 characters).");
  return { email: email.toLowerCase(), name: name.trim() };
}

export function freshEnvironment(content, domain, database, sessionSecret, cronSecret) {
  const old = parseEnv(content);
  const connection = postgresEnv(old.DATABASE_URL);
  if (!["localhost", "127.0.0.1", "::1"].includes(connection.PGHOST) || connection.PGPORT !== "5432") throw Error("Fresh installation requires this host's local PostgreSQL on port 5432; remote databases need a separate reviewed setup.");
  if (!/^reebok_fresh_[a-z0-9_]{1,40}$/.test(database) || database === connection.PGDATABASE) throw Error("Fresh installation must use a new generated database name.");
  const url = new URL(old.DATABASE_URL);
  url.pathname = `/${database}`;
  url.searchParams.set("schema", "public");
  const overrides = {
    DATABASE_URL: url.toString(), SESSION_SECRET: sessionSecret, CRON_SECRET: cronSecret,
    APP_BASE_URL: `https://${domain}`, NODE_ENV: "production", ALLOW_DEV_AUTH_HEADERS: "false", SEED_DEMO_USERS: "false"
  };
  for (const value of Object.values(overrides)) if (/["\\\r\n]/.test(value)) throw Error("Configuration cannot be represented safely in the production environment file.");
  const output = `${content}\n# Fresh installation settings (override the retained legacy settings above).\n${Object.entries(overrides).map(([key, value]) => `${key}="${value}"`).join("\n")}\n`;
  return { content: output, env: productionEnv(output, domain), owner: connection.PGUSER, database };
}

export function postgresEnv(connection) {
  const url = new URL(connection ?? "");
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname || !url.username || url.pathname.length < 2) throw Error("Invalid PostgreSQL connection configuration.");
  const env = {
    PGHOST: url.hostname.replace(/^\[|\]$/g, ""), PGPORT: url.port || "5432",
    PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: decodeURIComponent(url.pathname.slice(1)), PGCONNECT_TIMEOUT: "10"
  };
  for (const [parameter, key] of Object.entries({ sslmode: "PGSSLMODE", sslrootcert: "PGSSLROOTCERT", sslcert: "PGSSLCERT", sslkey: "PGSSLKEY" })) {
    if (url.searchParams.has(parameter)) env[key] = url.searchParams.get(parameter);
  }
  return env;
}

// The database is intentionally not restored on an application rollback.
export async function activate(steps) {
  try {
    await steps.stop();
    await steps.backup();
    await steps.schema();
    await steps.switchRelease();
    await steps.start();
    await steps.health();
  } catch (error) {
    try {
      await steps.restoreRelease();
      await steps.start();
      await steps.previousHealth();
    } catch {
      throw Error("Deployment failed and the previous app could not be restarted. Keep the database unchanged and inspect the protected backup and service logs.", { cause: error });
    }
    throw Error("Deployment failed; the previous application was restored. Database changes were NOT reversed. Inspect the backup before any manual database recovery.", { cause: error });
  }
}
