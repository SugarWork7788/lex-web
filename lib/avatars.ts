// Avatar system:
//   • `initials` (default) — colored circle with first letter of display_name,
//     palette deterministically derived from userId hash.
//   • `google`  (opt-in)   — Google profile photo, only when the user signed
//     in via OAuth and `auth.users.raw_user_meta_data.avatar_url` is present.
//   • preset id (opt-in)   — Bulgarian historical-figure PNG from PRESET_AVATARS.
//     Files live in `public/avatars/{id}.png`.
//
// `isValidAvatarId` is the single gate; UI and server action both consult it.
// DB column is plain `text` with default `'initials'` — no CHECK constraint,
// so the DB never blocks; the app layer enforces validity.

export type PresetAvatar = {
  id: string;
  file: string;
  name: string;
  description: string;
};

export const PRESET_AVATARS: readonly PresetAvatar[] = [
  { id: "asparuh",         file: "/avatars/asparuh.png",         name: "Хан Аспарух",             description: "Основател на България, 681 г." },
  { id: "simeon-veliki",   file: "/avatars/simeon-veliki.png",   name: "Цар Симеон Велики",       description: "Златен век на Първото царство" },
  { id: "levski",          file: "/avatars/levski.png",          name: "Васил Левски",            description: "Апостолът на свободата" },
  { id: "krum",            file: "/avatars/krum.png",            name: "Хан Крум",                description: "Страшният" },
  { id: "ivan-asen-2",     file: "/avatars/ivan-asen-2.png",     name: "Цар Иван Асен II",        description: "Златен век на Второто царство" },
  { id: "botev",           file: "/avatars/botev.png",           name: "Христо Ботев",            description: "Поет и революционер" },
  { id: "paisiy",          file: "/avatars/paisiy.png",          name: "Паисий Хилендарски",      description: "История Славянобългарска" },
  { id: "boris-1",         file: "/avatars/boris-1.png",         name: "Цар Борис I",             description: "Покръстител на България" },
  { id: "tervel",          file: "/avatars/tervel.png",          name: "Хан Тервел",              description: "Спасител на Константинопол" },
  { id: "teodora",         file: "/avatars/teodora.png",         name: "Царица Теодора",          description: "Последна българска царица" },
  { id: "samuil",          file: "/avatars/samuil.png",          name: "Цар Самуил",              description: "Крепостта на Охрид" },
  { id: "rakovski",        file: "/avatars/rakovski.png",        name: "Георги Раковски",         description: "Революционен стратег" },
  { id: "hadji-dimitar",   file: "/avatars/hadji-dimitar.png",   name: "Хаджи Димитър",           description: "Герой на Бузлуджа" },
  { id: "stambolov",       file: "/avatars/stambolov.png",       name: "Стефан Стамболов",        description: "Министър-председател" },
  { id: "kaloyan",         file: "/avatars/kaloyan.png",         name: "Цар Калоян",              description: "Ромеоубиецът" },
  { id: "kiril-metodiy",   file: "/avatars/kiril-metodiy.png",   name: "Св. Кирил и Методий",     description: "Създатели на азбуката" },
  { id: "hitov",           file: "/avatars/hitov.png",           name: "Панайот Хитов",           description: "Хайдушки войвода" },
  { id: "petar-1",         file: "/avatars/petar-1.png",         name: "Цар Петър I",             description: "Благочестивият владетел" },
  { id: "karavelov",       file: "/avatars/karavelov.png",       name: "Любен Каравелов",         description: "Революционен писател" },
  { id: "benkovski",       file: "/avatars/benkovski.png",       name: "Георги Бенковски",        description: "Командир на Априлското въстание" },
  { id: "omurtag",         file: "/avatars/omurtag.png",         name: "Хан Омуртаг",             description: "Великият строител" },
  { id: "ivan-shishman",   file: "/avatars/ivan-shishman.png",   name: "Цар Иван Шишман",         description: "Последният средновековен цар" },
  { id: "antim-1",         file: "/avatars/antim-1.png",         name: "Екзарх Антим I",          description: "Първият български екзарх" },
  { id: "yane-sandanski",  file: "/avatars/yane-sandanski.png",  name: "Яне Сандански",           description: "Македонско-български герой" },
  { id: "neophit-rilski",  file: "/avatars/neophit-rilski.png",  name: "Неофит Рилски",           description: "Просветител и езиковед" },
  { id: "gotse",           file: "/avatars/gotse.png",           name: "Гоце Делчев",             description: "ВМОРО революционер" },
  { id: "petko-voyvoda",   file: "/avatars/petko-voyvoda.png",   name: "Капитан Петко Войвода",   description: "Легендарен хайдушки войвода" },
  { id: "baba-vida",       file: "/avatars/baba-vida.png",       name: "Баба Вида",               description: "Войнствена кралица на Видин" },
  { id: "vaptsarov",       file: "/avatars/vaptsarov.png",       name: "Никола Вапцаров",         description: "Антифашистки поет мъченик" },
  { id: "dimitrov",        file: "/avatars/dimitrov.png",        name: "Георги Димитров",         description: "Герой на Лайпцигския процес" },
  { id: "yavorov",         file: "/avatars/yavorov.png",         name: "Пею Яворов",              description: "Трагичният романтичен поет" },
  { id: "stamboliyski",    file: "/avatars/stamboliyski.png",    name: "Александър Стамболийски", description: "Земеделски министър-председател" },
  { id: "ivan-vazov",      file: "/avatars/ivan-vazov.png",      name: "Иван Вазов",              description: "Бащата на българската литература" },
  { id: "ivan-rilski",     file: "/avatars/ivan-rilski.png",     name: "Св. Иван Рилски",         description: "Небесен покровител на България" },
  { id: "ferdinand",       file: "/avatars/ferdinand.png",       name: "Цар Фердинанд I",         description: "Обявил независимостта 1908" },
] as const;

export const INITIALS_AVATAR_ID = "initials" as const;
export const GOOGLE_AVATAR_ID = "google" as const;
export const DEFAULT_AVATAR_ID = INITIALS_AVATAR_ID;

export type AvatarOptionId =
  | typeof INITIALS_AVATAR_ID
  | typeof GOOGLE_AVATAR_ID
  | (typeof PRESET_AVATARS)[number]["id"];

const PRESET_IDS: ReadonlySet<string> = new Set(PRESET_AVATARS.map((p) => p.id));
const VALID_IDS: ReadonlySet<string> = new Set<string>([
  INITIALS_AVATAR_ID,
  GOOGLE_AVATAR_ID,
  ...PRESET_AVATARS.map((p) => p.id),
]);

export function isValidAvatarId(id: string | null | undefined): id is AvatarOptionId {
  return typeof id === "string" && VALID_IDS.has(id);
}

export function isPresetAvatarId(id: string | null | undefined): boolean {
  return typeof id === "string" && PRESET_IDS.has(id);
}

export function getPresetAvatar(id: string | null | undefined): PresetAvatar | null {
  if (!id) return null;
  return PRESET_AVATARS.find((p) => p.id === id) ?? null;
}

// ── Initials avatar primitives ────────────────────────────────────────────

// Eight color pairs (bg + text) chosen for legibility on both light + dark
// surfaces. Matches the /audit + /intel card palette.
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
