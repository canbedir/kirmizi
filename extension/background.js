// Coordinator for the companion extension.
//
// Holds the pointer buffer for one recording and tells the per-tab collectors
// when to listen. Nothing is written to storage and nothing is sent anywhere:
// the buffer lives in memory until the app collects it, then it's dropped.

let recording = false;
let events = [];

// A hard ceiling so a forgotten recording can't grow without bound. At the
// collector's sampling rate this is roughly three hours of movement.
const MAX_EVENTS = 1_500_000;

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

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  switch (message?.type) {
    case "start":
      recording = true;
      events = [];
      broadcast({ type: "collect-start" });
      sendResponse({ ok: true });
      break;

    case "stop": {
      recording = false;
      broadcast({ type: "collect-stop" });
      const collected = events;
      events = [];
      sendResponse({ ok: true, events: collected });
      break;
    }

    case "batch":
      if (recording && message.events?.length && events.length < MAX_EVENTS) {
        events.push(...message.events);
      }
      sendResponse({ ok: true });
      break;

    case "state":
      sendResponse({ recording });
      break;

    default:
      sendResponse({ ok: false });
  }
  return false;
});
