// The only script that talks to the Kırmızı page.
//
// It relays between the page's window.postMessage protocol and the
// extension's own messaging. Going through postMessage rather than
// chrome.runtime means the app never needs to know the extension's ID, which
// differs between an unpacked build and the store one.

(() => {
  const APP = "kirmizi-app";
  const EXT = "kirmizi-companion";
  const version = chrome.runtime.getManifest().version;

  function reply(requestId, type, extra) {
    window.postMessage({ source: EXT, type, requestId, ...extra }, "*");
  }

  window.addEventListener("message", async (event) => {
    if (event.source !== window) return;
    const message = event.data;
    if (!message || message.source !== APP) return;
    const { type, requestId } = message;

    try {
      if (type === "ping") {
        reply(requestId, "ready", { version });
        return;
      }
      if (type === "start") {
        await chrome.runtime.sendMessage({ type: "start" });
        reply(requestId, "started", {});
        return;
      }
      if (type === "stop") {
        const result = await chrome.runtime.sendMessage({ type: "stop" });
        reply(requestId, "events", {
          events: result?.events ?? [],
          displays: result?.displays ?? null,
        });
        return;
      }
    } catch (error) {
      reply(requestId, "error", { message: String(error) });
    }
  });

  // Announce ourselves for a page that loaded before this script did.
  window.postMessage({ source: EXT, type: "ready", version }, "*");
})();
