// Driving the real recorder in a real browser.
//
// Everything the exporter touches — MediaRecorder's output, WebCodecs, the
// canvas the scene is drawn on — exists only in a browser, so none of it is
// reachable from `bun test`. What is reachable is the whole thing end to end:
// fake the one API that needs a human (`getDisplayMedia`), and the recording,
// the edit and the export that follow are the ones the app really does.
//
// The fake screen is a flat colour on purpose. It gives the exported file a
// pixel worth asserting on: the middle of the frame has to still be that
// colour, and the corner has to be the background drawn around it.

import { chromium } from "playwright-core";

/** The fake screen, and the size it's captured at. */
export const SCREEN = { color: "#22cc55", width: 1280, height: 720 };

/** The solid preset used as a frame, so the corner has a known answer. */
export const BACKDROP = { label: "Graphite", color: "#16130f" };

export const BASE = process.env.KIRMIZI_URL ?? "http://localhost:3123";

/**
 * Which installed browser to drive. No browser is downloaded — this uses one
 * that is already on the machine, which is Edge here and whatever a runner
 * has there.
 */
const CHANNEL = process.env.KIRMIZI_BROWSER ?? "msedge";

/**
 * Replaces screen capture with a canvas, and counts VideoEncoders.
 *
 * The count is how the test knows which export path ran: only the
 * frame-exact one constructs an encoder, and when it throws the app falls
 * through to the old path without saying so. A test that couldn't tell the
 * difference would pass just as happily on the slow path it was written to
 * keep us off.
 */
function pageSetup({ color, width, height, breakWebCodecs }) {
  return `((color, width, height, breakWebCodecs) => {
    if (breakWebCodecs) {
      delete window.VideoEncoder;
      delete window.AudioEncoder;
    } else if (window.VideoEncoder) {
      const Real = window.VideoEncoder;
      window.__encoders = 0;
      class Counted extends Real {
        constructor(...args) {
          super(...args);
          window.__encoders++;
        }
      }
      window.VideoEncoder = Counted;
    }

    Object.defineProperty(navigator.mediaDevices, "getDisplayMedia", {
      configurable: true,
      value: async () => {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        // Repainted on a timer: a canvas that never changes stops producing
        // frames, and a recording of no frames is not a recording.
        let n = 0;
        setInterval(() => {
          n++;
          ctx.fillStyle = color;
          ctx.fillRect(0, 0, width, height);
          // A moving mark well away from the middle, so the picture is
          // genuinely animated without disturbing the pixel being asserted.
          ctx.fillStyle = n % 2 ? "#1b1b1b" : "#2b2b2b";
          ctx.fillRect((n * 9) % width, 8, 40, 12);
        }, 33);
        const stream = canvas.captureStream(30);
        const track = stream.getVideoTracks()[0];
        const real = track.getSettings.bind(track);
        track.getSettings = () => ({
          ...real(),
          width,
          height,
          displaySurface: "monitor",
        });
        return stream;
      },
    });
  })(${JSON.stringify(color)}, ${width}, ${height}, ${JSON.stringify(!!breakWebCodecs)})`;
}

/** A recorder page with a fake screen, recorded for `seconds` and stopped. */
export async function recordInEditor({ seconds = 3, breakWebCodecs = false } = {}) {
  const browser = await chromium.launch({ channel: CHANNEL, headless: true });
  const context = await browser.newContext({ acceptDownloads: true });
  await context.addInitScript(
    pageSetup({ ...SCREEN, breakWebCodecs }),
  );
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  await page.goto(`${BASE}/record`, { waitUntil: "domcontentloaded" });
  // Clicked rather than driven by the keyboard shortcut: the shortcut needs
  // the page to have focus and to have hydrated, and a test that sometimes
  // presses R into nothing is worse than no test.
  const record = page.locator("button:has-text('Start recording')");
  await record.waitFor({ timeout: 60_000 });

  // Being visible is not the same as being wired up. The button is rendered
  // on the server and only answers once React has hydrated it, so a click can
  // land on it and do nothing at all — which then looks exactly like a
  // recorder that failed to start. Ask again rather than wait forever.
  const stop = page.locator("button:has-text('Stop recording')");
  let started = false;
  for (let attempt = 0; attempt < 4 && !started; attempt++) {
    await record.click({ timeout: 10_000 }).catch(() => {});
    // The picker is faked, so this is the 3s countdown and then the HUD.
    started = await stop
      .waitFor({ timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
  }
  if (!started) throw new Error("the recorder never started");
  await page.waitForTimeout(seconds * 1000);
  await stop.click();

  await page.waitForSelector("button:has-text('Split')", { timeout: 60_000 });
  // Duration and thumbnails settle a beat after the editor opens.
  await page.waitForTimeout(2000);

  return { browser, context, page, errors };
}

/**
 * Reads an exported file back through a <video>, and samples two pixels.
 *
 * Seeking alone doesn't mean the new frame is painted, so this waits for
 * requestVideoFrameCallback as well — raced against a timeout, because it
 * never fires for a paused element in some builds. Without that the element
 * hands back the previous picture and a correct export looks broken.
 */
export async function inspect(page, base64, mime) {
  return page.evaluate(
    async ({ base64, mime }) => {
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
      const video = document.createElement("video");
      video.muted = true;
      video.src = url;
      await new Promise((res, rej) => {
        video.onloadedmetadata = res;
        video.onerror = () => rej(new Error("the file would not load"));
      });
      const duration = video.duration;
      const width = video.videoWidth;
      const height = video.videoHeight;

      video.currentTime = Math.min(duration / 2, Math.max(0, duration - 0.2));
      await new Promise((res) => {
        let done = false;
        const finish = () => {
          if (!done) {
            done = true;
            res();
          }
        };
        video.onseeked = () =>
          video.requestVideoFrameCallback
            ? video.requestVideoFrameCallback(finish)
            : finish();
        setTimeout(finish, 1500);
      });

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(video, 0, 0);
      const at = (x, y) => {
        const d = ctx.getImageData(x, y, 1, 1).data;
        return [d[0], d[1], d[2]];
      };
      URL.revokeObjectURL(url);
      return {
        duration,
        width,
        height,
        centre: at(Math.floor(width / 2), Math.floor(height / 2)),
        corner: at(3, 3),
      };
    },
    { base64, mime },
  );
}

export const hex = ([r, g, b]) =>
  "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");

/** How far apart two colours are, as the largest channel difference. */
export const apart = (a, b) =>
  Math.max(...a.map((v, i) => Math.abs(v - b[i])));

export const toRgb = (h) => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];
