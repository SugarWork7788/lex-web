// Bulgarian historical-figure preset avatars.
// Files live in public/avatars/{id}.png and ship via Next 16 static asset path.
// 30 figures in PRESET_AVATARS; 5 extra PNGs (hitov, petar-1, karavelov,
// neophit-rilski, ivan-alexander) are downloaded to public/avatars/ but not
// surfaced — add them here if you want them in the grid.

export type PresetAvatar = {
  id: string;
  file: string;
  name: string;
  description: string;
};

export const PRESET_AVATARS: readonly PresetAvatar[] = [
  { id: "asparuh",        file: "/avatars/asparuh.png",        name: "Хан Аспарух",                  description: "Основател на България, 681 г." },
  { id: "simeon-veliki",  file: "/avatars/simeon-veliki.png",  name: "Цар Симеон Велики",            description: "Златен век на Първото царство" },
  { id: "levski",         file: "/avatars/levski.png",         name: "Васил Левски",                 description: "Апостолът на свободата" },
  { id: "krum",           file: "/avatars/krum.png",           name: "Хан Крум",                     description: "Страшният" },
  { id: "ivan-asen-2",    file: "/avatars/ivan-asen-2.png",    name: "Цар Иван Асен II",             description: "Златен век на Второто царство" },
  { id: "botev",          file: "/avatars/botev.png",          name: "Христо Ботев",                 description: "Поет и революционер" },
  { id: "paisiy",         file: "/avatars/paisiy.png",         name: "Паисий Хилендарски",           description: "История Славянобългарска" },
  { id: "boris-1",        file: "/avatars/boris-1.png",        name: "Цар Борис I",                  description: "Покръстител на България" },
  { id: "tervel",         file: "/avatars/tervel.png",         name: "Хан Тервел",                   description: "Спасител на Константинопол" },
  { id: "teodora",        file: "/avatars/teodora.png",        name: "Царица Теодора",               description: "Последна българска царица" },
  { id: "samuil",         file: "/avatars/samuil.png",         name: "Цар Самуил",                   description: "Крепостта на Охрид" },
  { id: "rakovski",       file: "/avatars/rakovski.png",       name: "Георги Раковски",              description: "Революционен стратег" },
  { id: "hadji-dimitar",  file: "/avatars/hadji-dimitar.png",  name: "Хаджи Димитър",                description: "Герой на Бузлуджа" },
  { id: "stambolov",      file: "/avatars/stambolov.png",      name: "Стефан Стамболов",             description: "Министър-председател" },
  { id: "kaloyan",        file: "/avatars/kaloyan.png",        name: "Цар Калоян",                   description: "Ромеоубиецът" },
  { id: "kiril-metodiy",  file: "/avatars/kiril-metodiy.png",  name: "Св. Кирил и Методий",          description: "Създатели на азбуката" },
  { id: "benkovski",      file: "/avatars/benkovski.png",      name: "Георги Бенковски",             description: "Командир на Априлското въстание" },
  { id: "omurtag",        file: "/avatars/omurtag.png",        name: "Хан Омуртаг",                  description: "Великият строител" },
  { id: "ivan-shishman",  file: "/avatars/ivan-shishman.png",  name: "Цар Иван Шишман",              description: "Последният средновековен цар" },
  { id: "antim-1",        file: "/avatars/antim-1.png",        name: "Екзарх Антим I",               description: "Първият български екзарх" },
  { id: "petko-voyvoda",  file: "/avatars/petko-voyvoda.png",  name: "Капитан Петко Войвода",        description: "Легендарен хайдушки войвода" },
  { id: "baba-vida",      file: "/avatars/baba-vida.png",      name: "Баба Вида",                    description: "Войнствена кралица на Видин" },
  { id: "vaptsarov",      file: "/avatars/vaptsarov.png",      name: "Никола Вапцаров",              description: "Антифашистки поет мъченик" },
  { id: "ivan-vazov",     file: "/avatars/ivan-vazov.png",     name: "Иван Вазов",                   description: "Бащата на българската литература" },
  { id: "gotse",          file: "/avatars/gotse.png",          name: "Гоце Делчев",                  description: "ВМОРО революционер" },
  { id: "yavorov",        file: "/avatars/yavorov.png",        name: "Пею Яворов",                   description: "Трагичният романтичен поет" },
  { id: "stamboliyski",   file: "/avatars/stamboliyski.png",   name: "Александър Стамболийски",      description: "Земеделски министър-председател" },
  { id: "dimitrov",       file: "/avatars/dimitrov.png",       name: "Георги Димитров",              description: "Герой на Лайпцигския процес" },
  { id: "ivan-rilski",    file: "/avatars/ivan-rilski.png",    name: "Св. Иван Рилски",              description: "Небесен покровител на България" },
  { id: "ferdinand",      file: "/avatars/ferdinand.png",      name: "Цар Фердинанд I",              description: "Обявил независимостта 1908" },
] as const;

export const DEFAULT_AVATAR_ID = "asparuh";

export function getAvatarById(id: string | null | undefined): PresetAvatar {
  if (!id) return PRESET_AVATARS[0];
  return PRESET_AVATARS.find((a) => a.id === id) ?? PRESET_AVATARS[0];
}

// Special "use my Google avatar" sentinel — when avatar_id === GOOGLE_AVATAR_ID,
// the UI reads raw_user_meta_data.avatar_url from auth.users and shows that
// instead of one of the preset PNGs. Falls back to default if no avatar_url.
export const GOOGLE_AVATAR_ID = "google";
