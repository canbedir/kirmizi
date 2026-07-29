# Kırmızı Companion

An optional Chrome extension that lets Kırmızı redraw your cursor, add click
effects, and zoom into what you clicked.

## Why it exists

A web page can't observe the pointer on surfaces it doesn't own — that's a
deliberate browser boundary, and a good one. `getDisplayMedia` hands over
pixels, never events. So the only way to know where the cursor went is to have
something running inside the page being recorded.

This extension is that something, and nothing more. It collects pointer
positions and click times, keeps them in memory, and hands them to the
Kırmızı tab when the recording stops. There is no storage, no network access,
and nothing about the pages you visit — no URL, no content, no element — is
ever read. Positions are normalised to fractions of the screen or viewport the
moment they're captured.

## Install (unpacked)

1. Open `chrome://extensions`
2. Turn on **Developer mode**
3. **Load unpacked** → pick this `extension/` folder

Reload the Kırmızı tab afterwards. Record as usual: with the companion
installed, the recording is captured without the system cursor and the editor
gains a **Cursor** panel and an **Auto zoom** button.

## What works where

| Captured surface | Cursor data |
| ---------------- | ----------- |
| A browser tab    | Yes — tracked across the page, including iframes on screen captures |
| A whole screen   | Yes |
| A single window  | No — a window's position on screen isn't exposed, so coordinates can't be matched |

## Publishing to the Chrome Web Store

The extension is written to survive review rather than argue with it: manifest
v3, one narrow purpose, no `tabs` permission (only tab ids are read, which
`chrome.tabs.query` returns without it), no storage, and no network access at
all.

What a submission needs:

1. **A developer account** — one-time $5 registration at the
   [Developer Dashboard](https://chrome.google.com/webstore/devconsole).
2. **A zip of this folder's contents** (the files, not the folder itself).
3. **Listing assets** — the 128px icon is in `icons/`; add at least one
   1280×800 screenshot showing the editor's cursor panel and auto zoom.
4. **A privacy policy URL** — <https://kirmizi.app/privacy>, which covers the
   extension explicitly.
5. **Data disclosure** — declare that "user activity" is collected, and that
   it is *not* sold, *not* transferred to third parties, and used only for the
   single advertised purpose.
6. **A justification for `<all_urls>`**, which is the one thing reviewers will
   look hardest at. It is genuinely required and worth saying plainly:

   > The extension records pointer coordinates and click timestamps in
   > whichever tab the user chooses to screen-record. The user picks that tab
   > at record time through the browser's own picker, so the extension cannot
   > know in advance which host it will need. It reads no page content, no
   > URLs, and no form data, and it transmits nothing — the coordinates are
   > handed to the user's own kirmizi.app tab and then discarded.

Expect a few days for review; broad host permissions can push it longer. The
app degrades gracefully in the meantime — every feature except cursor
tracking and auto zoom works without the extension.

## How the pieces fit

| File            | Role                                                                |
| --------------- | ------------------------------------------------------------------- |
| `bridge.js`     | Runs only on Kırmızı; relays `window.postMessage` ↔ extension messaging. |
| `collector.js`  | Runs in every frame; listens for pointer events while recording.     |
| `background.js` | Holds the buffer for one recording and starts/stops the collectors.  |
