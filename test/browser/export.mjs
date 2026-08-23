// What the export has to produce, checked against the file it actually wrote.
//
// The exporter is the most involved thing in the project and the least
// testable from Node: it demuxes a real recording, decodes it, draws every
// frame through the scene renderer, encodes it and muxes the result. None of
// that can be reached without a browser, so until now none of it was covered
// at all — the arithmetic underneath had 289 tests and the machine using it
// had none.
//
// Both paths are exercised. The frame-exact one is the one that runs, and the
// old real-time one is what a browser without WebCodecs falls back to; it
// stays reachable, so it stays tested.

import { readFile } from "node:fs/promises";
import {
  BACKDROP,
  SCREEN,
  apart,
  hex,
  inspect,
  recordInEditor,
  toRgb,
} from "./harness.mjs";

const RECORD_SECONDS = 3;

/** How far a flat colour may move on its way through the encoder. */
const TOLERANCE = 34;

let failures = 0;
let checks = 0;

function check(label, ok, detail) {
  checks++;
  if (!ok) failures++;
  const mark = ok ? "  ok  " : " FAIL ";
  console.log(`${mark} ${label}${detail ? ` — ${detail}` : ""}`);
}

/**
 * Records, frames the clip, exports it, and reads back what came out.
 *
 * Applying a background is what makes this an export rather than a copy: a
 * cut on its own is stream-copied, so without a scene the encoder never runs
 * and there would be nothing here to measure.
 */
async function exportOnce({ breakWebCodecs }) {
  const { browser, page, errors } = await recordInEditor({
    seconds: RECORD_SECONDS,
    breakWebCodecs,
  });
  try {
    await page.click(`[aria-label="Background: ${BACKDROP.label}"]`);
    // A framed clip counts as edited, so the button changes what it offers.
    const button = page.locator("button:has-text('Export clip')");
    await button.waitFor({ timeout: 15_000 });
    await button.click();

    const download = await Promise.race([
      page.waitForEvent("download", { timeout: 300_000 }),
      page
        .waitForSelector("[data-sonner-toast][data-type='error']", {
          timeout: 300_000,
        })
        .then(async (el) => {
          throw new Error(`the app refused: ${await el.innerText()}`);
        }),
    ]);

    const path = await download.path();
    const name = download.suggestedFilename();
    const bytes = await readFile(path);
    const mime = name.endsWith(".webm") ? "video/webm" : "video/mp4";
    const encoders = await page.evaluate(() => window.__encoders ?? 0);
    const seen = await inspect(page, bytes.toString("base64"), mime);

    return { name, size: bytes.length, mime, encoders, errors, ...seen };
  } finally {
    await browser.close();
  }
}

/** Everything that must hold whichever path wrote the file. */
function expectSound(result, label) {
  const screen = toRgb(SCREEN.color);
  const backdrop = toRgb(BACKDROP.color);

  check(`${label}: a file came out`, result.size > 20_000, `${result.size} bytes`);
  check(
    `${label}: it plays and knows how long it is`,
    Math.abs(result.duration - RECORD_SECONDS) < 1.2,
    `${result.duration.toFixed(2)}s, expected ~${RECORD_SECONDS}s`,
  );
  check(
    `${label}: the frame is the shape it was captured in`,
    Math.abs(result.width / result.height - SCREEN.width / SCREEN.height) < 0.02,
    `${result.width}×${result.height}`,
  );
  // The recording sits in the middle of the frame it was given, so the middle
  // is still the screen and the corner is the background drawn around it.
  //
  // The tolerance is for the trip through H.264: 4:2:0 chroma and the sRGB
  // to BT.709 conversion move a flat colour by twenty-odd units. It is still
  // nowhere near enough to confuse these two, which are 185 apart in green.
  check(
    `${label}: the recording is still in the middle of it`,
    apart(result.centre, screen) <= TOLERANCE,
    `${hex(result.centre)}, expected ~${SCREEN.color}`,
  );
  check(
    `${label}: the background is rendered into the file, not faked in preview`,
    apart(result.corner, backdrop) <= TOLERANCE,
    `${hex(result.corner)}, expected ~${BACKDROP.color}`,
  );
  check(
    `${label}: nothing threw in the page`,
    result.errors.length === 0,
    result.errors.join(" / ") || "clean",
  );
}

console.log("\nframe-exact path (WebCodecs)\n");
const fast = await exportOnce({ breakWebCodecs: false });
expectSound(fast, "fast");
check(
  "fast: an encoder actually ran, so this wasn't a silent fallback",
  fast.encoders > 0,
  `${fast.encoders} constructed`,
);
check(
  "fast: mp4 is what it writes, whatever it read",
  fast.name.endsWith(".mp4"),
  fast.name,
);

console.log("\nfallback path (no WebCodecs)\n");
const slow = await exportOnce({ breakWebCodecs: true });
expectSound(slow, "slow");

console.log(
  `\n${checks - failures}/${checks} checks passed` +
    (failures ? ` — ${failures} FAILED\n` : "\n"),
);
process.exit(failures ? 1 : 0);
