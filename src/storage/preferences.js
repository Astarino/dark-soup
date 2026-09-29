// Keep the original keys: there is no saved run, only language and best time.
export function createPreferences(storage) {
  const read = (key, fallback) => {
    try {
      return storage?.getItem(key) ?? fallback;
    } catch {
      return fallback;
    }
  };
  const write = (key, value) => {
    try {
      storage?.setItem(key, String(value));
    } catch {}
  };
  return {
    language: () => (read("dark_soup_language", "ru") === "en" ? "en" : "ru"),
    best: () => +read("cauldron_best", 0) || 0,
    saveLanguage: (value) => write("dark_soup_language", value),
    saveBest: (value) => write("cauldron_best", value),
    sound: () => read("dark_soup_sound", "1") !== "0",
    saveSound: (on) => write("dark_soup_sound", on ? "1" : "0"),
    // Громкость категорий 0–100: костёр, мобы, удары.
    volumes: () => {
      try {
        const v = JSON.parse(read("dark_soup_volume", "{}"));
        const pick = (x) => (Number.isFinite(x) ? Math.max(0, Math.min(100, x)) : 70);
        return { fire: pick(v.fire), mobs: pick(v.mobs), hits: pick(v.hits) };
      } catch {
        return { fire: 70, mobs: 70, hits: 70 };
      }
    },
    saveVolumes: (v) => write("dark_soup_volume", JSON.stringify(v)),
    // Вид (сверху / от первого лица) и настройки первого лица: отдельные ключи,
    // не связанные с игровыми характеристиками и статистикой.
    // Значения отдаются как есть: слой storage ничего не знает о данных игры,
    // проверку и значения по умолчанию делает data/view-mode.js.
    view: () => read("dark_soup_view", null),
    saveView: (value) => write("dark_soup_view", value),
    firstPerson: () => {
      try {
        return JSON.parse(read("dark_soup_fp", "{}"));
      } catch {
        return {};
      }
    },
    saveFirstPerson: (settings) => write("dark_soup_fp", JSON.stringify(settings)),
  };
}
