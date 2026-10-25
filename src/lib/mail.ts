import "server-only";

// Email through Resend's REST API (RESEND_API_KEY). Without a verified domain Resend only delivers to the
// account owner's own address, from onboarding@resend.dev; set MAIL_FROM once a domain is verified.
// No key in dev: the mail is printed to the server log instead.
export async function sendMail(to: string, subject: string, text: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    if (process.env.NODE_ENV !== "production") console.log(`[mail] to ${to}: ${subject}\n${text}`);
    return process.env.NODE_ENV !== "production";
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.MAIL_FROM || "InkFight <onboarding@resend.dev>", to, subject, text }),
  }).catch(() => null);
  if (!res?.ok) console.error("[mail]", res?.status, await res?.text().catch(() => ""));
  return !!res?.ok;
}
