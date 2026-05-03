export type CategoryKey =
  | "konstitutsiya"
  | "kodeksi"
  | "zakoni"
  | "naredbi"
  | "pravilnitsi"
  | "pravilnitsi-po-prilagane";

export const CATEGORIES: { key: CategoryKey; name_bg: string; level: number }[] = [
  { key: "konstitutsiya", name_bg: "Конституция", level: 0 },
  { key: "kodeksi", name_bg: "Кодекси", level: 1 },
  { key: "zakoni", name_bg: "Закони", level: 2 },
  { key: "naredbi", name_bg: "Наредби", level: 3 },
  { key: "pravilnitsi", name_bg: "Правилници", level: 4 },
  { key: "pravilnitsi-po-prilagane", name_bg: "Правилници по прилагане", level: 5 },
];

export const CATEGORY_BY_KEY = Object.fromEntries(
  CATEGORIES.map((c) => [c.key, c]),
) as Record<CategoryKey, (typeof CATEGORIES)[number]>;

export function isCategoryKey(value: string): value is CategoryKey {
  return value in CATEGORY_BY_KEY;
}
