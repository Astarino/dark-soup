import { VIEWS, normalizeView, toggledView, normalizeFpSettings } from "./data/view-mode.js";
import { FP } from "./data/first-person.js";
// Переключатель видов. Владеет только отображением и вводом: игру (createGame)
// не вызывает вообще, поэтому смена вида не может изменить забег, паузу, время,
// врагов, способности, опыт или статистику. Ресурсы вида от первого лица
// создаются при включении и освобождаются при выключении.
//
// Зависимости передаются снаружи (main.js собирает реальные, тесты — фальшивые):
//   top:   { show(), hide(), render(snapshot, ctx) }         — вид сверху
//   loadFirstPerson: () => Promise<{ mount(host, opts), setSettings }> — ленивая загрузка
//   input: общий ввод; firstPersonInput: ввод первого лица (attach/detach/…)
export function createViewController({ preferences, top, loadFirstPerson, host, input, firstPersonInput, getState, onChange = () => {}, reducedMotion = false }) {
  let mode = normalizeView(preferences.view());
  // Пока игрок сам не выбрал, покачивание выключено у тех, кто просит меньше движения.
  const savedFp = preferences.firstPerson();
  let fpSettings = normalizeFpSettings(reducedMotion && typeof savedFp?.sway !== "boolean" ? { ...savedFp, sway: false } : savedFp);
  let fp = null, // созданный (но не обязательно включённый) рендер первого лица
    mounted = null, // результат mount() — только пока вид включён
    busy = false,
    prevState = null,
    lastTime = 0;
  let failure = null;

  async function enableFirst() {
    if (!fp) {
      const mod = await loadFirstPerson();
      fp = await mod.create(fpSettings);
    }
    fp.setSettings(fpSettings);
    if (mounted) return;
    mounted = fp.mount(host, { onContextLost: () => fallback() });
    top.hide();
    firstPersonInput.attach(mounted.canvas, { onLockLost: () => onLockLost() });
  }
  function disableFirst() {
    if (!mounted) return;
    firstPersonInput.detach();
    mounted.unmount();
    mounted = null;
    top.show();
  }
  let lockLostHandler = () => {};
  const onLockLost = () => lockLostHandler();

  // Потеря WebGL-контекста: возвращаемся к виду сверху, но выбор игрока не стираем.
  function fallback() {
    failure = "context";
    disableFirst();
    mode = VIEWS.top;
    onChange(mode, { failed: true });
  }

  return {
    get mode() {
      return mode;
    },
    get failure() {
      return failure;
    },
    fpSettings: () => ({ ...fpSettings }),
    setFpSettings(patch) {
      fpSettings = normalizeFpSettings({ ...fpSettings, ...patch });
      preferences.saveFirstPerson(fpSettings);
      fp?.setSettings(fpSettings);
    },
    // Начальный вид при запуске приложения: сохранённый выбор или вид сверху.
    async init() {
      if (mode === VIEWS.first) {
        try {
          await enableFirst();
        } catch (e) {
          console.warn("First-person view unavailable:", e);
          disableFirst();
          mode = VIEWS.top;
          failure = "init";
        }
      }
      return mode;
    },
    // Смена вида по правильному коду. Возвращает { ok, mode }.
    async toggle() {
      if (busy) return { ok: false, busy: true, mode };
      busy = true;
      try {
        const next = toggledView(mode);
        if (next === VIEWS.first) {
          try {
            await enableFirst();
          } catch (e) {
            console.warn("First-person view unavailable:", e);
            disableFirst();
            return { ok: false, mode };
          }
        } else disableFirst();
        mode = next;
        failure = null;
        preferences.saveView(mode);
        onChange(mode, { failed: false });
        return { ok: true, mode };
      } finally {
        busy = false;
      }
    },
    // Ввод: вектор движения для game.step().
    moveVector(dt) {
      if (mode === VIEWS.first && mounted) {
        firstPersonInput.update(dt);
        return firstPersonInput.vector();
      }
      return input.vector();
    },
    render(snapshot, ctx) {
      if (mode === VIEWS.first && mounted) {
        const st = snapshot.state;
        // Новый забег — взгляд снова на лагерь.
        if (st === "intro" && prevState !== "intro") firstPersonInput.setLook(FP.startYaw, 0);
        else if (st === "levelup" && snapshot.firstPick && prevState !== "levelup") firstPersonInput.setLook(FP.startYaw, 0);
        prevState = st;
        lastTime = snapshot.time;
        // Паузу, выбор улучшения, конец забега и меню нужно кликать мышью: курсор свободен.
        if (st !== "play") firstPersonInput.releaseLock();
        return mounted.render(snapshot, { ...ctx, look: firstPersonInput.look, input: firstPersonInput.state() });
      }
      prevState = snapshot.state;
      return top.render(snapshot, ctx);
    },
    clearPointer() {
      input.clearPointer();
      firstPersonInput.releaseLock();
    },
    requestLock() {
      if (mode === VIEWS.first && mounted && getState() === "play") firstPersonInput.requestLock();
    },
    onLockLost(handler) {
      lockLostHandler = handler;
    },
    // Слушатель для звука: относительно взгляда, а не сторон света.
    listenerYaw: () => (mode === VIEWS.first && mounted ? firstPersonInput.look.yaw : null),
    get renderer() {
      return mounted;
    },
    get lastTime() {
      return lastTime;
    },
  };
}
