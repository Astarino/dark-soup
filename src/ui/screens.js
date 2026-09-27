import { createRecipeBook } from "./recipe-book.js";
import { ENEMY_TYPES } from "../data/balance.js";
import { UPG, HEAL } from "../systems/upgrades.js";
import { ICON } from "../render/sprites.js";
import { mk } from "../render/pixels.js";
import { fmtTime } from "../shared/math.js";
import { describeUpgrade } from "./descriptions.js";
export function createUI(game, input, translator, preferences, resetFrameTime) {
  const $ = (id) => document.getElementById(id);
  const { tr } = translator;
  const { openRecipeBook, closeRecipeBook, turnRecipePage, renderRecipeBook } =
    createRecipeBook(tr);
  let LANG = translator.language,
    best = preferences.best();
  let player,
    state,
    choices,
    time,
    kills,
    previous = "",
    previousChoices = "";
  $("startBtn").onclick = startRun;
  $("restartBtn").onclick = startRun;
  $("quitBtn").onclick = () => {
    $("pause").classList.remove("show");
    startRun();
  };
  $("resumeBtn").onclick = () => setPause(false);
  $("pauseBtn").onclick = () => setPause(true);
  $("menuSettingsBtn").onclick = () => openSettings("menu");
  $("pauseSettingsBtn").onclick = () => openSettings("pause");
  $("settingsBackBtn").onclick = closeSettings;
  $("ruBtn").onclick = () => setLanguage("ru");
  $("enBtn").onclick = () => setLanguage("en");
  $("recipeBookBtn").onclick = openRecipeBook;
  $("bookCloseBtn").onclick = closeRecipeBook;
  $("bookPrevBtn").onclick = () => turnRecipePage(-1);
  $("bookNextBtn").onclick = () => turnRecipePage(1);
  $("recipeBook").onclick = (e) => {
    if (e.target === $("recipeBook")) closeRecipeBook();
  };

  let settingsReturn = "menu";
  function setLanguage(next) {
    translator.setLanguage(next);
    LANG = translator.language;
    preferences.saveLanguage(LANG);
    applyLanguage();
  }
  function applyLanguage() {
    document.documentElement.lang = LANG;
    document.title = "Dark Soup";
    $("menuIntro").textContent = tr("menuIntro");
    $("menuHint").innerHTML = tr("menuHint");
    $("startBtn").textContent = tr("start");
    $("menuSettingsBtn").textContent = tr("settings");
    $("pauseTitle").textContent = tr("pause");
    $("pauseHint").textContent = tr("pauseHint");
    $("resumeBtn").textContent = tr("resume");
    $("pauseSettingsBtn").textContent = tr("settings");
    $("quitBtn").textContent = tr("restart");
    $("overTitle").textContent = tr("over");
    $("restartBtn").textContent = tr("retry");
    $("settingsTitle").textContent = tr("settingsTitle");
    $("languageTitle").textContent = tr("language");
    $("ruBtn").textContent = tr("russian");
    $("enBtn").textContent = tr("english");
    $("enemyTitle").textContent = tr("enemies");
    $("recipeTitle").textContent = tr("recipes");
    $("settingsBackBtn").textContent = tr("back");
    $("recipeCoverTitle").textContent = tr("coverTitle");
    $("recipeCoverHint").textContent = tr("coverHint");
    $("recipeBookBtn").setAttribute("aria-label", tr("openRecipes"));
    $("bookTitle").textContent = tr("coverTitle");
    $("bookCloseBtn").textContent = tr("closeBook");
    $("bookPrevBtn").textContent = tr("prevPage");
    $("bookNextBtn").textContent = tr("nextPage");
    $("ruBtn").classList.toggle("selected", LANG === "ru");
    $("enBtn").classList.toggle("selected", LANG === "en");
    $("pauseBtn").setAttribute("aria-label", tr("pause"));
    if ($("settings").classList.contains("show")) renderSettingsCatalog();
    if ($("recipeBook").classList.contains("show")) renderRecipeBook();
  }
  function openSettings(from) {
    settingsReturn = from;
    $(from).classList.remove("show");
    $("settings").classList.add("show");
    renderSettingsCatalog();
  }
  function closeSettings() {
    $("settings").classList.remove("show");
    $(settingsReturn).classList.add("show");
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

  function startRun() {
    ["menu", "over", "pause", "settings", "recipeBook", "levelup"].forEach(
      (id) => $(id).classList.remove("show"),
    );
    game.start();
    previous = "";
    sync();
    $("pauseBtn").style.display = "block";
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
    $("luTitle").textContent = first
      ? tr("firstPick")
      : `${tr("level")} ${player.lvl}!`;
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
  function gameOver() {
    $("pauseBtn").style.display = "none";
    const isBest = time > best;
    if (isBest) {
      best = time;
      preferences.saveBest(best);
    }
    $("stats").innerHTML =
      `<div><b>${fmtTime(time)}</b><span>${tr("survived")}${isBest ? tr("record") : ""}</span></div>` +
      `<div><b>${player.lvl}</b><span>${tr("level")}</span></div>` +
      `<div><b>${kills}</b><span>${tr("goblinsCooked")}</span></div>` +
      `<div><b>${fmtTime(best)}</b><span>${tr("bestTime")}</span></div>`;
    $("over").classList.add("show");
  }

  function sync(snapshot = game.snapshot()) {
    ({ player, state, time, kills } = snapshot);
    choices = snapshot.choices.map((id) =>
      [...UPG, HEAL].find((u) => u.id === id),
    );
    const choiceKey = `${player.lvl}:${player.pending}:${snapshot.choices.join(",")}`;
    if (
      state === previous &&
      (state !== "levelup" || choiceKey === previousChoices)
    )
      return;
    $("pause").classList.toggle("show", state === "pause");
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
      } else if ($("settings").classList.contains("show") && code === "Escape")
        closeSettings();
      else if (state === "play") setPause(true);
      else if (state === "pause") setPause(false);
    }
    if (state === "levelup" && /^Digit[1-3]$/.test(code))
      pick(+code.slice(5) - 1);
    if ((state === "over" || state === "menu") && code === "Enter") startRun();
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
