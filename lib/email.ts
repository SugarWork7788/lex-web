import { Resend } from "resend";

function isConfigured(): boolean {
  const k = process.env.RESEND_API_KEY;
  return Boolean(k && k !== "placeholder" && k.length > 8);
}

function siteUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL;
  if (fromEnv) return fromEnv.replace(/\/+$/, "");
  return "https://lex-web-eta.vercel.app";
}

const FROM = "lex.bg AI <onboarding@resend.dev>";

export type SendResult = { ok: true } | { ok: false; reason: string };

export async function sendConfirmationEmail(args: {
  email: string;
  lawNameBg: string;
  token: string;
}): Promise<SendResult> {
  const confirmLink = `${siteUrl()}/api/alerts/unsubscribe?token=${encodeURIComponent(args.token)}&action=confirm`;
  const unsubLink = `${siteUrl()}/api/alerts/unsubscribe?token=${encodeURIComponent(args.token)}`;
  const subject = `Потвърдете абонамента си за "${args.lawNameBg}"`;
  const html = `
    <p>Здравейте,</p>
    <p>Регистриран е абонамент за известия при промени в <strong>${escapeHtml(args.lawNameBg)}</strong>.</p>
    <p><a href="${confirmLink}">Потвърдете абонамента тук</a>.</p>
    <p>Ако не разпознавате тази заявка, можете да я <a href="${unsubLink}">отпишете тук</a>.</p>
    <hr/>
    <p style="font-size:12px;color:#666">lex.bg AI — независим инструмент за анализ на българското законодателство.</p>
  `;

  if (!isConfigured()) {
    console.warn(
      `[email] RESEND_API_KEY not configured — would have sent to ${args.email} for ${args.lawNameBg}`,
    );
    return { ok: false, reason: "no_provider" };
  }

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error } = await resend.emails.send({
      from: FROM,
      to: args.email,
      subject,
      html,
    });
    if (error) return { ok: false, reason: error.message };
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
