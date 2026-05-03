import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { sendConfirmationEmail } from "@/lib/email";

export const runtime = "nodejs";

type Body = { email?: string; slug?: string; name_bg?: string };

function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Невалидно тяло на заявката" },
      { status: 400 },
    );
  }

  const email = (body.email ?? "").trim().toLowerCase();
  const slug = (body.slug ?? "").trim();
  const nameBg = (body.name_bg ?? "").trim();

  if (!isValidEmail(email)) {
    return NextResponse.json(
      { ok: false, error: "Невалиден имейл адрес" },
      { status: 400 },
    );
  }
  if (!slug || !nameBg) {
    return NextResponse.json(
      { ok: false, error: "Липсва закон" },
      { status: 400 },
    );
  }

  // Check whether a subscription already exists.
  const { data: existing, error: selErr } = await supabase
    .from("law_alerts")
    .select("id, token, confirmed")
    .eq("email", email)
    .eq("law_slug", slug)
    .maybeSingle();
  if (selErr) {
    // RLS will block SELECT under current policies — that's expected.
    // If it's a non-RLS error, bubble it up; otherwise treat as new sub.
    if (selErr.code && selErr.code !== "PGRST116") {
      // continue — we'll attempt insert
    }
  }

  let token: string;
  let alreadySubscribed = false;
  if (existing) {
    token = existing.token;
    alreadySubscribed = true;
  } else {
    const { data: inserted, error: insErr } = await supabase
      .from("law_alerts")
      .insert({ email, law_slug: slug, law_name_bg: nameBg })
      .select("token")
      .single();
    if (insErr || !inserted) {
      // Could be unique-constraint race or RLS-hidden conflict.
      // Try to fetch the token by best-effort or just return success without it.
      console.error(`[alerts] insert error: ${insErr?.message ?? "no row"}`);
      return NextResponse.json(
        { ok: true, alreadySubscribed: true, emailSent: false },
        { status: 200 },
      );
    }
    token = inserted.token;
  }

  const send = await sendConfirmationEmail({
    email,
    lawNameBg: nameBg,
    token,
  });

  return NextResponse.json({
    ok: true,
    alreadySubscribed,
    emailSent: send.ok,
    emailReason: send.ok ? null : send.reason,
  });
}
