import { createRecipeBook } from "./recipe-book.js";
import { ENEMY_TYPES } from "../data/balance.js";
import { UPG, HEAL } from "../systems/upgrades.js";
import { ICON } from "../render/sprites.js";
import { mk } from "../render/pixels.js";
import { describeUpgrade } from "./descriptions.js";
import { paintIcons, soupStateHtml, runSummaryHtml, statsHtml } from "./info-screens.js";
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
  const PANELS = ["menu", "over", "pause", "settings", "recipeBook", "levelup", "soundPanel", "statsPanel"];

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
  };
  function applyLanguage() {
    document.documentElement.lang = LANG;
    document.title = "Dark Soup";
    for (const [id, key] of Object.entries(TEXTS)) $(id).textContent = tr(key);
    $("menuHint").innerHTML = tr("menuHint");
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
    if (code === "Escape" || code === "KeyP") {
      if ($("recipeBook").classList.contains("show")) {
        if (code === "Escape") closeRecipeBook();
      } else if (openOverlayId && code === "Escape") closeOverlay();
      else if (state === "play") setPause(true);
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
