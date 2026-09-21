import fs from "node:fs";
import path from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { service, legacy, base, shared, current, dropIn, defaultDomain, productionEnv, postgresEnv, validateArchiveNames, activate, userCommandSource, freshEnvironment, readEnvironment, validateInitialAdmin } from "./common.mjs";

const stateFile = `${base}/deployment.json`;
const exists = (file) => fs.existsSync(file);
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const log = (message) => console.log(`[${new Date().toISOString()}] ${message}`);

function command(program, args = [], options = {}) {
  const result = spawnSync(program, args, { encoding: "utf8", stdio: options.capture ? "pipe" : "inherit", ...options });
  if (result.error || result.status !== 0) throw Error(`${program} failed (exit ${result.status ?? "unavailable"}).`);
  return result.stdout?.trim() ?? "";
}

const property = (key) => command("systemctl", ["show", service, `--property=${key}`, "--value"], { capture: true });
const envFile = () => exists(stateFile) ? `${shared}/.env.production` : `${legacy}/.env.production`;
const loadEnv = (domain) => productionEnv(fs.readFileSync(envFile(), "utf8"), domain);

export function atomicWrite(file, text, mode = 0o600) {
  const temp = `${file}.${randomBytes(6).toString("hex")}.tmp`;
  fs.writeFileSync(temp, text, { mode, flag: "wx" });
  // Explicit modes must survive the deployment job's restrictive umask.
  fs.chmodSync(temp, mode);
  fs.renameSync(temp, file);
}

function pointCurrent(target) {
  if (exists(current) && !fs.lstatSync(current).isSymbolicLink()) throw Error("Current release path is not a managed symlink.");
  const temp = `${current}.${randomBytes(6).toString("hex")}`;
  fs.symlinkSync(target, temp);
  fs.renameSync(temp, current);
}

function appCommand(user, release, env, program, args, options = {}) {
  return command("/usr/sbin/runuser", ["-u", user, "--", "/usr/bin/node", "-e", userCommandSource, program, ...args], {
    cwd: release, env: { PATH: "/usr/bin:/usr/sbin:/bin:/sbin" }, input: JSON.stringify(env),
    stdio: ["pipe", options.output ?? (options.capture ? "pipe" : "inherit"), options.capture ? "pipe" : "inherit"]
  });
}

function inspect(domain, strict = true, fresh = false) {
  if (process.getuid?.() !== 0) throw Error("Connect as root; application builds and execution use the existing non-root service account.");
  if (!fs.readFileSync("/etc/os-release", "utf8").includes('VERSION_ID="24.04"')) throw Error("This runner supports Ubuntu 24.04 only.");
  if (property("LoadState") !== "loaded") throw Error("The existing reebok-house-manager service is required. This script does not provision a blank operating system.");
  const user = property("User");
  if (!/^[a-z_][a-z0-9_-]*$/.test(user) || user === "root") throw Error("The app service must run as a named non-root user.");
  const workdir = property("WorkingDirectory");
  if (workdir !== legacy && workdir !== current) throw Error("Unexpected service working directory; review the unit before deployment.");
  const state = exists(stateFile) ? readJson(stateFile) : null;
  log(`Service: ${property("ActiveState")}; account: ${user}; working directory: ${workdir}`);
  log(`Current release: ${state?.id ?? "legacy server checkout"}; environment: ${envFile()}`);
  if (strict) {
    for (const program of ["node", "npm", "pg_dump", "pg_restore", "psql", "tar", "curl", "flock", "runuser"]) command("which", [program], { capture: true });
    command("nginx", ["-t"]);
    let env;
    if (fresh) {
      if (state || exists(dropIn) || exists(`${shared}/.env.production`) || exists(`${shared}/uploads`)) throw Error("Fresh bootstrap is only for an unmanaged legacy installation. Inspect existing managed data or a failed bootstrap before continuing.");
      const prepared = freshEnvironment(fs.readFileSync(envFile(), "utf8"), domain, "reebok_fresh_preflight", "s".repeat(64), "c".repeat(64));
      env = prepared.env;
      command("which", ["createdb"], { capture: true });
      appCommand("postgres", "/tmp", { PGHOST: "/var/run/postgresql", PGPORT: "5432", PGDATABASE: "postgres" }, "psql", ["-At", "-c", "SELECT 1"], { capture: true });
      log("Fresh bootstrap preflight: local database retained, new empty database planned; session/cron secrets will be generated on the server.");
    } else env = loadEnv(domain);
    const available = fs.statfsSync("/opt");
    if (available.bavail * available.bsize < 3 * 1024 ** 3) throw Error("At least 3 GiB free disk space is required. Review retained backups/releases rather than deleting them blindly.");
    log("Environment validated without printing secrets; schema changes require an explicit mode.");
    if (!env.SMTP_HOST) log("Warning: SMTP is not configured; booking emails will not be sent.");
    if (exists(dropIn) && !state) throw Error("A deployment drop-in exists without managed state. Inspect an interrupted deployment before continuing.");
  }
  return { user, workdir, state };
}

function takeSnapshot(info) {
  return {
    currentLink: exists(current) ? fs.readlinkSync(current) : null,
    override: exists(dropIn) ? fs.readFileSync(dropIn, "utf8") : null,
    state: info.state,
    workdir: fs.realpathSync(info.workdir)
  };
}

function restore(snapshot) {
  if (snapshot.currentLink) pointCurrent(snapshot.currentLink);
  else if (exists(current)) {
    if (!fs.lstatSync(current).isSymbolicLink()) throw Error("Refusing to remove an unmanaged current path.");
    fs.unlinkSync(current);
  }
  if (snapshot.override !== null) atomicWrite(dropIn, snapshot.override, 0o644);
  else fs.rmSync(dropIn, { force: true });
  if (snapshot.state) atomicWrite(stateFile, JSON.stringify(snapshot.state));
  else fs.rmSync(stateFile, { force: true });
  command("systemctl", ["daemon-reload"]);
}

function backup(directory, snapshot, env, user) {
  log(`Backing up stopped application, database, settings and uploads to ${directory}`);
  atomicWrite(`${directory}/previous.json`, JSON.stringify(snapshot));
  fs.copyFileSync(envFile(), `${directory}/env.production`);
  fs.chmodSync(`${directory}/env.production`, 0o600);
  const dump = fs.openSync(`${directory}/database.dump`, "wx", 0o600);
  try { appCommand(user, snapshot.workdir, postgresEnv(env.DATABASE_URL), "pg_dump", ["--format=custom"], { output: dump }); }
  finally { fs.closeSync(dump); }
  command("pg_restore", ["--list", `${directory}/database.dump`], { capture: true });
  const uploads = `${snapshot.workdir}/public/uploads`;
  if (exists(uploads)) command("tar", ["-czf", `${directory}/uploads.tar.gz`, "-C", uploads, "."]);
  command("tar", ["-czf", `${directory}/source.tar.gz`, "--exclude=./node_modules", "--exclude=./.next", "--exclude=./.env*", "--exclude=./public/uploads", "-C", snapshot.workdir, "."]);
  atomicWrite(`${directory}/complete.json`, JSON.stringify({ completedAt: new Date().toISOString(), database: "database.dump", source: "source.tar.gz", uploads: exists(uploads) ? "uploads.tar.gz" : null }));
  log("Database dump format verified. Backups are root-only and retained; database restore is always manual.");
}

function checkBackupSpace(env, workdir, user) {
  const dbBytes = Number(appCommand(user, workdir, postgresEnv(env.DATABASE_URL), "psql",
    ["-At", "-v", "ON_ERROR_STOP=1", "-c", "SELECT pg_database_size(current_database())"], { capture: true }));
  const uploads = `${workdir}/public/uploads`;
  const uploadBytes = exists(uploads) ? Number(command("du", ["-sb", fs.realpathSync(uploads)], { capture: true }).split(/\s/)[0]) : 0;
  const sourceBytes = Number(command("du", ["-sb", "--exclude=node_modules", "--exclude=.next", "--exclude=uploads", workdir], { capture: true }).split(/\s/)[0]);
  const available = fs.statfsSync("/opt");
  const needed = 2 * (dbBytes + uploadBytes + sourceBytes) + 512 * 1024 ** 2;
  if (!Number.isFinite(needed) || available.bavail * available.bsize < needed) throw Error("Insufficient space for conservative database, source and upload backup estimates. The running app has not been stopped.");
}

async function health(domain, releaseId) {
  const deadline = Date.now() + 90_000;
  const endpoint = releaseId ? "/api/health" : "/login";
  while (Date.now() < deadline) {
    try {
      if (property("ActiveState") !== "active") throw Error("Service not active.");
      const body = command("curl", ["--fail", "--silent", "--show-error", "--max-time", "5", `http://127.0.0.1:3000${endpoint}`], { capture: true });
      if (releaseId && (!JSON.parse(body).ok || JSON.parse(body).release !== releaseId)) throw Error("Wrong release or unavailable database.");
      const publicBody = command("curl", ["--fail", "--silent", "--show-error", "--max-time", "5", "--resolve", `${domain}:443:127.0.0.1`, `https://${domain}${endpoint}`], { capture: true });
      if (releaseId && (!JSON.parse(publicBody).ok || JSON.parse(publicBody).release !== releaseId)) throw Error("HTTPS proxy is not serving this release.");
      return;
    } catch { await new Promise((resolve) => setTimeout(resolve, 2000)); }
  }
  throw Error("Local database health or HTTPS certificate/proxy health check failed.");
}

function protectLayout() {
  for (const directory of [base, `${base}/releases`, shared]) {
    if (exists(directory) && (fs.lstatSync(directory).isSymbolicLink() || !fs.statSync(directory).isDirectory() || fs.statSync(directory).uid !== 0)) throw Error("Deployment directories must be real root-owned directories.");
    fs.mkdirSync(directory, { recursive: true, mode: 0o755 });
    fs.chmodSync(directory, 0o755);
  }
  const backups = `${base}/backups`;
  if (exists(backups) && (fs.lstatSync(backups).isSymbolicLink() || fs.statSync(backups).uid !== 0)) throw Error("Backups must be in a root-owned directory.");
  fs.mkdirSync(backups, { recursive: true, mode: 0o700 });
  fs.chmodSync(backups, 0o700);
}

function guardAdmin(user, release, env) {
  const query = `SELECT COUNT(*) AS count FROM "User" WHERE role::text='SUPER_ADMIN' AND "isActive"=true AND "passwordHash" IS NOT NULL`;
  const code = `const {PrismaClient}=require('@prisma/client'); const db=new PrismaClient();
    (async()=>{try {const rows=await db.$queryRawUnsafe(${JSON.stringify(query)});
    if (rows[0].count < 1n) throw Error('No admin');
    } finally {await db.$disconnect();}})().catch(()=>{console.error('Cannot verify an active SUPER_ADMIN with a password. Resolve this before the role upgrade.');process.exitCode=1;});`;
  appCommand(user, release, env, "node", ["-e", code]);
}

function schema(user, release, env, mode) {
  const args = mode === "push" ? ["db", "push", "--skip-generate"]
    : mode === "migrate" ? ["migrate", "deploy"]
      : ["migrate", "diff", "--from-schema-datasource", "prisma/schema.prisma", "--to-schema-datamodel", "prisma/schema.prisma", "--exit-code"];
  if (mode === "migrate" && !exists(`${release}/prisma/migrations`)) throw Error("No migration history exists. This release requires an explicitly reviewed --schema push.");
  appCommand(user, release, env, "node", ["node_modules/prisma/build/index.js", ...args]);
}

async function apply(incoming) {
  if (!/^\/tmp\/reebok-deploy\.[A-Za-z0-9]{8}$/.test(incoming)) throw Error("Invalid incoming directory.");
  const manifest = readJson(`${incoming}/manifest.json`);
  if (!["deploy", "fresh", "rollback"].includes(manifest.action) || !["check", "push", "migrate"].includes(manifest.schema) || !/^[a-zA-Z0-9.-]+$/.test(manifest.domain)) throw Error("Invalid deployment manifest.");
  const isFresh = manifest.action === "fresh";
  const admin = isFresh ? validateInitialAdmin(manifest.admin?.email, manifest.admin?.name) : null;
  if (manifest.action !== "rollback" && !/^[a-f0-9]{40}$/.test(manifest.revision ?? "")) throw Error("Invalid revision.");
  const info = inspect(manifest.domain, true, isFresh);
  process.umask(0o077);
  protectLayout();
  const originalContent = fs.readFileSync(envFile(), "utf8");
  const env = isFresh ? readEnvironment(originalContent) : loadEnv(manifest.domain);
  const before = takeSnapshot(info);
  const id = `${new Date().toISOString().replace(/[-:.TZ]/g, "")}-${manifest.revision?.slice(0, 12) ?? "rollback"}-${randomBytes(3).toString("hex")}`;
  const backupDir = `${base}/backups/${id}`;
  fs.mkdirSync(backupDir, { mode: 0o700 });
  const fresh = isFresh ? freshEnvironment(originalContent, manifest.domain,
    `reebok_fresh_${Date.now()}_${randomBytes(4).toString("hex")}`, randomBytes(32).toString("hex"), randomBytes(32).toString("hex")) : null;
  const pendingEnv = `${shared}/.env.fresh-${id}`;
  if (fresh) {
    atomicWrite(pendingEnv, fresh.content, 0o640);
    command("chown", [`root:${command("id", ["-gn", info.user], { capture: true })}`, pendingEnv]);
  }
  let release;
  let previous;
  if (manifest.action === "deploy" || isFresh) {
    if (!/^[a-f0-9]{40}$/.test(manifest.revision ?? "")) throw Error("Invalid revision.");
    const archive = `${incoming}/source.tar`;
    if (createHash("sha256").update(fs.readFileSync(archive)).digest("hex") !== manifest.sha256) throw Error("Source checksum does not match.");
    validateArchiveNames(command("tar", ["-tf", archive], { capture: true }).split("\n"));
    if (command("tar", ["-tvf", archive], { capture: true }).split("\n").some((line) => !/^[d-]/.test(line))) throw Error("Source archive must not contain symbolic or hard links.");
    release = `${base}/releases/${id}`;
    fs.mkdirSync(release, { mode: 0o755 });
    command("tar", ["-xf", archive, "-C", release, "--no-same-owner", "--no-same-permissions"]);
    fs.symlinkSync(fresh ? pendingEnv : envFile(), `${release}/.env.production`);
    command("chown", ["-hR", `${info.user}:`, release]);
    log(`Building clean source ${manifest.revision} as ${info.user}. The running app is unchanged.`);
    appCommand(info.user, release, {}, "npm", ["ci", "--include=dev", "--no-audit", "--no-fund"]);
    appCommand(info.user, release, fresh?.env ?? env, "npm", ["run", "build"]);
    if (!fresh) {
      guardAdmin(info.user, release, env);
      if (manifest.schema === "check") schema(info.user, release, env, "check");
    }
  } else {
    if (!info.state?.previousBackup) throw Error("There is no previous compatible managed deployment. Returning across a fresh-database boundary requires manual recovery, not code rollback.");
    previous = readJson(`${info.state.previousBackup}/previous.json`);
    if (!exists(previous.workdir)) throw Error("The previous release is no longer on disk.");
    log("Rolling back code only. The current database and uploaded documents will NOT be replaced.");
  }

  checkBackupSpace(env, before.workdir, info.user);

  await activate({
    stop: () => { log("Starting maintenance window."); command("systemctl", ["stop", service]); },
    backup: () => backup(backupDir, before, env, info.user),
    schema: () => {
      if (fresh) {
        atomicWrite(`${backupDir}/fresh-install.json`, JSON.stringify({ database: fresh.database, owner: fresh.owner, release, pendingEnv }));
        log("Backup complete. Creating a separate empty database; the original database is not modified.");
        appCommand("postgres", "/tmp", { PGHOST: "/var/run/postgresql", PGPORT: "5432" }, "createdb",
          ["--template=template0", "--encoding=UTF8", "--owner", fresh.owner, "--", fresh.database]);
        schema(info.user, release, fresh.env, "push");
        const password = randomBytes(24).toString("base64url");
        atomicWrite(`${backupDir}/initial-admin.json`, JSON.stringify({ email: admin.email, name: admin.name, password }, null, 2));
        appCommand(info.user, release, { ...fresh.env, BOOTSTRAP_ADMIN_EMAIL: admin.email, BOOTSTRAP_ADMIN_NAME: admin.name, BOOTSTRAP_ADMIN_PASSWORD: password },
          "node", ["--import", "tsx", "scripts/create-admin.ts"]);
        guardAdmin(info.user, release, fresh.env);
      } else if (release) schema(info.user, release, env, manifest.schema);
    },
    switchRelease: () => {
      if (previous) { restore(previous); return; }
      if (fresh) fs.renameSync(pendingEnv, `${shared}/.env.production`);
      else if (!exists(`${shared}/.env.production`) || (!before.state && fs.realpathSync(`${legacy}/.env.production`) !== `${shared}/.env.production`)) {
        fs.copyFileSync(envFile(), `${shared}/.env.production`);
        command("chown", [`root:${command("id", ["-gn", info.user], { capture: true })}`, `${shared}/.env.production`]);
        fs.chmodSync(`${shared}/.env.production`, 0o640);
      }
      if (!exists(`${shared}/uploads`)) {
        fs.mkdirSync(`${shared}/uploads`, { mode: 0o750 });
        command("chown", ["-R", `${info.user}:`, `${shared}/uploads`]);
      }
      if (!fresh && !before.state && exists(`${legacy}/public/uploads`) && fs.realpathSync(`${legacy}/public/uploads`) !== `${shared}/uploads`) {
        command("cp", ["-a", `${legacy}/public/uploads/.`, `${shared}/uploads/`]);
      }
      // Only data-preserving adoption shares storage with legacy code. Fresh bootstrap keeps it isolated.
      if (!fresh && !before.state) {
        const legacyUploads = `${legacy}/public/uploads`;
        if (!exists(`${legacy}/public`)) {
          fs.mkdirSync(`${legacy}/public`, { mode: 0o755 });
          command("chown", [`${info.user}:`, `${legacy}/public`]);
        }
        if (!exists(legacyUploads) || fs.realpathSync(legacyUploads) !== `${shared}/uploads`) {
          if (exists(legacyUploads)) fs.renameSync(legacyUploads, `${backupDir}/legacy-uploads`);
          fs.symlinkSync(`${shared}/uploads`, legacyUploads);
        }
        const legacyEnv = `${legacy}/.env.production`;
        if (fs.realpathSync(legacyEnv) !== `${shared}/.env.production`) {
          fs.renameSync(legacyEnv, `${backupDir}/legacy-env.production`);
          fs.symlinkSync(`${shared}/.env.production`, legacyEnv);
        }
      }
      fs.unlinkSync(`${release}/.env.production`);
      fs.symlinkSync(`${shared}/.env.production`, `${release}/.env.production`);
      fs.mkdirSync(`${release}/public`, { recursive: true });
      command("chown", [`${info.user}:`, `${release}/public`]);
      fs.symlinkSync(`${shared}/uploads`, `${release}/public/uploads`);
      pointCurrent(release);
      fs.mkdirSync(path.dirname(dropIn), { recursive: true });
      atomicWrite(dropIn, `[Service]\nWorkingDirectory=${current}\nEnvironmentFile=\nEnvironmentFile=${shared}/.env.production\nExecStart=\nExecStart=/usr/bin/env NODE_ENV=production APP_RELEASE=${id} /usr/bin/node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3000\n`, 0o644);
      command("systemctl", ["daemon-reload"]);
      atomicWrite(stateFile, JSON.stringify({ id, revision: manifest.revision, release,
        previousBackup: fresh ? null : backupDir, initialBackup: fresh ? backupDir : before.state?.initialBackup }));
    },
    start: () => command("systemctl", ["start", service]),
    health: () => health(manifest.domain, release ? id : previous.state?.id),
    restoreRelease: () => restore(before),
    previousHealth: () => health(manifest.domain, before.state?.id)
  });
  log(`Deployment healthy at https://${manifest.domain}. Backup: ${backupDir}`);
  log(`Environment: ${envFile()} (restart ${service} after changes).`);
  if (fresh) {
    log(`Initial admin credentials are in ${backupDir}/initial-admin.json (root-only). Retrieve over SSH and change the password in User Administration.`);
    log("No demo users, bookings, finances, rooms or sample rates were imported. Configure rooms, rates and useful information before inviting users.");
    log("Session/cron secrets were rotated. Update any scheduled-job callers to use the new CRON_SECRET from the shared environment file.");
  }
  fs.rmSync(incoming, { recursive: true });
}

async function main() {
  const [action, argument] = process.argv.slice(2);
  if (action === "check" || action === "check-fresh" || action === "status") {
    inspect(argument ?? defaultDomain, action !== "status", action === "check-fresh");
    if (action === "status") command("systemctl", ["list-units", "--all", `${service}-deploy-*`, "--no-pager"]);
  } else if (action === "apply") await apply(argument);
  else throw Error("Unknown remote operation.");
}

if (process.argv[1] === "-" || fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Deployment failed.");
    if (error?.cause instanceof Error) console.error(error.cause.message);
    process.exitCode = 1;
  });
}
