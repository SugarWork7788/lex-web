import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token") ?? "";
  const action = url.searchParams.get("action") ?? "unsubscribe";

  if (!token) {
    return new Response(htmlPage("Липсва токен в линка."), {
      status: 400,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  if (action === "confirm") {
    const { error } = await supabase
      .from("law_alerts")
      .update({ confirmed: true })
      .eq("token", token);
    if (error) {
      return new Response(htmlPage(`Грешка: ${error.message}`), {
        status: 500,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }
    return new Response(
      htmlPage(
        "Абонаментът е потвърден. Ще получавате известия при значими промени в избрания закон.",
      ),
      { headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }

  // Default: unsubscribe.
  const { error } = await supabase
    .from("law_alerts")
    .delete()
    .eq("token", token);
  if (error) {
    return new Response(htmlPage(`Грешка: ${error.message}`), {
      status: 500,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }
  return new Response(htmlPage("Успешно отписахте се от известия."), {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function htmlPage(message: string): string {
  return `<!doctype html>
<html lang="bg"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>lex.bg AI — известия</title>
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#fafaf7;color:#1a1a1a;margin:0;padding:0}
  main{max-width:560px;margin:80px auto;padding:0 24px;text-align:center}
  h1{font-size:24px;margin-bottom:12px}
  p{font-size:16px;line-height:1.5;color:#444}
  a{color:#b45309;text-decoration:none;font-weight:500}
  a:hover{text-decoration:underline}
  @media (prefers-color-scheme:dark){body{background:#0e0e0c;color:#ededed}p{color:#bbb}}
</style>
</head><body><main>
<h1>lex.bg AI</h1>
<p>${message}</p>
<p style="margin-top:32px"><a href="/">← Към началната страница</a></p>
</main></body></html>`;
}
