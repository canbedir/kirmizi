// Coordinator for the companion extension.
//
// Holds the pointer buffer for one recording and tells the per-tab collectors
// when to listen. Nothing is written to storage and nothing is sent anywhere:
// the buffer lives in memory until the app collects it, then it's dropped.

let recording = false;
let events = [];
// The OS's own account of the connected displays, in the same coordinate
// space as event.screenX/screenY. This is what click positions are measured
// against — page-reported screen metrics have proven unreliable (zoom,
// fingerprint shielding, and scaled desktops all distort them).
let displays = null;

function refreshDisplays() {
  try {
    chrome.system.display.getInfo((info) => {
      if (chrome.runtime.lastError || !info) return;
      displays = info.map((d) => ({
        left: d.bounds.left,
        top: d.bounds.top,
        width: d.bounds.width,
        height: d.bounds.height,
        primary: !!d.isPrimary,
      }));
    });
  } catch {
    displays = null;
  }
}

refreshDisplays();
try {
  chrome.system.display.onDisplayChanged.addListener(refreshDisplays);
} catch {
  /* not available — the app falls back to page-reported metrics */
}

// A hard ceiling so a forgotten recording can't grow without bound. At the
// collector's sampling rate this is roughly three hours of movement.
const MAX_EVENTS = 1_500_000;

// Only tab ids are read here, which chrome.tabs.query returns without the
// "tabs" permission — so the extension never asks for one.
function broadcast(message) {
  chrome.tabs.query({}, (tabs) => {
    for (const tab of tabs) {
      if (tab.id == null) continue;
      // Tabs without a content script (settings pages, the web store) simply
      // have no receiver — that's expected, not an error.
      chrome.tabs.sendMessage(tab.id, message).catch(() => {});
    }
  });
}

// How long to let collectors hand over their last partial batch on stop.
// Comfortably more than their flush interval.
const DRAIN_MS = 450;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  switch (message?.type) {
    case "start":
      recording = true;
      events = [];
      refreshDisplays();
      broadcast({ type: "collect-start" });
      sendResponse({ ok: true });
      break;

    case "stop": {
      // Telling the collectors to stop is asynchronous, so reading the buffer
      // straight away drops everything still sitting in their batches —
      // including, reliably, the click that ended the recording. Keep
      // accepting batches until they've drained.
      broadcast({ type: "collect-stop" });
      setTimeout(() => {
        recording = false;
        const collected = events;
        events = [];
        sendResponse({ ok: true, events: collected, displays });
      }, DRAIN_MS);
      return true; // keep the message channel open for the async reply
    }

    case "batch": {
      if (!recording || !message.events?.length || events.length >= MAX_EVENTS) {
        sendResponse({ ok: true });
        break;
      }
      // Stamp each event with the sending tab's zoom factor and its window's
      // true bounds. Both come from the browser itself rather than the page,
      // which matters: pages can't be trusted about screen geometry (Brave's
      // fingerprinting protection spoofs screenX/screenY and screen.width),
      // but extension APIs sit outside that shielding. With the window's
      // real position plus genuine client coordinates, the app reconstructs
      // exact screen positions.
      const tabId = _sender.tab?.id;
      const windowId = _sender.tab?.windowId;
      const accept = (zoom, win) => {
        for (const event of message.events) {
          event.zoom = zoom;
          if (win) event.win = win;
          events.push(event);
        }
        sendResponse({ ok: true });
      };
      const zoomP =
        tabId != null && chrome.tabs.getZoom
          ? chrome.tabs.getZoom(tabId).catch(() => 1)
          : Promise.resolve(1);
      const winP =
        windowId != null && chrome.windows?.get
          ? chrome.windows
              .get(windowId)
              .then((w) => ({
                left: w.left ?? 0,
                top: w.top ?? 0,
                width: w.width ?? 0,
                height: w.height ?? 0,
                state: w.state,
              }))
              .catch(() => null)
          : Promise.resolve(null);
      Promise.all([zoomP, winP]).then(([zoom, win]) => accept(zoom, win));
      return true; // async sendResponse
    }

    case "state":
      sendResponse({ recording });
      break;

    default:
      sendResponse({ ok: false });
  }
  return false;
});
