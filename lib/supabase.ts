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
