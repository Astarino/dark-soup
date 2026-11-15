// Режим отображения — настройка вида, а не часть забега. Скрытый переключатель:
// кнопка «change» в настройках просит код и меняет вид. Код не защищает данные.
export const VIEWS = Object.freeze({ top: "top", first: "first" });
export const VIEW_CODE = "1234";
export const DEFAULT_VIEW = VIEWS.top;

export const normalizeView = (value) => (value === VIEWS.first ? VIEWS.first : VIEWS.top);
export const toggledView = (view) => (view === VIEWS.first ? VIEWS.top : VIEWS.first);
export const isViewCode = (text) => String(text ?? "").trim() === VIEW_CODE;

// Настройки вида от первого лица. Значения хранятся отдельно от игровых характеристик.
export const FP_QUALITY = Object.freeze(["high", "medium", "low"]);
export const FP_DEFAULTS = Object.freeze({
  sensitivity: 1, // множитель к базовой чувствительности мыши/касания
  sway: true, // покачивание и лёгкая тряска камеры
  quality: "high", // только разрешение и дальность прорисовки
});
export const normalizeFpSettings = (raw) => {
  const s = raw && typeof raw === "object" ? raw : {};
  const sens = Number(s.sensitivity);
  return {
    sensitivity: Number.isFinite(sens) ? Math.min(3, Math.max(0.2, sens)) : FP_DEFAULTS.sensitivity,
    sway: typeof s.sway === "boolean" ? s.sway : FP_DEFAULTS.sway,
    quality: FP_QUALITY.includes(s.quality) ? s.quality : FP_DEFAULTS.quality,
  };
};
