import { readdirSync, readFileSync } from "node:fs";
import { resolve, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
const root = fileURLToPath(new URL("../", import.meta.url));
const allowed = {
  core: ["core", "systems", "abilities", "effects", "world", "data", "shared"],
  systems: ["systems", "data", "shared"],
  abilities: ["abilities", "data", "shared"],
  effects: ["effects", "data", "shared"],
  world: ["world", "data", "shared"],
  data: ["data", "shared"],
  shared: ["shared"],
  storage: ["storage"],
  input: ["input", "data", "shared"],
  render: ["render", "world", "abilities", "systems", "data", "shared"],
  ui: ["ui", "render", "systems", "data", "shared"],
};
let checked = 0;
for (const folder of ["src", "scripts", "tests"]) {
  for (const name of readdirSync(resolve(root, folder), { recursive: true })) {
    if (!name.endsWith(".js")) continue;
    const path = resolve(root, folder, name),
      source = readFileSync(path, "utf8");
    const syntax = spawnSync(process.execPath, ["--check", path], {
      encoding: "utf8",
    });
    if (syntax.status !== 0) throw Error(syntax.stderr);
    if (folder === "src") {
      const layer = name.split("/")[0];
      for (const [, specifier] of source.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
        const target = relative(
          resolve(root, "src"),
          resolve(dirname(path), specifier),
        ).split("/")[0];
        if (allowed[layer] && !allowed[layer].includes(target))
          throw Error(`Forbidden dependency: ${name} → ${specifier}`);
      }
      if (
        [
          "core",
          "systems",
          "abilities",
          "effects",
          "world",
          "data",
          "shared",
        ].includes(layer) &&
        /\b(document|window|localStorage|CanvasRenderingContext2D)\b/.test(
          source.replace(/\/\/[^\n]*/g, ""),
        )
      ) {
        throw Error(`Browser dependency in ${name}`);
      }
    }
    checked++;
  }
}
console.log(`Syntax and module boundaries checked: ${checked} files`);
