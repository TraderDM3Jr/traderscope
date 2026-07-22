// Sends an alert to any configured off-board channel.
// Channels are enabled simply by setting the relevant env var in Vercel:
//   TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID   -> Telegram DM / group
//   DISCORD_WEBHOOK_URL                      -> Discord (or any Slack-compatible webhook)
// If none are set, this is a harmless no-op (the alert is still saved in the DB).

export async function sendAlert(message: string): Promise<void> {
  const text = `🔔 TraderScope Alert\n${message}`;

  const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
  const telegramChat = process.env.TELEGRAM_CHAT_ID;
  if (telegramToken && telegramChat) {
    try {
      await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: telegramChat, text }),
      });
    } catch (e) {
      console.error("Telegram alert failed:", e);
    }
  }

  const discord = process.env.DISCORD_WEBHOOK_URL;
  if (discord) {
    try {
      await fetch(discord, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text }),
      });
    } catch (e) {
      console.error("Discord alert failed:", e);
    }
  }
}
