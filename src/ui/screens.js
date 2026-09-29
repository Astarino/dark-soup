import { createRecipeBook } from "./recipe-book.js";
import { ENEMY_TYPES } from "../data/balance.js";
import { UPG, HEAL } from "../systems/upgrades.js";
import { ICON } from "../render/sprites.js";
import { mk } from "../render/pixels.js";
import { describeUpgrade } from "./descriptions.js";
import { paintIcons, soupStateHtml, runSummaryHtml, statsHtml } from "./info-screens.js";
import { VIEWS, isViewCode } from "../data/view-mode.js";
// sound — управление звуком из main (UI не зависит от аудиомодуля);
// statsStore — сохранение статистики между забегами.
export function createUI(
  game,
  input,
  translator,
  preferences,
  resetFrameTime,
  sound = { enabled: () => false, set() {}, volumes: () => ({ fire: 70, mobs: 70, hits: 70 }), setVolumes() {}, preview() {} },
  statsStore = { load: () => ({ runs: 0 }), recordRun: () => ({ isRecord: false }) },
  // Скрытый переключатель вида: current() — «top»/«first»; toggle() — асинхронно
  // меняет вид и возвращает { ok }; fp/setFp — настройки вида от первого лица.
  viewControl = {
    current: () => VIEWS.top,
    toggle: async () => ({ ok: true }),
    fp: () => ({ sensitivity: 1, sway: true, quality: "high" }),
    setFp() {},
  },
) {
  const $ = (id) => document.getElementById(id);
  const { tr } = translator;
  const { openRecipeBook, closeRecipeBook, turnRecipePage, renderRecipeBook } =
    createRecipeBook(tr);
  let LANG = translator.language,
    best = preferences.best();
  let snap,
    player,
    state,
    choices,
    previous = "",
    previousChoices = "",
    lastSummary = null;
  const PANELS = ["menu", "over", "pause", "settings", "recipeBook", "levelup", "soundPanel", "statsPanel", "codeModal"];

  $("startBtn").onclick = playFromMenu;
  $("restartBtn").onclick = startRun;
  $("quitBtn").onclick = startRun;
  $("resumeBtn").onclick = () => setPause(false);
  $("pauseBtn").onclick = () => setPause(true);
  $("pauseMenuBtn").onclick = toMainMenu;
  $("overMenuBtn").onclick = toMainMenu;
  $("statsBtn").onclick = () => openOverlay("statsPanel", "menu", renderStats);
  $("menuSoundBtn").onclick = () => openOverlay("soundPanel", "menu", renderSound);
  $("pauseSoundBtn").onclick = () => openOverlay("soundPanel", "pause", renderSound);
  $("menuSettingsBtn").onclick = () => openOverlay("settings", "menu", renderSettingsCatalog);
  $("pauseSettingsBtn").onclick = () => openOverlay("settings", "pause", renderSettingsCatalog);
  $("settingsBackBtn").onclick = closeOverlay;
  $("soundBackBtn").onclick = closeOverlay;
  $("statsBackBtn").onclick = closeOverlay;
  $("ruBtn").onclick = () => setLanguage("ru");
  $("enBtn").onclick = () => setLanguage("en");
  $("soundOnBtn").onclick = () => setSound(true);
  $("soundOffBtn").onclick = () => setSound(false);
  $("recipeBookBtn").onclick = openRecipeBook;
  $("viewChangeBtn").onclick = openCodeModal;
  $("codeOkBtn").onclick = confirmCode;
  $("codeCancelBtn").onclick = closeCodeModal;
  $("codeModal").onclick = (e) => {
    if (e.target === $("codeModal")) closeCodeModal();
  };
  // Окно кода перехватывает клавиши: Enter подтверждает, Escape закрывает только его.
  $("codeModal").addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Enter") {
      e.preventDefault();
      confirmCode();
    } else if (e.key === "Escape") {
      e.preventDefault();
      closeCodeModal();
    } else if (e.key === "Tab") {
      const items = [$("codeInput"), $("codeOkBtn"), $("codeCancelBtn")],
        at = items.indexOf(document.activeElement);
      e.preventDefault();
      items[(at + (e.shiftKey ? items.length - 1 : 1)) % items.length].focus();
    }
  });
  $("codeInput").oninput = () => {
    $("codeInput").removeAttribute("aria-invalid");
    $("codeError").textContent = "";
  };
  $("fpSens").oninput = () => {
    $("fpSensOut").textContent = `${(+$("fpSens").value).toFixed(1)}×`;
    viewControl.setFp({ sensitivity: +$("fpSens").value });
  };
  $("fpSwayOn").onclick = () => setFpOption({ sway: true });
  $("fpSwayOff").onclick = () => setFpOption({ sway: false });
  $("fpQHigh").onclick = () => setFpOption({ quality: "high" });
  $("fpQMedium").onclick = () => setFpOption({ quality: "medium" });
  $("fpQLow").onclick = () => setFpOption({ quality: "low" });
  $("bookCloseBtn").onclick = closeRecipeBook;
  $("bookPrevBtn").onclick = () => turnRecipePage(-1);
  $("bookNextBtn").onclick = () => turnRecipePage(1);
  $("recipeBook").onclick = (e) => {
    if (e.target === $("recipeBook")) closeRecipeBook();
  };
  // Шкалы громкости: костёр, мобы, удары (0–100, 70 — задуманный уровень).
  const SLIDERS = [
    ["volFire", "fire"],
    ["volMobs", "mobs"],
    ["volHits", "hits"],
  ];
  for (const [id, key] of SLIDERS) {
    $(id).oninput = () => {
      const v = +$(id).value;
      $(`${id}Out`).textContent = `${v}%`;
      sound.setVolumes({ [key]: v });
    };
    $(id).onchange = () => {
      preferences.saveVolumes(sound.volumes());
      if (key !== "fire") sound.preview(key);
    };
  }

  // Второстепенные окна открываются поверх меню или паузы и возвращают к ним.
  let overlayReturn = "menu",
    openOverlayId = null;
  function openOverlay(id, from, render) {
    overlayReturn = from;
    openOverlayId = id;
    $(from).classList.remove("show");
    render?.();
    $(id).classList.add("show");
  }
  function closeOverlay() {
    if (!openOverlayId) return;
    $(openOverlayId).classList.remove("show");
    openOverlayId = null;
    $(overlayReturn).classList.add("show");
    if (overlayReturn === "pause") renderSoupState();
  }
  // ── Скрытый переключатель вида ──
  let codeOpen = false,
    statusTimer = 0;
  function openCodeModal() {
    codeOpen = true;
    $("codeInput").value = "";
    $("codeInput").removeAttribute("aria-invalid");
    $("codeError").textContent = "";
    $("codeModal").classList.remove("shake");
    $("codeModal").classList.add("show");
    $("codeInput").focus();
  }
  function closeCodeModal() {
    if (!codeOpen) return;
    codeOpen = false;
    $("codeModal").classList.remove("show");
    $("viewChangeBtn").focus();
  }
  function showViewStatus(text, isError = false, keep = false) {
    clearTimeout(statusTimer);
    $("viewStatus").textContent = text;
    $("viewStatus").classList.toggle("err", isError);
    if (text && !keep) statusTimer = setTimeout(() => ($("viewStatus").textContent = ""), 3500);
  }
  async function confirmCode() {
    if (!codeOpen) return;
    if (!isViewCode($("codeInput").value)) {
      // Неверный код ничего не переключает.
      $("codeError").textContent = tr("codeWrong");
      $("codeInput").setAttribute("aria-invalid", "true");
      $("codeModal").classList.remove("shake");
      void $("codeModal").offsetWidth;
      $("codeModal").classList.add("shake");
      $("codeInput").focus();
      $("codeInput").select();
      return;
    }
    closeCodeModal();
    showViewStatus(tr("viewLoading"), false, true);
    const result = await viewControl.toggle();
    renderFpSettings();
    if (result?.ok === false) showViewStatus(tr("viewFailed"), true);
    else showViewStatus(tr("viewChanged"));
  }
  function setFpOption(patch) {
    viewControl.setFp(patch);
    renderFpSettings();
  }
  function renderMenuHint() {
    const html = tr(viewControl.current() === VIEWS.first ? "menuHintFp" : "menuHint");
    if ($("menuHint").innerHTML !== html) $("menuHint").innerHTML = html;
  }
  function renderFpSettings() {
    renderMenuHint();
    const on = viewControl.current() === VIEWS.first;
    $("fpSettings").hidden = !on;
    if (!on) return;
    const fp = viewControl.fp();
    $("fpSens").value = fp.sensitivity;
    $("fpSensOut").textContent = `${fp.sensitivity.toFixed(1)}×`;
    $("fpSwayOn").classList.toggle("selected", fp.sway);
    $("fpSwayOff").classList.toggle("selected", !fp.sway);
    for (const [id, q] of [["fpQHigh", "high"], ["fpQMedium", "medium"], ["fpQLow", "low"]])
      $(id).classList.toggle("selected", fp.quality === q);
  }
  function setLanguage(next) {
    translator.setLanguage(next);
    LANG = translator.language;
    preferences.saveLanguage(LANG);
    applyLanguage();
  }
  function setSound(on) {
    sound.set(on);
    renderSound();
  }
  function renderSound() {
    $("soundOnBtn").classList.toggle("selected", sound.enabled());
    $("soundOffBtn").classList.toggle("selected", !sound.enabled());
    const v = sound.volumes();
    for (const [id, key] of SLIDERS) {
      $(id).value = v[key];
      $(`${id}Out`).textContent = `${v[key]}%`;
    }
  }
  function renderStats() {
    // Рекорд времени мог появиться до статистики (старый ключ cauldron_best).
    const stats = statsStore.load();
    stats.bestTime = Math.max(stats.bestTime, best);
    $("statsContent").innerHTML = statsHtml(stats, tr, LANG);
    paintIcons($("statsContent"));
  }
  function renderSoupState() {
    if (!snap) return;
    $("soupState").innerHTML = soupStateHtml(snap, game.runStats(), tr);
    paintIcons($("soupState"));
  }
  const TEXTS = {
    menuIntro: "menuIntro",
    startBtn: "play",
    statsBtn: "statistics",
    menuSoundBtn: "sound",
    menuSettingsBtn: "settings",
    pauseTitle: "soupState",
    resumeBtn: "resume",
    pauseSoundBtn: "sound",
    pauseSettingsBtn: "settings",
    quitBtn: "restart",
    pauseMenuBtn: "mainMenu",
    overTitle: "over",
    restartBtn: "retry",
    overMenuBtn: "mainMenu",
    settingsTitle: "settingsTitle",
    languageTitle: "language",
    soundTitle: "sound",
    soundOnBtn: "soundOn",
    soundOffBtn: "soundOff",
    volFireLabel: "volFire",
    volMobsLabel: "volMobs",
    volHitsLabel: "volHits",
    soundHint: "soundHint",
    soundBackBtn: "back",
    statsTitle: "statistics",
    statsBackBtn: "back",
    ruBtn: "russian",
    enBtn: "english",
    enemyTitle: "enemies",
    recipeTitle: "recipes",
    settingsBackBtn: "back",
    recipeCoverTitle: "coverTitle",
    recipeCoverHint: "coverHint",
    bookTitle: "coverTitle",
    bookCloseBtn: "closeBook",
    bookPrevBtn: "prevPage",
    bookNextBtn: "nextPage",
    codeTitle: "codeTitle",
    codeOkBtn: "codeConfirm",
    codeCancelBtn: "codeCancel",
    fpTitle: "fpTitle",
    fpSensLabel: "fpSensitivity",
    fpSwayOn: "fpSwayOn",
    fpSwayOff: "fpSwayOff",
    fpQualityTitle: "fpQualityTitle",
    fpQHigh: "fpQHigh",
    fpQMedium: "fpQMedium",
    fpQLow: "fpQLow",
    fpControlsHint: "fpControlsHint",
  };
  function applyLanguage() {
    document.documentElement.lang = LANG;
    document.title = "Dark Soup";
    for (const [id, key] of Object.entries(TEXTS)) $(id).textContent = tr(key);
    renderMenuHint();
    $("recipeBookBtn").setAttribute("aria-label", tr("openRecipes"));
    $("ruBtn").classList.toggle("selected", LANG === "ru");
    $("enBtn").classList.toggle("selected", LANG === "en");
    $("pauseBtn").setAttribute("aria-label", tr("pause"));
    renderSound();
    if ($("settings").classList.contains("show")) renderSettingsCatalog();
    if ($("recipeBook").classList.contains("show")) renderRecipeBook();
    if ($("statsPanel").classList.contains("show")) renderStats();
    if ($("pause").classList.contains("show")) renderSoupState();
    if ($("over").classList.contains("show") && lastSummary) showSummary();
  }
  function renderSettingsCatalog() {
    renderFpSettings();
    $("enemyList").innerHTML = Object.entries(ENEMY_TYPES)
      .map(
        ([id, e]) =>
          `<article class="catalogCard"><div><b>${tr(`mob_${id}`)}</b><p>${tr(`mob_${id}_desc`)}</p><span class="meta">${tr("hp")} ${e.hp} · ${tr("speed")} ${e.spd} · ${tr("damage")} ${e.dmg} · ${tr("xp")} ${e.xp}</span></div></article>`,
      )
      .join("");
    [...$("recipeBookBtn").querySelectorAll("canvas")].forEach((canvas, i) => {
      canvas.getContext("2d").drawImage(ICON[UPG[i].id], 0, 0);
    });
  }
  applyLanguage();

  function hideAll() {
    for (const id of PANELS) $(id).classList.remove("show");
    openOverlayId = null;
    codeOpen = false;
  }
  // ИГРАТЬ из главного меню: меню растворяется, камера плывёт к котлу.
  function playFromMenu() {
    if (state !== "menu") return;
    $("menu").classList.add("leaving");
    setTimeout(() => {
      hideAll();
      $("menu").classList.remove("leaving");
    }, 450);
    game.start({ intro: true });
    previous = "";
    sync();
    resetFrameTime();
  }
  function startRun() {
    recordFinishedRun();
    hideAll();
    game.start();
    previous = "";
    sync();
    resetFrameTime();
  }
  function toMainMenu() {
    recordFinishedRun();
    hideAll();
    game.toMenu();
    previous = "";
    sync();
    resetFrameTime();
  }
  function setPause(on) {
    game.pause(on);
    sync();
    if (on) input.clearPointer();
    else resetFrameTime();
  }
  function pick(i) {
    if (game.choose(i)) {
      sync();
      resetFrameTime();
    }
  }
  function openLevelUp(first) {
    input.clearPointer();
    $("luTitle").textContent = first ? tr("firstPick") : `${tr("level")} ${player.lvl}!`;
    $("luSub").textContent = first ? tr("chooseFirst") : tr("chooseUpgrade");
    const box = $("cards");
    box.innerHTML = "";
    choices.forEach((u, i) => {
      const lv = player.lv[u.id] || 0;
      const b = document.createElement("button");
      b.className = "card";
      const ic = mk(12, 12);
      ic.getContext("2d").drawImage(ICON[u.id], 0, 0);
      const tag =
        u.kind === "heal"
          ? `<span class="tag">${tr("treatment")}</span>`
          : lv === 0
            ? `<span class="tag new">${tr("new")}</span>`
            : `<span class="tag">${LANG === "ru" ? "ур." : "lv."}${lv} > ${lv + 1}</span>`;
      b.innerHTML = `<div class="txt"><span class="nm">${tr(u.name)}</span>${tag}<span class="ds">${describeUpgrade(u, lv, tr)}</span><span class="key">[${i + 1}]</span></div>`;
      b.prepend(ic);
      b.onclick = () => pick(i);
      box.appendChild(b);
    });
    $("levelup").classList.add("show");
  }
  // Конец готовки: запись в статистику и итоги со всем составом супа.
  function recordFinishedRun() {
    const run = game.finishRun();
    if (!run) return;
    const { isRecord } = statsStore.recordRun(run);
    if (run.time > best) {
      best = run.time;
      preferences.saveBest(best);
    }
    lastSummary = { run, isRecord };
  }
  function gameOver() {
    $("pauseBtn").style.display = "none";
    recordFinishedRun();
    showSummary();
    $("over").classList.add("show");
  }
  function showSummary() {
    $("runSummary").innerHTML = runSummaryHtml(lastSummary.run, tr, { isRecord: lastSummary.isRecord, bestTime: best });
    paintIcons($("runSummary"));
  }

  function sync(snapshot = game.snapshot()) {
    snap = snapshot;
    renderMenuHint(); // вид мог включиться после загрузки (сохранённый выбор)
    ({ player, state } = snapshot);
    choices = snapshot.choices.map((id) => [...UPG, HEAL].find((u) => u.id === id));
    const choiceKey = `${player.lvl}:${player.pending}:${snapshot.choices.join(",")}`;
    if (state === previous && (state !== "levelup" || choiceKey === previousChoices)) return;
    const inRun = state === "play" || state === "pause" || state === "levelup";
    $("pauseBtn").style.display = inRun ? "block" : "none";
    if (state === "menu" && !openOverlayId) $("menu").classList.add("show");
    if (state === "pause") {
      if (!openOverlayId) $("pause").classList.add("show");
      renderSoupState();
    } else $("pause").classList.remove("show");
    $("levelup").classList.toggle("show", state === "levelup");
    if (state === "levelup") openLevelUp(snapshot.firstPick);
    if (state === "over") gameOver();
    previous = state;
    previousChoices = choiceKey;
  }
  function handleKey(code) {
    if (codeOpen) return; // окно кода читает клавиши само
    if (code === "Escape" || code === "KeyP") {
      if ($("recipeBook").classList.contains("show")) {
        if (code === "Escape") closeRecipeBook();
      } else if (openOverlayId) {
        // Под открытыми настройками/звуком/статистикой игра не возобновляется.
        if (code === "Escape") closeOverlay();
      } else if (state === "play") setPause(true);
      else if (state === "pause") setPause(false);
    }
    if (state === "levelup" && /^Digit[1-3]$/.test(code)) pick(+code.slice(5) - 1);
    if (code === "Enter" && !openOverlayId) {
      if (state === "menu") playFromMenu();
      else if (state === "over") startRun();
    }
  }
  sync();
  return {
    sync,
    handleKey,
    pause: () => {
      if (state === "play") setPause(true);
    },
  };
}
