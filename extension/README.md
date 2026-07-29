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

## How the pieces fit

| File            | Role                                                                |
| --------------- | ------------------------------------------------------------------- |
| `bridge.js`     | Runs only on Kırmızı; relays `window.postMessage` ↔ extension messaging. |
| `collector.js`  | Runs in every frame; listens for pointer events while recording.     |
| `background.js` | Holds the buffer for one recording and starts/stops the collectors.  |
