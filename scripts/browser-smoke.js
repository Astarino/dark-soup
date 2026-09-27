// Run in an isolated browser on http://localhost:5173/?debug via eval --stdin.
(async () => {
  const assert = (condition, message) => {
    if (!condition) throw Error(message);
  };
  const click = (id) => document.getElementById(id).click();
  const frames = (n) =>
    new Promise((resolve) => {
      function frame() {
        if (--n <= 0) resolve();
        else requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    });
  const state = () => window.__game.snapshot();
  const key = (code, down = true) =>
    dispatchEvent(
      new KeyboardEvent(down ? "keydown" : "keyup", { code, bubbles: true }),
    );
  const press = (code) => {
    key(code);
    key(code, false);
  };
  click("startBtn");
  assert(state().state === "intro", "camera glide from the camp");
  for (let i = 0; i < 300 && state().state === "intro"; i++) await frames(1);
  assert(state().state === "levelup", "initial choice after the glide");
  press("Digit1");
  assert(state().state === "play", "keyboard choice");
  let x = state().player.x;
  key("KeyD");
  await frames(15);
  key("KeyD", false);
  assert(state().player.x > x + 5, "WASD movement");
  x = state().player.x;
  key("ArrowLeft");
  await frames(30);
  key("ArrowLeft", false);
  assert(state().player.x < x, "arrow movement");
  press("Escape");
  assert(state().state === "pause", "Escape pause");
  const paused = state().time;
  await frames(5);
  assert(state().time === paused, "pause freezes clock");
  click("pauseSettingsBtn");
  click("enBtn");
  assert(document.documentElement.lang === "en", "English language");
  assert(
    localStorage.getItem("dark_soup_language") === "en",
    "language saved with old key",
  );
  click("recipeBookBtn");
  const first = document.getElementById("bookCounter").textContent;
  click("bookNextBtn");
  assert(
    document.getElementById("bookCounter").textContent !== first,
    "book next",
  );
  click("bookPrevBtn");
  assert(
    document.getElementById("bookCounter").textContent === first,
    "book previous",
  );
  for (let i = 0; i < 10; i++) click("bookNextBtn");
  assert(document.getElementById("bookNextBtn").disabled, "last page boundary");
  press("Escape");
  assert(
    !document.getElementById("recipeBook").classList.contains("show"),
    "Escape closes book",
  );
  press("Escape");
  assert(
    document.getElementById("pause").classList.contains("show"),
    "Escape returns from settings",
  );
  click("resumeBtn");
  assert(state().state === "play", "resume");
  press("KeyP");
  assert(state().state === "pause", "P pause");
  click("quitBtn");
  assert(state().state === "levelup", "restart");
  assert(
    state().time === 0 &&
      state().player.hp === 100 &&
      state().player.lv.carrot === 0,
    "restart clears run",
  );
  click("cards");
  press("Digit3");
  const canvas = document.getElementById("game");
  const pointer = (type, id, px, py) =>
    canvas.dispatchEvent(
      new PointerEvent(type, {
        pointerId: id,
        pointerType: "touch",
        clientX: px,
        clientY: py,
        bubbles: true,
      }),
    );
  x = state().player.x;
  pointer("pointerdown", 7, 100, 200);
  pointer("pointermove", 7, 150, 200);
  await frames(20);
  assert(state().player.x > x + 5, "touch joystick movement");
  pointer("pointercancel", 7, 150, 200);
  await frames(60);
  const stopped = state().player.x;
  await frames(15);
  assert(
    Math.abs(state().player.x - stopped) < 0.5,
    "pointer cancellation releases joystick",
  );
  click("pauseBtn");
  click("pauseSettingsBtn");
  click("ruBtn");
  click("recipeBookBtn");
  const counter = document.getElementById("bookCounter").textContent;
  const recipes = 12; // 11 улучшений + «Глоток супа»
  const expected = matchMedia("(max-width:640px)").matches ? `1 / ${recipes}` : `1 / ${recipes / 2}`;
  assert(counter.endsWith(expected), "responsive recipe pagination");
  assert(state().state === "pause", "settings and book preserve pause");
  press("Escape");
  press("Escape");
  // Звук: шкалы сохраняются по категориям.
  click("pauseSoundBtn");
  const fire = document.getElementById("volFire");
  fire.value = 40;
  fire.dispatchEvent(new Event("input"));
  fire.dispatchEvent(new Event("change"));
  assert(JSON.parse(localStorage.getItem("dark_soup_volume")).fire === 40, "fire volume saved");
  click("soundBackBtn");
  assert(document.getElementById("soupState").textContent.length > 0, "soup state in pause");
  // Главное меню и статистика.
  click("pauseMenuBtn");
  assert(state().state === "menu", "back to the main menu");
  click("statsBtn");
  assert(document.getElementById("statsPanel").classList.contains("show"), "statistics panel");
  click("statsBackBtn");
  return {
    passed: true,
    width: innerWidth,
    counter,
    state: state().state,
    checks:
      "intro, keyboard, pointer, pause, soup state, resume, restart, languages, persistence, settings, recipes, sound, statistics, main menu",
  };
})();
