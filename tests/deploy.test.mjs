import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { atomicWrite } from "../scripts/deploy/remote.mjs";
import { activate, quote, productionEnv, postgresEnv, validateArchiveNames, validateTarget, userCommandSource, freshEnvironment, validateInitialAdmin, readEnvironment } from "../scripts/deploy/common.mjs";

test("protected writes preserve the requested permissions under the deployment umask", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "reebok-permissions-"));
  const before = process.umask(0o077);
  try {
    atomicWrite(`${dir}/settings`, "synthetic settings", 0o640);
    atomicWrite(`${dir}/credentials`, "synthetic password");
    assert.equal(fs.statSync(`${dir}/settings`).mode & 0o777, 0o640);
    assert.equal(fs.statSync(`${dir}/credentials`).mode & 0o777, 0o600);
  } finally {
    process.umask(before);
    fs.rmSync(dir, { recursive: true });
  }
});

test("SSH arguments cannot turn into shell commands", () => {
  const value = "a' b; $(printf bad)\nend";
  const result = spawnSync("bash", ["-c", `printf %s ${quote(value)}`], { encoding: "utf8" });
  assert.equal(result.stdout, value);
  assert.doesNotThrow(() => validateTarget("root@reebok.williamson.co.za", "22", "reebok.williamson.co.za"));
  for (const host of ["-oProxyCommand=bad", "root@host;bad", "user@host"]) assert.throws(() => validateTarget(host, "22", "example.com"));
  assert.throws(() => validateTarget("root@example.com", "70000", "example.com"));
});

test("source releases exclude traversal, credentials, generated output and uploads", () => {
  validateArchiveNames([".env.example", "src/app/api/bookings/[id]/route.ts", "scripts/deploy.sh", "public/"]);
  for (const file of ["../secret", "/etc/shadow", "x/../secret", "x\\..\\secret", "bad\nfile", ".env.production", ".env.local", "node_modules/x", ".git/config", ".next/a", "public/uploads/invoice.pdf"]) {
    assert.throws(() => validateArchiveNames([file]), file);
  }
});

const configuration = `DATABASE_URL="postgresql://app:pass@localhost:5432/house?schema=public"
SESSION_SECRET="${"s".repeat(40)}"
CRON_SECRET="${"c".repeat(40)}"
APP_BASE_URL="https://reebok.williamson.co.za"
SMTP_PASS='literal $(echo unsafe)'
`;
test("environment files are parsed as data, not sourced as shell scripts", () => {
  const env = productionEnv(configuration, "reebok.williamson.co.za");
  assert.equal(env.SMTP_PASS, "literal $(echo unsafe)");
  assert.equal(env.NODE_ENV, "production");
  assert.equal(env.SEED_DEMO_USERS, "false");
  assert.throws(() => productionEnv(configuration + "\nALLOW_DEV_AUTH_HEADERS=true", "reebok.williamson.co.za"));
  assert.throws(() => productionEnv(configuration.replace(/SESSION_SECRET=.*/, "SESSION_SECRET=weak"), "reebok.williamson.co.za"));
  assert.throws(() => productionEnv(configuration, "different.example.com"));
});

test("database credentials use libpq environment variables, not command arguments", () => {
  const env = postgresEnv("postgresql://name:p%40ss%3Aword@[::1]:5433/house?schema=public&sslmode=require&connection_limit=5");
  assert.equal(env.PGHOST, "::1");
  assert.equal(env.PGPASSWORD, "p@ss:word");
  assert.equal(env.PGSSLMODE, "require");
  assert.equal(env.PGPORT, "5433");
  assert.equal(env.PGDATABASE, "house");
  assert.equal(Object.keys(env).includes("DATABASE_URL"), false);
});

test("fresh configuration isolates data and rotates secrets without modifying original settings", () => {
  const original = configuration + '\nSESSION_SECRET="weak"\nCRON_SECRET=""\nSEED_DEMO_USERS=true\n';
  const result = freshEnvironment(original, "reebok.williamson.co.za", "reebok_fresh_test", "n".repeat(64), "r".repeat(64));
  assert.equal(result.database, "reebok_fresh_test");
  assert.equal(result.owner, "app");
  assert.equal(new URL(result.env.DATABASE_URL).pathname, "/reebok_fresh_test");
  assert.equal(new URL(result.env.DATABASE_URL).searchParams.get("schema"), "public");
  assert.equal(result.env.SMTP_PASS, readEnvironment(original).SMTP_PASS);
  assert.equal(result.env.SESSION_SECRET, "n".repeat(64));
  assert.equal(result.env.CRON_SECRET, "r".repeat(64));
  assert.equal(result.env.SEED_DEMO_USERS, "false");
  assert.equal(result.env.ALLOW_DEV_AUTH_HEADERS, "false");
  assert.equal(result.env.NODE_ENV, "production");
  assert.equal(new URL(readEnvironment(original).DATABASE_URL).pathname, "/house");
  assert.equal(readEnvironment(original).SESSION_SECRET, "weak");
});

test("fresh setup refuses existing database names, other servers and weak replacement secrets", () => {
  const prepare = (content, name = "reebok_fresh_test", secret = "s".repeat(64)) => freshEnvironment(content, "reebok.williamson.co.za", name, secret, "c".repeat(64));
  assert.throws(() => prepare(configuration, "house"));
  assert.throws(() => prepare(configuration.replace("/house?", "/reebok_fresh_test?")));
  assert.throws(() => prepare(configuration.replace("localhost:5432", "remote.example:5432")));
  assert.throws(() => prepare(configuration.replace("localhost:5432", "localhost:5433")));
  assert.throws(() => prepare(configuration, "reebok_fresh_../bad"));
  assert.throws(() => prepare(configuration, "reebok_fresh_test", "weak"));
  assert.throws(() => prepare(configuration, "reebok_fresh_test", 'bad"\nSESSION_SECRET=oops'));
});

test("fresh install requires an explicit administrator identity before contacting a host", () => {
  assert.deepEqual(validateInitialAdmin("ADMIN@example.com", " Name "), { email: "admin@example.com", name: "Name" });
  for (const email of [undefined, "", "not-email", "user\n@example.com"]) assert.throws(() => validateInitialAdmin(email, "Name"));
  assert.throws(() => validateInitialAdmin("a@example.com", "Bad\nname"));
  const result = spawnSync(process.execPath, ["scripts/deploy/local.mjs", "fresh", "--yes"], { encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /--admin-email/);
});

test("unprivileged command loader receives secrets on stdin and pins its executable search path", () => {
  const result = spawnSync(process.execPath, ["-e", userCommandSource, process.execPath, "-e", "console.log(JSON.stringify({secret:process.env.TEST_SECRET,path:process.env.PATH}))"], {
    input: JSON.stringify({ TEST_SECRET: "synthetic-value", PATH: "/attacker-controlled" }), encoding: "utf8"
  });
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.secret, "synthetic-value");
  assert.equal(output.path.includes("attacker"), false);
});

function steps(failAt) {
  const calls = [];
  const actions = Object.fromEntries(["stop", "backup", "schema", "switchRelease", "start", "health", "restoreRelease", "previousHealth"].map((name) => [name, async () => {
    calls.push(name);
    if (name === failAt && calls.filter((c) => c === name).length === 1) throw Error(`Synthetic ${name} failure`);
  }]));
  return { calls, actions };
}
test("deployment stops writes and backs up before changing schema or app", async () => {
  const { calls, actions } = steps();
  await activate(actions);
  assert.deepEqual(calls, ["stop", "backup", "schema", "switchRelease", "start", "health"]);
});
for (const stage of ["stop", "backup", "schema", "switchRelease", "start", "health"]) {
  test(`${stage} failure restores application state without restoring the database`, async () => {
    const { calls, actions } = steps(stage);
    await assert.rejects(activate(actions), /previous application was restored/);
    assert.deepEqual(calls.slice(-3), ["restoreRelease", "start", "previousHealth"]);
    if (stage === "backup") assert.equal(calls.includes("schema"), false);
  });
}
test("rollback failure never claims recovery succeeded", async () => {
  const { actions } = steps("health");
  actions.restoreRelease = async () => { throw Error("Cannot restore"); };
  await assert.rejects(activate(actions), /previous app could not be restarted/);
});

test("Mac launcher help is local and does not need a connection", () => {
  const result = spawnSync("bash", ["scripts/deploy.sh", "--help"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /check\|check-fresh\|status\|deploy\|fresh\|rollback/);
});

test("read-only remote stdin bundle parses without duplicate or missing imports", () => {
  const common = fs.readFileSync("scripts/deploy/common.mjs", "utf8");
  const runner = fs.readFileSync("scripts/deploy/remote.mjs", "utf8");
  const bundle = common.replace(/^export /gm, "") + "\n" + runner.replace(/^import \{[^\n]+\} from "\.\/common\.mjs";\n/m, "");
  const result = spawnSync(process.execPath, ["--input-type=module", "--check"], { input: bundle, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
});
