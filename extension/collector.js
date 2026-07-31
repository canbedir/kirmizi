// Per-tab pointer collector.
//
// Runs in every frame but only listens while a recording is in progress.
// Events are sent raw — screen coordinates plus this page's own screen
// metrics — and normalised later, once the background has attached the tab's
// zoom factor. Normalising here would bake in a unit mismatch: in Chromium,
// event.screenX stays in device-independent pixels while screen.width is
// reported in CSS pixels, so at any page zoom other than 100% the two
// disagree by exactly the zoom factor.
//
// Nothing about the page itself — no URL, no content, no element — is read.

(() => {
  const isTopFrame = window.top === window;
  // ~120 Hz is well past what any capture frame rate can show, and the path
  // is resampled anyway; this just keeps the batches small.
  const MIN_MOVE_MS = 8;
  const FLUSH_MS = 250;

  let listening = false;
  let buffer = [];
  let lastMove = 0;
  let timer = null;

  function sample(event, button) {
    const point = {
      t: Date.now(),
      // Raw screen position, plus the metrics needed to normalise it later.
      screenX: event.screenX,
      screenY: event.screenY,
      sw: screen.width || 0,
      sh: screen.height || 0,
      al: typeof screen.availLeft === "number" ? screen.availLeft : 0,
      at: typeof screen.availTop === "number" ? screen.availTop : 0,
    };
    // Viewport coordinates only make sense for the top frame — inside an
    // iframe they're relative to the iframe, not the captured tab. Both
    // sides of this ratio are CSS pixels, so zoom cancels out.
    if (isTopFrame) {
      point.vx = event.clientX / (window.innerWidth || 1);
      point.vy = event.clientY / (window.innerHeight || 1);
    }
    if (button !== undefined) point.click = button;
    return point;
  }

  function onMove(event) {
    const now = Date.now();
    if (now - lastMove < MIN_MOVE_MS) return;
    lastMove = now;
    buffer.push(sample(event));
  }

  function onDown(event) {
    buffer.push(sample(event, event.button));
  }

  function flush() {
    if (!buffer.length) return;
    const batch = buffer;
    buffer = [];
    chrome.runtime.sendMessage({ type: "batch", events: batch }).catch(() => {});
  }

  function start() {
    if (listening) return;
    listening = true;
    window.addEventListener("pointermove", onMove, true);
    window.addEventListener("pointerdown", onDown, true);
    timer = setInterval(flush, FLUSH_MS);
  }

  function stop() {
    if (!listening) return;
    listening = false;
    window.removeEventListener("pointermove", onMove, true);
    window.removeEventListener("pointerdown", onDown, true);
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
    flush();
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "collect-start") start();
    else if (message?.type === "collect-stop") stop();
    return false;
  });

  // A tab (or frame) that appears mid-recording should join in.
  chrome.runtime
    .sendMessage({ type: "state" })
    .then((state) => {
      if (state?.recording) start();
    })
    .catch(() => {});
})();
