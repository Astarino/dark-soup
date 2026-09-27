// Records reference runs of the CURRENT game into tests/fixtures/reference-runs.json.
// Run only after an intentional, reviewed mechanics change (npm run capture-reference).
// Never regenerate just to turn an unexpected regression failure green.
import fs from "node:fs";
import {
  REFERENCE_RUNS,
  playReference,
} from "../tests/reference-scenario.js";

const results = REFERENCE_RUNS.map((run) => {
  const checkpoints = [];
  playReference(run, (frame, snapshot) => checkpoints.push({ frame, snapshot }));
  return { ...run, checkpoints };
});
fs.mkdirSync(new URL("../tests/fixtures/", import.meta.url), { recursive: true });
fs.writeFileSync(
  new URL("../tests/fixtures/reference-runs.json", import.meta.url),
  JSON.stringify(results),
);
console.log(`Recorded ${results.length} reference runs.`);
