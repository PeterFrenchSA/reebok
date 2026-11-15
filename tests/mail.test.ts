import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test, { TestContext } from "node:test";
import nodemailer from "nodemailer";
import { sendMail } from "../src/lib/mail";

function smtpEnvironment(t: TestContext) {
  const values = { SMTP_HOST: "smtp.example.invalid", SMTP_PORT: "587", SMTP_USER: "test-only", SMTP_PASS: "test-only", SMTP_FROM: "Reebok <house@example.invalid>" };
  for (const [key, value] of Object.entries(values)) {
    const previous = process.env[key];
    process.env[key] = value;
    t.after(() => { if (previous === undefined) delete process.env[key]; else process.env[key] = previous; });
  }
}

test("mail wrapper preserves SMTP settings and recipient arrays without network delivery", async (t) => {
  smtpEnvironment(t);
  const memory = nodemailer.createTransport({ streamTransport: true, buffer: true });
  const factory = t.mock.method(nodemailer, "createTransport", () => memory);
  const sending = t.mock.method(memory, "sendMail");
  const payload = { to: ["member@example.invalid", "admin@example.invalid"], subject: "Booking approved", text: "Your stay is approved.", html: "<p>Your stay is approved.</p>" };
  for (const port of [587, 465]) {
    process.env.SMTP_PORT = String(port);
    await sendMail(payload);
    assert.deepEqual(factory.mock.calls.at(-1)?.arguments[0], { host: "smtp.example.invalid", port, secure: port === 465, auth: { user: "test-only", pass: "test-only" } });
    assert.deepEqual(sending.mock.calls.at(-1)?.arguments[0], { from: process.env.SMTP_FROM, ...payload });
  }
});

test("Nodemailer composes multipart booking mail and parses display-name recipients", async () => {
  const transport = nodemailer.createTransport({ streamTransport: true, buffer: true });
  const link = "https://example.invalid/booking/manage?reference=test&token=synthetic";
  const result = await transport.sendMail({ from: "Reebok <house@example.invalid>", to: ["Family Member <member@example.invalid>", "Admin (House) <admin@example.invalid>"], subject: "Booking approved", text: `Manage your stay: ${link}`, html: `<p>Manage your stay: <a href="${link}">Open booking</a></p>` });
  assert.deepEqual(result.envelope, { from: "house@example.invalid", to: ["member@example.invalid", "admin@example.invalid"] });
  assert.ok(Buffer.isBuffer(result.message));
  const message = result.message.toString().replace(/=\r?\n/g, "").replace(/=3D/g, "=");
  for (const part of ["Subject: Booking approved", "multipart/alternative", "text/plain", "text/html", link]) assert.ok(message.includes(part), part);
});

test("missing SMTP skips delivery and transport errors still reach callers", async (t) => {
  smtpEnvironment(t);
  const memory = nodemailer.createTransport({ streamTransport: true, buffer: true });
  const factory = t.mock.method(nodemailer, "createTransport", () => memory);
  const warning = t.mock.method(console, "warn", () => {});
  delete process.env.SMTP_HOST;
  await sendMail({ to: "member@example.invalid", subject: "Test", text: "Test" });
  assert.equal(factory.mock.callCount(), 0);
  assert.equal(warning.mock.callCount(), 1);
  process.env.SMTP_HOST = "smtp.example.invalid";
  t.mock.method(memory, "sendMail", () => { throw new Error("Synthetic SMTP failure"); });
  await assert.rejects(sendMail({ to: "member@example.invalid", subject: "Test", text: "Test" }), /Synthetic SMTP failure/);
});

test("patched address parser completes the two reported DoS shapes in a bounded child process", () => {
  // Run only in a local subprocess: a regressed parser cannot stall the whole test runner.
  const result = spawnSync(process.execPath, ["-e", `
    const parse = require("nodemailer/lib/addressparser");
    parse("a" + "@b(c)".repeat(130000));
    parse(" >" + ">[x][x]".repeat(40000));
  `], { timeout: 5000, encoding: "utf8", env: { NODE_ENV: "test" } });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, result.stderr);
});
