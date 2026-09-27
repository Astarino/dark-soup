// One-time reference capture from the pinned pre-refactor commit.
// Do not regenerate fixtures when changing mechanics to make a failing test green.
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import vm from "node:vm";
const original = execFileSync("git", ["show", "0c4603d:game.js"], {
  encoding: "utf8",
}).split("\n");
const slice = (a, b) => original.slice(a - 1, b).join("\n");
const program = [
  slice(6, 17),
  slice(75, 77),
  slice(109, 121),
  slice(138, 138),
  `const tr = key => key; const POT = { soupDy: -29 }; const VW=()=>1200,VH=()=>800;
const OAKS=Array(5).fill(0),PINES=OAKS,OAKS_B=OAKS,PINES_B=OAKS;
const TENT={},STUMP={},ROCKS=[18,22,26].map(width=>({img:{width}}));
const logSprite=(len,v)=>({width:v?11:Math.round(len)+2,height:v?Math.round(len)+2:11});`,
  slice(399, 457),
  slice(128, 137),
  slice(514, 516),
  slice(519, 532),
  slice(692, 702),
  slice(729, 737),
  slice(751, 972),
  `let input={x:0,y:0}; const inputVec=()=>input;
function gameOver(){state='over'}
function openLevelUp(first){state='levelup';choices=first?UPG.filter(u=>u.kind==='ing'):rollChoices()}
function choose(i){const u=choices[i];if(state!=='levelup'||!u)return;applyUpgrade(u);drops.push({id:u.id,t:0});if(P.pending>0)P.pending--;if(P.pending>0)openLevelUp(false);else state='play'}
function start(){reset();openLevelUp(true)}
function snap(){return {P,enemies,gems,strikes,waves,parts,texts,drops,time,kills,cam,shake,steamT,state}}
`,
].join("\n");
function seed(n) {
  return () => {
    n |= 0;
    n = (n + 0x6d2b79f5) | 0;
    let t = Math.imul(n ^ (n >>> 15), 1 | n);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const results = [];
for (let ingredient = 0; ingredient < 3; ingredient++) {
  const context = vm.createContext({
    Math: Object.assign(Object.create(Math), {
      random: seed(100 + ingredient),
    }),
  });
  vm.runInContext(program, context);
  vm.runInContext(`start();choose(${ingredient});`, context);
  const checkpoints = [];
  for (let frame = 0; frame < 7200; frame++) {
    // A reproducible orbit keeps the player near the clearing while fighting.
    const direction = { x: Math.cos(frame / 180), y: Math.sin(frame / 180) };
    context.direction = direction;
    vm.runInContext(
      `if(state==='levelup')choose(0);input=direction;if(state==='play')update(1/60);else if(state==='over'){for(const p of parts)p.t+=1/60;parts=parts.filter(p=>p.t<p.life)}`,
      context,
    );
    if ([59, 599, 1799, 3599, 7199].includes(frame))
      checkpoints.push({
        frame,
        snapshot: JSON.parse(
          vm.runInContext("JSON.stringify(snap())", context),
        ),
      });
  }
  results.push({ seed: 100 + ingredient, ingredient, checkpoints });
}
fs.writeFileSync("tests/fixtures/original-runs.json", JSON.stringify(results));
