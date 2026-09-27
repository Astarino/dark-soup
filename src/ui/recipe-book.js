import { UPG, HEAL } from "../systems/upgrades.js";
import { ICON } from "../render/sprites.js";
import { describeUpgrade } from "./descriptions.js";
export function createRecipeBook(tr) {
  const $ = (id) => document.getElementById(id);
  const RECIPES = [...UPG, HEAL];
  let recipePage = 0;
  function openRecipeBook() {
    recipePage = 0;
    $("recipeBook").classList.add("show");
    renderRecipeBook();
    $("bookCloseBtn").focus();
  }
  function closeRecipeBook() {
    $("recipeBook").classList.remove("show");
    $("recipeBookBtn").focus();
  }
  function recipePageSize() {
    return matchMedia("(max-width:640px)").matches ? 1 : 2;
  }
  function turnRecipePage(direction) {
    const size = recipePageSize();
    recipePage = Math.max(
      0,
      Math.min(
        RECIPES.length - 1,
        Math.floor(recipePage / size) * size + direction * size,
      ),
    );
    renderRecipeBook();
  }
  function fillRecipePage(element, index) {
    const u = RECIPES[index];
    if (!u) {
      element.innerHTML = "";
      return;
    }
    const kind =
      u.kind === "ing"
        ? tr("ingredient")
        : u.kind === "pas"
          ? tr("seasoning")
          : tr("recovery");
    element.innerHTML = `<span class="pageNumber">${String(index + 1).padStart(2, "0")}</span><canvas class="pageIcon" width="12" height="12" aria-hidden="true"></canvas><span class="pageCategory">${kind}</span><h3>${tr(u.name)}</h3><p>${describeUpgrade(u, 0, tr)}</p><span class="pageRank">${tr("maxRank")}: ${u.max === 99 ? "∞" : u.max}</span>`;
    element
      .querySelector("canvas")
      .getContext("2d")
      .drawImage(ICON[u.id], 0, 0);
  }
  function renderRecipeBook() {
    const size = recipePageSize();
    recipePage = Math.floor(recipePage / size) * size;
    fillRecipePage($("bookLeftPage"), recipePage);
    if (size === 2) fillRecipePage($("bookRightPage"), recipePage + 1);
    $("bookCounter").textContent =
      `${tr("page")} ${Math.floor(recipePage / size) + 1} / ${Math.ceil(RECIPES.length / size)}`;
    $("bookPrevBtn").disabled = recipePage === 0;
    $("bookNextBtn").disabled = recipePage + size >= RECIPES.length;
  }
  addEventListener("resize", () => {
    if ($("recipeBook").classList.contains("show")) renderRecipeBook();
  });
  let recipeSwipeX = null;
  $("recipeBook").addEventListener(
    "touchstart",
    (e) => {
      recipeSwipeX = e.touches[0]?.clientX ?? null;
    },
    { passive: true },
  );
  $("recipeBook").addEventListener(
    "touchend",
    (e) => {
      if (recipeSwipeX === null) return;
      const dx = e.changedTouches[0].clientX - recipeSwipeX;
      if (Math.abs(dx) > 55) turnRecipePage(dx < 0 ? 1 : -1);
      recipeSwipeX = null;
    },
    { passive: true },
  );
  return { openRecipeBook, closeRecipeBook, turnRecipePage, renderRecipeBook };
}
