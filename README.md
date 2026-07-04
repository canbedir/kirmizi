# Kırmızı

**Record your screen. Nothing leaves your browser.**

Kırmızı (Turkish for _"red"_ — the colour of the recording light) is a
privacy-first, no-signup screen recorder that runs **entirely in the browser**.
Open a tab, pick your screen, hit record. No account, no upload, no watermark —
every frame stays on your machine.

**[kirmizi.app](https://kirmizi.app)**

## Why

Every other screen recorder wants your email, your upload, your patience. Kırmızı
wants none of it. The recording is built as a local `Blob` and downloaded
straight to you — there is **no backend for your media**. Close the tab and it's
gone.

## Features

- **Local-only** — the file is built on your device and never uploaded.
- **No account, ever** — no sign-up, no watermark.
- **Mic + system audio** — mix in your voice; capture system sound where the
  browser allows it.
- **Webcam bubble** — an optional circular camera overlay, composited on a canvas.
- **In-browser editor** — a multi-cut timeline with filmstrip, per-segment mute
  and speed, and undo/redo.
- **mp4 or webm** — mp4 when the browser can encode it, webm everywhere else.
- **Countdown + keyboard shortcuts** — 3·2·1, then `R` record, `S` stop/split,
  `Space`, `Ctrl+Z`.

## How it works

The whole product is a few well-understood browser APIs stitched together:

- `navigator.mediaDevices.getDisplayMedia()` — screen / window / tab capture.
- `getUserMedia()` + the **Web Audio API** — capture the mic and mix it with
  system audio.
- `<canvas>` + `captureStream()` — composite the webcam bubble and re-encode
  edited clips.
- `MediaRecorder` — encode the stream to a `Blob`.
- `URL.createObjectURL` + an `<a download>` — save the file locally.

## Tech stack

- **Next.js (App Router)** + **TypeScript**
- **Tailwind CSS** + **shadcn/ui**
- **motion** (Framer Motion) for animation
- **next-themes** for the light/dark toggle
- Fonts: **Junicode** (display serif), **Bricolage Grotesque** (UI), **Geist
  Mono** (technical)

## Getting started

```bash
npm install
npm run dev      # http://localhost:3000
```

`getDisplayMedia` requires a secure context, so recording works on `localhost`
in dev and over HTTPS in production.

```bash
npm run build && npm run start   # production build
```

## Browser support

Best in **Chromium (Chrome / Edge)** and **Firefox** on desktop. Safari's
support is partial; Kırmızı feature-detects the APIs and shows a friendly note
where they're missing. System audio is best-effort across browsers/OSes; the mic
is the reliable path.

## Deploy

Deploys as a static-friendly Next.js app on **Vercel**, which provides the HTTPS
secure context `getDisplayMedia` needs. No database, no auth, no server-side
media handling.

## License

[MIT](./LICENSE) © hix
