import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { createInterface } from "node:readline/promises";
import { base, service, defaultHost, defaultDomain, quote, validateArchiveNames, validateTarget, validateInitialAdmin } from "./common.mjs";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const { values, positionals } = parseArgs({ allowPositionals: true, options: {
  host: { type: "string", default: defaultHost }, port: { type: "string", default: "22" },
  domain: { type: "string", default: defaultDomain }, ref: { type: "string", default: "HEAD" },
  "admin-email": { type: "string" }, "admin-name": { type: "string", default: "Administrator" },
  schema: { type: "string", default: "check" }, yes: { type: "boolean", default: false }, help: { type: "boolean", short: "h" }
} });
const action = positionals[0] ?? "check";
const sshOptions = ["-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes", "-o", "ForwardAgent=no", "-o", "ConnectTimeout=10", "-o", "ServerAliveInterval=15", "-o", "ServerAliveCountMax=3"];
const ssh = (command, options = {}) => execFileSync("ssh", [...sshOptions, "-p", values.port, values.host, command], { encoding: "utf8", ...options });
const remoteCommand = (args) => args.map(quote).join(" ");
const git = (args, options = {}) => execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", ...options });

async function main() {
  if (values.help) {
    console.log(`Usage: bash scripts/deploy.sh [check|check-fresh|status|deploy|fresh|rollback] [options]
  --host root@hostname   Default ${defaultHost}
  --port 22              SSH port; uses your existing key/agent and known_hosts
  --domain hostname      HTTPS site, default ${defaultDomain}
  --ref HEAD             Committed source to deploy; working tree must be clean
  --schema check         check (default), push, or migrate; never force data loss
  --admin-email address  Required for fresh: initial super-admin email
  --admin-name name      Fresh administrator display name (default Administrator)
  --yes                  Skip interactive deployment/rollback confirmation

check/check-fresh/status are read-only. deploy creates a clean release and preserves data.
fresh starts a NEW empty local database after backing up the old installation.
It retains the old database, rotates session/cron secrets, and creates no demo users.
The first schema upgrade requires --schema push. Read docs/DEPLOYMENT.md first.
rollback switches application code only, never restores/deletes database data.`);
    return;
  }
  validateTarget(values.host, values.port, values.domain);
  if (positionals.length > 1 || !["check", "check-fresh", "status", "deploy", "fresh", "rollback"].includes(action)) throw Error("Choose check, check-fresh, status, deploy, fresh, or rollback.");
  if (!["check", "push", "migrate"].includes(values.schema)) throw Error("Choose --schema check, push, or migrate.");
  const admin = action === "fresh" ? validateInitialAdmin(values["admin-email"], values["admin-name"]) : undefined;
  if (action === "fresh" && values.schema === "migrate") throw Error("Fresh installation initializes only its new database with the committed schema; omit --schema migrate.");
  const runner = fs.readFileSync(path.join(repo, "scripts/deploy/remote.mjs"), "utf8");
  const common = fs.readFileSync(path.join(repo, "scripts/deploy/common.mjs"), "utf8");
  // A self-contained stdin bundle lets check/status avoid creating remote files.
  const bundle = common.replace(/^export /gm, "") + "\n" + runner.replace(/^import \{[^\n]+\} from "\.\/common\.mjs";\n/m, "");
  const inspect = (mode) => ssh(remoteCommand(["node", "--input-type=module", "-", mode, values.domain]), { input: bundle, stdio: ["pipe", "inherit", "inherit"] });
  if (["check", "check-fresh", "status"].includes(action)) { inspect(action); return; }

  let revision;
  if (action === "deploy" || action === "fresh") {
    if (git(["status", "--porcelain"]).trim()) throw Error("Commit or stash local changes first. Only committed, reproducible source is deployed.");
    revision = git(["rev-parse", "--verify", "--end-of-options", `${values.ref}^{commit}`]).trim();
    if (!/^[a-f0-9]{40}$/.test(revision)) throw Error("Invalid Git revision.");
    const names = git(["ls-tree", "-r", "--name-only", "-z", revision]).split("\0").filter(Boolean);
    validateArchiveNames(names);
    if (git(["ls-tree", "-r", revision]).split("\n").some((line) => line.startsWith("120000 "))) throw Error("Source symlinks need a deliberate deployment review; refusing this archive.");
    if (!names.includes("src/app/api/health/route.ts")) throw Error("This revision predates the managed deployment health endpoint. Commit the deployment changes first.");
  }
  inspect(action === "fresh" ? "check-fresh" : "check");
  console.log(`\n${action.toUpperCase()} ${revision ?? "previous application release"} on ${values.host}\n${action === "fresh" ? "Existing data will NOT appear in the new installation. The old database and backups are retained for manual recovery." : `Database policy: ${values.schema}; existing data is preserved.`} A maintenance interruption is expected.`);
  if (!values.yes) {
    if (!process.stdin.isTTY) throw Error("Interactive confirmation required; use --yes only after reviewing the deployment.");
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question(action === "rollback" ? "Confirm the previous code is compatible with the CURRENT database. Type rollback: " : `Type ${action} to continue: `);
    rl.close();
    if (answer !== action) throw Error("Cancelled; the server was not changed.");
  }

  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "reebok-deploy-"));
  fs.chmodSync(temp, 0o700);
  try {
    const manifest = { action, revision, schema: action === "fresh" ? "push" : values.schema, domain: values.domain, admin };
    const files = ["remote.mjs", "common.mjs", "manifest.json"];
    for (const name of files.slice(0, 2)) fs.copyFileSync(path.join(repo, "scripts/deploy", name), path.join(temp, name));
    if (action === "deploy" || action === "fresh") {
      const archive = path.join(temp, "source.tar");
      const fd = fs.openSync(archive, "w", 0o600);
      try { git(["archive", "--format=tar", revision], { stdio: ["ignore", fd, "inherit"] }); } finally { fs.closeSync(fd); }
      manifest.sha256 = createHash("sha256").update(fs.readFileSync(archive)).digest("hex");
      files.push("source.tar");
    }
    fs.writeFileSync(path.join(temp, "manifest.json"), JSON.stringify(manifest), { mode: 0o600 });
    const incoming = ssh("umask 077; mktemp -d /tmp/reebok-deploy.XXXXXXXX").trim();
    if (!/^\/tmp\/reebok-deploy\.[A-Za-z0-9]{8}$/.test(incoming)) throw Error("Unexpected remote staging path.");
    execFileSync("scp", [...sshOptions, "-P", values.port, ...files.map((name) => path.join(temp, name)), `${values.host}:${incoming}/`], { stdio: "inherit" });
    const job = `${service}-deploy-${Date.now()}`;
    // systemd owns the job: disconnecting your Mac does not interrupt a release switch.
    ssh(remoteCommand(["systemd-run", `--unit=${job}`, "--property=Type=oneshot", "--property=RemainAfterExit=yes", "--property=UMask=0077", "--property=TimeoutStartSec=30min", "/usr/bin/flock", "--nonblock", `/run/lock/${service}-deploy.lock`, "/usr/bin/node", `${incoming}/remote.mjs`, "apply", incoming]), { stdio: "inherit" });
    console.log(`Server job: ${job}\nIf disconnected, run status or inspect: journalctl -u ${job}\nBuild output will be shown when the job finishes.`);
    const deadline = Date.now() + 32 * 60_000;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      const state = ssh(remoteCommand(["systemctl", "show", job, "-p", "ActiveState", "-p", "SubState", "-p", "Result"]));
      if (state.includes("SubState=exited") || state.includes("ActiveState=failed")) {
        ssh(remoteCommand(["journalctl", "-u", job, "--no-pager", "-n", "300"]), { stdio: "inherit" });
        if (!state.includes("SubState=exited") || !state.includes("Result=success")) throw Error(`Deployment job failed. Inspect ${job}; backups are in ${base}/backups. Do not restore the database blindly.`);
        console.log(`\n${action} completed: https://${values.domain}`);
        return;
      }
    }
    throw Error(`Stopped waiting, but the server job may still be active: ${job}. Run status before retrying.`);
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Deployment command failed.");
  process.exitCode = 1;
});
