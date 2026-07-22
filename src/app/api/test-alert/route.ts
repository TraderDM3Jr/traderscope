import { sendAlert } from "@/lib/notify";

export const dynamic = "force-dynamic";

// Protected by the login gate (middleware). Used by the dashboard's
// "Send test alert" button so you can verify your Telegram/Discord setup
// without waiting for a real breach.
export async function POST() {
  await sendAlert(
    "Test alert from TraderScope — your notifications are working ✅"
  );
  return Response.json({ ok: true });
}
