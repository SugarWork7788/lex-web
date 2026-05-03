import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const slug = url.searchParams.get("slug")?.trim();
  const limitParam = url.searchParams.get("limit");
  const limit = Math.min(20, Math.max(1, Number(limitParam) || 6));

  if (!slug) {
    return NextResponse.json({ error: "missing slug" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("court_decisions")
    .select(
      "id,court,court_code,act_type,case_number,decision_number,decision_date,year,title,source_url",
    )
    .contains("cited_law_slugs", [slug])
    .order("decision_date", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}
