import { Resend } from "resend";

const FROM = process.env.RESEND_FROM_EMAIL ?? "noreply@example.com";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "";

export async function sendDraftTurnEmail(to: string, displayName: string) {
  if (!process.env.RESEND_API_KEY) return;
  const resend = new Resend(process.env.RESEND_API_KEY);
  await resend.emails.send({
    from: FROM,
    to,
    subject: "It's your pick — World Cup 2026 Draft",
    html: `
      <p>Hey ${displayName},</p>
      <p>It's your turn to pick in the World Cup 2026 draft!</p>
      <p><a href="${APP_URL}/draft">Go to the draft board →</a></p>
    `,
  });
}
