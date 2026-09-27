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
  };
}
