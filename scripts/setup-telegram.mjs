const token = process.env.TELEGRAM_BOT_TOKEN;
const username = process.env.TELEGRAM_BOT_USERNAME;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
const base = process.env.APP_BASE_URL;
if (!token || !username || !secret || !base || !/^[A-Za-z0-9_-]{32,256}$/.test(secret)) {
  throw new Error("Set TELEGRAM_BOT_TOKEN, TELEGRAM_BOT_USERNAME, TELEGRAM_WEBHOOK_SECRET (32+ URL-safe characters) and APP_BASE_URL.");
}
const webhook = new URL("/api/telegram/webhook", base);
if (webhook.protocol !== "https:") throw new Error("The public webhook must use HTTPS.");
async function call(method, payload) {
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: AbortSignal.timeout(15000) });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error("API rejected request");
    return data.result;
  } catch {
    throw new Error(`Telegram ${method} failed. Check credentials/connectivity; tokens are deliberately omitted from errors.`);
  }
}
const me = await call("getMe", {});
if (me.username.toLowerCase() !== username.toLowerCase()) throw new Error("TELEGRAM_BOT_USERNAME does not match the token's bot.");
await call("setWebhook", { url: webhook.toString(), secret_token: secret, allowed_updates: ["message", "callback_query"], max_connections: 1, drop_pending_updates: false });
await call("setMyCommands", { commands: [
  { command: "start", description: "Start or connect your Reebok account" },
  { command: "availability", description: "Check room or whole-house availability" },
  { command: "help", description: "How to use the availability bot" },
  { command: "cancel", description: "Clear your date selection" },
  { command: "groupid", description: "Administrators: show this group ID for approval" }
] });
console.log(`Webhook registered for @${me.username}: ${webhook.origin}${webhook.pathname}`);
