// Run inside the existing app container every five minutes; runtime secrets stay in headers.
const secret = process.env.CRON_SECRET;
if (!secret) throw new Error("CRON_SECRET must be configured.");
const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid local app port.");
try {
  const response = await fetch(`http://127.0.0.1:${port}/api/jobs/google-sheets`, {
    method: "POST", headers: { "x-cron-secret": secret }, signal: AbortSignal.timeout(180000)
  });
  const result = await response.json();
  if (!response.ok) throw new Error(`Sync returned HTTP ${response.status}. Check the admin Google Sheets status page.`);
  console.log(result.synced ? "Google Sheets report refreshed." : `Google Sheets sync skipped: ${result.skipped ?? "no work"}.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : "Google Sheets sync failed.");
  process.exitCode = 1;
}
