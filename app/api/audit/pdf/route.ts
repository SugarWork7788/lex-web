/**
 * /api/audit/pdf — server-rendered PDF of the /audit listing page (PDF-01 / D-08..D-13).
 *
 * Pipeline:
 *   1. Rate-limit gate (audit-pdf, 5/min — D-13 throttle, RESEARCH Pattern 4).
 *   2. Launch headless chromium via @sparticuz/chromium (executablePath computed at runtime).
 *   3. page.goto(`${SITE_URL}/audit`, networkidle0) — server-rendered page with revalidate:60 ISR.
 *   4. page.pdf({ format: A4, printBackground: true }) — printBackground triggers app/globals.css
 *      `@media print` block which renders the LEX.BRAIN SVG-tile watermark + neutralises stone-* colors.
 *   5. Stream binary back with Content-Disposition attachment + Cache-Control: no-store.
 *
 * Cold-start budget: ~6-9 s cold, ~2-4 s warm (RESEARCH Q3). 60 s maxDuration = 6× headroom.
 *
 * Watermark fidelity: the existing print-CSS path is the renderer; this route triggers it.
 * No watermark template injection here — D-09 contract.
 */
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import { rateLimited } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60; // D-13
export const dynamic = "force-dynamic"; // never cache PDF bytes (Pitfall 4)

// SITE_URL fallback to production. Local dev sets NEXT_PUBLIC_SITE_URL=http://localhost:3000.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://lex-web-eta.vercel.app";

export async function GET(req: Request) {
  const limit = rateLimited(req, "audit-pdf", { windowMs: 60_000, max: 5 });
  // ↑ 5/min/IP — PDF generation is expensive (~3-8s function-time per call).
  //   At 30/min/IP one IP could monopolise function concurrency. Tighter
  //   than intel-quote (30/min) and intel-search (10/min). Phase 1 D-09
  //   structured-log emit on 429 happens automatically inside rateLimited.
  if (limit) return limit;

  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;
  try {
    // RESEARCH Q3 — saves ~500 ms cold by skipping swiftshader.
    chromium.setGraphicsMode = false;

    // @sparticuz/chromium@148 no longer exposes `defaultViewport` / `headless`
    // as static getters on the chromium object (was true in older versions cited
    // by RESEARCH). The README v148 canonical shape uses literal values inline +
    // `puppeteer.defaultArgs({ args, headless })` for arg composition.
    const VIEWPORT = {
      deviceScaleFactor: 1,
      hasTouch: false,
      height: 1080,
      isLandscape: true,
      isMobile: false,
      width: 1920,
    };
    browser = await puppeteer.launch({
      args: puppeteer.defaultArgs({ args: chromium.args, headless: "shell" }),
      defaultViewport: VIEWPORT,
      executablePath: await chromium.executablePath(),
      headless: "shell",
    });

    const page = await browser.newPage();
    // emulateMediaType('print') makes the runtime CSS evaluate `@media print`
    // queries; printBackground:true on page.pdf() actually draws the bg-image
    // watermark. Both are required.
    await page.emulateMediaType("print");

    const response = await page.goto(`${SITE_URL}/audit`, {
      waitUntil: "networkidle0",
      timeout: 25_000,
    });
    if (!response || !response.ok()) {
      throw new Error(`page.goto failed: ${response?.status()}`);
    }

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true, // triggers @media print SVG-tile watermark
      margin: { top: "1.6cm", right: "1.3cm", bottom: "1.6cm", left: "1.3cm" },
      // matches @page rule in app/globals.css
    });

    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    // page.pdf() returns Uint8Array<ArrayBufferLike>; Response BodyInit (DOM
    // lib) requires ArrayBuffer-backed Uint8Array. Wrapping in Buffer.from()
    // gives us a Node Buffer (which extends Uint8Array<ArrayBuffer>) — accepted
    // by Response without a copy (V8 zero-copy share).
    return new Response(Buffer.from(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="lex-brain-audit-${today}.pdf"`,
        "Cache-Control": "no-store", // Pitfall 4
        "Content-Length": String(pdf.length),
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[audit-pdf] failed: ${msg}`);
    return new Response(
      JSON.stringify({ error: "Неуспешно генериране на PDF" }),
      { status: 500, headers: { "Content-Type": "application/json; charset=utf-8" } },
    );
  } finally {
    if (browser) await browser.close().catch(() => {});
    // ↑ swallow close errors — already in failure path; second throw would mask root cause
  }
}
