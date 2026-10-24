/** Fields that contain secrets — strip for non-admin users */
const SECRET_FIELDS = [
  "resendApiKey", "deployApiToken", "backupS3AccessKeyId", "backupS3SecretAccessKey",
  "backupPcloudPassword", "backupPcloudUsername", "calendarSecret",
  "webhookDiscordUrl", "webhookSlackUrl", "webhookCustomUrl", "webhookCustomSecret",
];

/**
 * Security W41 H3 — the named list missed every key added after it (AI keys
 * inherited from the org, deploy GitHub token, Fly live-sync secret, PSI key,
 * MCP server env). A non-admin now loses every field whose NAME says secret,
 * so a key added next month is covered without anyone remembering this list.
 */
const SECRET_NAME = /(api_?key|token|secret|password|username|accesskeyid)$/i;
/** Security W43 H3 — webhook lists carry {url, secret}, and a Discord/Slack
 *  URL IS the credential; schedulerWebhookUrl the same. Any *Webhooks/*WebhookUrl. */
const WEBHOOK_NAME = /(webhooks|webhookurl)$/i;
export function stripSecretsForNonAdmin(result: Record<string, unknown>): void {
  for (const key of Object.keys(result)) {
    if (SECRET_FIELDS.includes(key) || SECRET_NAME.test(key) || WEBHOOK_NAME.test(key)) delete result[key];
  }
  delete result.mcpServers;
  delete result.deployHookUrl;
}
