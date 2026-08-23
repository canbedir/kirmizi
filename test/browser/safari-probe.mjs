// What Safari can actually do, asked of Safari.
//
// The README says Safari's implementation is "partial" and the app feature-
// detects around it. Neither statement is worth much without a list, and the
// list can't be written from a Windows machine — or from a support table,
// which is someone else's summary of a browser that has since shipped twice.
//
// So this asks. It drives the real Safari on a macOS runner through
// safaridriver, loads the app from a real server (localhost is a secure
// context, which getDisplayMedia insists on), and reports every capability
// the app gates a feature on. No Apple hardware, no guessing.
//
// Raw WebDriver over HTTP rather than a driver library: it is four endpoints,
// and a dependency that exists to wrap four endpoints is a dependency to keep
// up to date for no reason.

const PORT = process.env.SAFARIDRIVER_PORT ?? "4444";
const DRIVER = `http://localhost:${PORT}`;
const BASE = process.env.KIRMIZI_URL ?? "http://localhost:3000";

async function call(method, path, body) {
  const res = await fetch(`${DRIVER}${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.value?.error) {
    throw new Error(
      `${method} ${path} → ${res.status} ${JSON.stringify(json?.value ?? json)}`,
    );
  }
  return json.value;
}

/**
 * Everything the app gates a feature on, answered in one pass.
 *
 * Written as a string because it runs in Safari, not here. It reports what is
 * *there*; what that costs the user is decided by the reader, not by this.
 */
const PROBE = `
const done = arguments[arguments.length - 1];
(async () => {
  const has = (v) => typeof v !== "undefined" && v !== null;
  const out = {
    ua: navigator.userAgent,
    secureContext: window.isSecureContext,

    // The recorder itself. Without these /record shows "Not supported here".
    getDisplayMedia: !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia),
    getUserMedia: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
    MediaRecorder: has(window.MediaRecorder),

    // WebCodecs — the frame-exact export lives or dies on all four.
    VideoEncoder: has(window.VideoEncoder),
    AudioEncoder: has(window.AudioEncoder),
    VideoDecoder: has(window.VideoDecoder),
    VideoFrame: has(window.VideoFrame),

    // The fallback export: play it back and capture the result.
    videoCaptureStream: !!document.createElement("video").captureStream,
    canvasCaptureStream: !!document.createElement("canvas").captureStream,

    // Loudness measurement and the finished soundtrack.
    OfflineAudioContext: has(window.OfflineAudioContext) || has(window.webkitOfflineAudioContext),

    // The last five recordings and their edits.
    indexedDB: has(window.indexedDB),
    randomUUID: !!(window.crypto && window.crypto.randomUUID),

    // ffmpeg.wasm, for lossless trims and AAC where the browser can't encode.
    WebAssembly: has(window.WebAssembly),
  };

  const recorderTypes = [
    "video/mp4",
    "video/mp4;codecs=avc1.42001f,mp4a.40.2",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  out.mediaRecorder = {};
  for (const t of recorderTypes) {
    out.mediaRecorder[t] = out.MediaRecorder
      ? MediaRecorder.isTypeSupported(t)
      : null;
  }

  async function config(kind, cfg) {
    const api = window[kind];
    if (!api || !api.isConfigSupported) return null;
    try {
      const r = await api.isConfigSupported(cfg);
      return !!r.supported;
    } catch (e) {
      return "threw: " + (e && e.name);
    }
  }

  out.videoEncoder = {
    "avc1.42001f (H.264 baseline)": await config("VideoEncoder", {
      codec: "avc1.42001f", width: 1280, height: 720, bitrate: 5000000,
    }),
    "avc1.640028 (H.264 high)": await config("VideoEncoder", {
      codec: "avc1.640028", width: 1280, height: 720, bitrate: 5000000,
    }),
    "vp09.00.10.08 (VP9)": await config("VideoEncoder", {
      codec: "vp09.00.10.08", width: 1280, height: 720, bitrate: 5000000,
    }),
  };
  out.audioEncoder = {
    "mp4a.40.2 (AAC)": await config("AudioEncoder", {
      codec: "mp4a.40.2", sampleRate: 48000, numberOfChannels: 2, bitrate: 128000,
    }),
    opus: await config("AudioEncoder", {
      codec: "opus", sampleRate: 48000, numberOfChannels: 2, bitrate: 128000,
    }),
  };
  out.videoDecoder = {
    "avc1.42001f": await config("VideoDecoder", {
      codec: "avc1.42001f", codedWidth: 1280, codedHeight: 720,
    }),
    vp8: await config("VideoDecoder", { codec: "vp8", codedWidth: 1280, codedHeight: 720 }),
    "vp09.00.10.08": await config("VideoDecoder", {
      codec: "vp09.00.10.08", codedWidth: 1280, codedHeight: 720,
    }),
  };

  // And what the app decides to show, which is the part a person meets.
  const body = document.body ? document.body.innerText : "";
  out.appVerdict = body.includes("Not supported here")
    ? "refuses: Not supported here"
    : body.includes("Start recording")
      ? "offers the recorder"
      : "neither — page did not settle";

  done(out);
})().catch((e) => done({ probeError: String(e) }));
`;

const session = await call("POST", "/session", {
  capabilities: { alwaysMatch: { browserName: "safari" } },
});
const id = session.sessionId;

try {
  await call("POST", `/session/${id}/url`, { url: `${BASE}/record` });
  // Give the client bundle a moment to hydrate and render its verdict.
  await new Promise((r) => setTimeout(r, 4000));
  await call("POST", `/session/${id}/timeouts`, { script: 60000 });
  const report = await call("POST", `/session/${id}/execute/async`, {
    script: PROBE,
    args: [],
  });
  console.log(JSON.stringify(report, null, 2));
} finally {
  await call("DELETE", `/session/${id}`).catch(() => {});
}
