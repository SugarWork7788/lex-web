// Avatar system: initials-fallback by default + Google profile photo opt-in.
//
// Preset PNG avatars were removed (commit history shows the prior 30-figure
// registry was wrong — image URLs and Bulgarian historical-figure names did
// not match). Restore via a future re-curation; for now every user gets a
// deterministic colored-circle-with-initial unless they explicitly choose
// the 'google' option (only available for Google OAuth signups).

export type AvatarOptionId = "initials" | "google";

export const DEFAULT_AVATAR_ID: AvatarOptionId = "initials";

// Special "use my Google avatar" sentinel — when avatar_id === GOOGLE_AVATAR_ID,
// the UI reads raw_user_meta_data.avatar_url from auth.users and shows that
// instead of the initials circle. Falls back to initials if no avatar_url.
export const GOOGLE_AVATAR_ID: AvatarOptionId = "google";

const VALID_IDS: ReadonlySet<string> = new Set([DEFAULT_AVATAR_ID, GOOGLE_AVATAR_ID]);

export function isValidAvatarId(id: string | null | undefined): id is AvatarOptionId {
  return typeof id === "string" && VALID_IDS.has(id);
}

// ── Initials avatar primitives ────────────────────────────────────────────

// Eight color pairs (bg + text) chosen for legibility on both light + dark
// surfaces. Stone-700 text on a light tint is the canonical site palette
// (matches /audit + /intel cards).
const INITIALS_PALETTE: readonly { bg: string; text: string }[] = [
  { bg: "bg-red-100 dark:bg-red-950/60", text: "text-red-800 dark:text-red-200" },
  { bg: "bg-amber-100 dark:bg-amber-950/60", text: "text-amber-800 dark:text-amber-200" },
  { bg: "bg-emerald-100 dark:bg-emerald-950/60", text: "text-emerald-800 dark:text-emerald-200" },
  { bg: "bg-sky-100 dark:bg-sky-950/60", text: "text-sky-800 dark:text-sky-200" },
  { bg: "bg-indigo-100 dark:bg-indigo-950/60", text: "text-indigo-800 dark:text-indigo-200" },
  { bg: "bg-fuchsia-100 dark:bg-fuchsia-950/60", text: "text-fuchsia-800 dark:text-fuchsia-200" },
  { bg: "bg-teal-100 dark:bg-teal-950/60", text: "text-teal-800 dark:text-teal-200" },
  { bg: "bg-stone-200 dark:bg-stone-800", text: "text-stone-800 dark:text-stone-200" },
];

// Stable string→int hash (FNV-1a-ish; not cryptographic, just stable+fast).
// Produces the same number for the same userId across renders + sessions.
function hashUserId(userId: string): number {
  let h = 2166136261;
  for (let i = 0; i < userId.length; i++) {
    h ^= userId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function getInitialsPalette(userId: string): { bg: string; text: string } {
  const idx = hashUserId(userId) % INITIALS_PALETTE.length;
  return INITIALS_PALETTE[idx];
}

// First grapheme of display_name (Cyrillic-aware via Intl.Segmenter when
// available, falls back to charAt(0) which is fine for BMP characters).
export function getInitial(displayName: string | null | undefined): string {
  if (!displayName) return "?";
  const trimmed = displayName.trim();
  if (!trimmed) return "?";
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const segmenter = new (Intl as { Segmenter: new (l?: string, o?: { granularity: string }) => { segment(s: string): Iterable<{ segment: string }> } }).Segmenter("bg", { granularity: "grapheme" });
    const first = segmenter.segment(trimmed)[Symbol.iterator]().next();
    if (!first.done) return first.value.segment.toUpperCase();
  }
  return trimmed.charAt(0).toUpperCase();
}
