import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local",
  );
}

export const supabase = createClient(url, key, {
  auth: { persistSession: false },
});

export type Law = {
  slug: string;
  name_bg: string;
  category: string;
  level: number;
  level_name: string | null;
  article_count: number;
  url: string;
};

export type LawArticle = {
  law_slug: string;
  ordinal: number;
  chapter_title: string | null;
  section_title: string | null;
  article_number: string;
  text_content: string;
};

export type CrossReference = {
  from_slug: string;
  from_article: string | null;
  to_slug: string | null;
  raw_text: string;
  matched: boolean;
};

export type Severity = "нисък" | "среден" | "висок";

export type StoredAnalysis = {
  id: string;
  law_slug: string;
  law_name_bg: string;
  analyzed_at: string;
  laws_analyzed: number;
  duration_seconds: number | null;
  total_issues: number;
  issues_high: number;
  issues_medium: number;
  issues_low: number;
};

export type StoredIssue = {
  id: string;
  analysis_id: string;
  law_slug: string;
  type: string;
  severity: Severity;
  explanation: string;
  primary_law_slug: string;
  primary_articles: string[];
  conflicting_law_slug: string | null;
  conflicting_articles: string[];
  quote_primary: string | null;
  quote_conflicting: string | null;
  verified: boolean | null;
  refined_explanation: string | null;
  created_at: string;
};

export type StoredAlert = {
  id: string;
  email: string;
  law_slug: string;
  law_name_bg: string;
  confirmed: boolean;
  token: string;
  created_at: string;
};
