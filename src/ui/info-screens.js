import { UPG } from "../systems/upgrades.js";
import { ICON } from "../render/sprites.js";
import { fmtTime } from "../shared/math.js";
import { seasoningEffect } from "./descriptions.js";
// HTML для окон «Состояние супа», итогов готовки и статистики.
// Иконки вставляются как <canvas data-icon>, затем их рисует paintIcons.
const INGREDIENTS = UPG.filter((u) => u.kind === "ing");
const SEASONINGS = UPG.filter((u) => u.kind === "pas");
const MOB_COLORS = { goblin: "#6f8a3c", runner: "#b8c060", brute: "#4a5e2c", warden: "#dedacd" };

export function paintIcons(root) {
  for (const c of root.querySelectorAll("canvas[data-icon]")) {
    const g = c.getContext("2d");
    g.clearRect(0, 0, c.width, c.height);
    if (ICON[c.dataset.icon]) g.drawImage(ICON[c.dataset.icon], 0, 0);
  }
}
const num = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
const icon = (id) => `<canvas data-icon="${id}" width="12" height="12"></canvas>`;
const tile = (value, label) => `<div class="tile"><b>${value}</b><span>${label}</span></div>`;
const pips = (lv, max) => `<span class="pips">${"■".repeat(lv)}<em>${"■".repeat(Math.max(0, max - lv))}</em></span>`;
const bar = (share) => `<div class="bar"><i style="width:${Math.round(Math.max(0, Math.min(1, share)) * 100)}%"></i></div>`;
const section = (title, body) => `<section class="infoSection"><h3>${title}</h3>${body}</section>`;
const sourceName = (id, tr) => (id === "burning" ? tr("burningSource") : tr(`upgrade_${id}`));
const sourceIcon = (id) => (ICON[id] ? icon(id) : `<span class="dot" style="background:#e0612b"></span>`);
function longTime(sec, tr) {
  const h = Math.floor(sec / 3600),
    m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h} ${tr("hoursShort")} ${m} ${tr("minutesShort")}` : fmtTime(sec);
}
function damageRows(bySource, tr, limit = 99) {
  const entries = Object.entries(bySource || {})
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
  if (!entries.length) return `<p class="emptyNote">${tr("noDamageYet")}</p>`;
  const total = entries.reduce((a, [, v]) => a + v, 0);
  return `<div class="rows">${entries
    .map(([id, v]) => `<div class="row">${sourceIcon(id)}<div class="name">${sourceName(id, tr)}${bar(v / entries[0][1])}</div><span class="val">${num(v)}<br><small>${Math.round((v / total) * 100)}%</small></span></div>`)
    .join("")}</div>`;
}
function recipeIcons(upgrades) {
  const list = UPG.filter((u) => upgrades[u.id] > 0);
  return `<div class="recipeIcons">${list.map((u) => `<span title="${u.id}">${icon(u.id)}<b>${upgrades[u.id]}</b></span>`).join("")}</div>`;
}
function killRows(killsByType, tr) {
  const entries = Object.entries(killsByType || {}).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return `<p class="emptyNote">${tr("noKillsYet")}</p>`;
  return `<div class="rows">${entries
    .map(([type, n]) => `<div class="row"><span class="dot" style="background:${MOB_COLORS[type] || "#888"}"></span><div class="name">${tr(`mob_${type}`)}${bar(n / entries[0][1])}</div><span class="val">${num(n)}</span></div>`)
    .join("")}</div>`;
}

// Пауза во время игры: текущее состояние супа.
export function soupStateHtml(snapshot, run, tr) {
  const { player, time, kills, enemies } = snapshot;
  const ing = INGREDIENTS.filter((u) => player.lv[u.id] > 0),
    pas = SEASONINGS.filter((u) => player.lv[u.id] > 0),
    boss = enemies.find((e) => e.type === "warden");
  let html = `<div class="tiles">${tile(fmtTime(time), tr("timeLabel"))}${tile(player.lvl, tr("level"))}${tile(`${Math.ceil(player.hp)}/${player.maxHp}`, tr("hp"))}${tile(num(kills), tr("goblinsCooked"))}</div>`;
  html += section(
    tr("ingredientsTitle"),
    ing.length
      ? `<div class="rows">${ing
          .map((u) => `<div class="row">${icon(u.id)}<div class="name">${tr(u.name)} ${pips(player.lv[u.id], u.max)}</div><span class="val">${num(run.damageBySource[u.id] || 0)}<br><small>${tr("damage")}</small></span></div>`)
          .join("")}</div>`
      : `<p class="emptyNote">${tr("noIngredients")}</p>`,
  );
  if (pas.length)
    html += section(
      tr("seasoningsTitle"),
      `<div class="rows">${pas
        .map((u) => `<div class="row">${icon(u.id)}<div class="name">${tr(u.name)} ${pips(player.lv[u.id], u.max)}</div><span class="val">${seasoningEffect(u.id, player.lv[u.id], tr)}</span></div>`)
        .join("")}</div>`,
    );
  html += section(
    tr("soupProps"),
    `<div class="tiles">${tile(`×${player.dmgMul.toFixed(2)}`, tr("damage"))}${tile(Math.round(player.speed), tr("speed"))}${tile(Math.round(player.magnet), tr("pickupRadius"))}${tile(num(run.damageTaken), tr("damageTaken"))}</div>`,
  );
  if (boss)
    html += section(
      tr("mob_warden"),
      `<div class="tiles">${tile(`${Math.ceil((boss.hp / boss.max) * 100)}%`, tr("hp"))}${tile(`${boss.adapted.length}/${INGREDIENTS.length}`, tr("adaptedCount"))}</div>${boss.adapted.length ? `<div class="recipeIcons">${boss.adapted.map((id) => `<span>${icon(id)}</span>`).join("")}</div>` : ""}`,
    );
  return html;
}

// Итоги готовки на экране поражения.
export function runSummaryHtml(run, tr, { isRecord, bestTime }) {
  return (
    (isRecord ? `<div style="text-align:center"><span class="badge">${tr("newRecord")}</span></div>` : "") +
    `<div class="tiles">${tile(fmtTime(run.time), tr("survived"))}${tile(run.level, tr("level"))}${tile(num(run.kills), tr("goblinsCooked"))}${tile(num(run.damageTotal), tr("damageDealt"))}${tile(num(run.damageTaken), tr("damageTaken"))}${tile(fmtTime(bestTime), tr("bestTime"))}</div>` +
    section(tr("recipeTitle"), recipeIcons(run.upgrades)) +
    section(tr("damageByIngredient"), damageRows(run.damageBySource, tr, 5))
  );
}

// Статистика между забегами и рекордная готовка.
export function statsHtml(s, tr, lang) {
  if (!s.runs) return `<p class="emptyNote">${tr("noRunsYet")}</p>`;
  let html = section(
    tr("statsOverall"),
    `<div class="tiles">${tile(num(s.runs), tr("runsCount"))}${tile(longTime(s.totalTime, tr), tr("timeAtFire"))}${tile(fmtTime(s.bestTime), tr("bestTime"))}${tile(s.bestLevel, tr("bestLevel"))}${tile(num(s.totalKills), tr("goblinsCooked"))}${tile(num(s.totalDamage), tr("damageDealt"))}${tile(num(s.mostDamage), tr("mostDamage"))}${tile(`${s.bossKilled}/${s.bossMet}`, tr("bossRecord"))}</div>`,
  );
  html += section(tr("killsByType"), killRows(s.killsByType, tr));
  const fav = Object.entries(s.picks)
    .filter(([id]) => INGREDIENTS.some((u) => u.id === id))
    .sort((a, b) => b[1] - a[1]);
  html += section(
    tr("favoriteIngredients"),
    fav.length
      ? `<div class="rows">${fav
          .map(([id, n]) => `<div class="row">${icon(id)}<div class="name">${tr(`upgrade_${id}`)}<small>${tr("damageDealt")}: ${num(s.damageBySource[id] || 0)}</small>${bar(n / fav[0][1])}</div><span class="val">${num(n)}<br><small>${tr("ranksTaken")}</small></span></div>`)
          .join("")}</div>`
      : `<p class="emptyNote">${tr("noIngredients")}</p>`,
  );
  const b = s.bestRun;
  if (b) {
    const date = new Date(b.date).toLocaleDateString(lang === "en" ? "en-GB" : "ru-RU", { day: "numeric", month: "long", year: "numeric" });
    html += section(
      `${tr("bestCooking")} · ${date}`,
      `<div class="tiles">${tile(fmtTime(b.time), tr("survived"))}${tile(b.level, tr("level"))}${tile(num(b.kills), tr("goblinsCooked"))}${tile(num(b.damageTotal), tr("damageDealt"))}${tile(num(b.damageTaken), tr("damageTaken"))}${tile(num(b.xp), tr("xp"))}${tile(b.maxHp, tr("hp"))}${tile(b.bossKilled ? tr("bossDefeated") : b.bossMet ? tr("bossMetOnly") : "—", tr("mob_warden"))}</div>` +
        `<h3 style="margin:14px 0 8px;color:var(--accent);font:9px/1.5 var(--px)">${tr("recipeTitle")}</h3>${recipeIcons(b.upgrades)}` +
        `<h3 style="margin:14px 0 8px;color:var(--accent);font:9px/1.5 var(--px)">${tr("damageByIngredient")}</h3>${damageRows(b.damageBySource, tr)}` +
        `<h3 style="margin:14px 0 8px;color:var(--accent);font:9px/1.5 var(--px)">${tr("killsByType")}</h3>${killRows(b.killsByType, tr)}`,
    );
  }
  return html;
}
