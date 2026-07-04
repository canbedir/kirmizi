<p align="center">
  <img src="public/kirmizi-logo.png" alt="Kırmızı" width="92" />
</p>

<h1 align="center">Kırmızı</h1>

<p align="center">
  A privacy-first, browser-native screen recorder.<br />
  Record your screen — nothing leaves your browser.
</p>

<p align="center">
  <a href="https://kirmizi.app"><strong>kirmizi.app</strong></a>
</p>

---

## Overview

Kırmızı is a screen recorder that runs **entirely in the browser**. Users
capture, edit, and download screen recordings without an account, an upload, or
a watermark.

Every recording is assembled locally as a file and saved directly to the user's
device. There is **no backend for media** — nothing is transmitted to a server,
and nothing persists once the tab is closed. Privacy is a structural guarantee
of the architecture, not a policy.

## Features

| Capability          | Description                                                                 |
| ------------------- | --------------------------------------------------------------------------- |
| Local-only capture  | The file is built on the device and never uploaded.                         |
| No account          | No sign-up, no watermark, no tracking.                                       |
| Audio               | Microphone capture mixed with system audio via the Web Audio API.           |
| Webcam overlay      | An optional camera bubble composited onto a canvas, fully configurable.      |
| In-browser editor   | Multi-cut timeline with filmstrip, per-segment mute and speed, and undo/redo. |
| Export formats      | MP4 when the browser can encode it, WebM everywhere else.                    |
| Capture settings    | Resolution, frame rate, and countdown, chosen before recording.             |
| Keyboard shortcuts  | `R` record · `S` stop / split · `Space` play · `Ctrl`+`Z` undo.             |

## Architecture

The application is a single [Next.js](https://nextjs.org) project composed of two
surfaces — a marketing landing page (`/`) and the recorder (`/record`) — built on
a small set of web-platform APIs:

| API                                 | Role                                             |
| ----------------------------------- | ------------------------------------------------ |
| `navigator.mediaDevices.getDisplayMedia()` | Screen, window, or tab capture.           |
| `getUserMedia()` + Web Audio API    | Microphone capture and audio mixing.             |
| `<canvas>` + `captureStream()`      | Webcam compositing and edited-clip re-encoding.  |
| `MediaRecorder`                     | Encoding the stream to a `Blob`.                 |
| `URL.createObjectURL` + `<a download>` | Saving the file locally.                      |

No database, no authentication, and no server-side media handling are involved.

## Tech stack

- **Next.js (App Router)** · **TypeScript**
- **Tailwind CSS** · **shadcn/ui**
- **motion** — animation
- **next-themes** — light / dark theming
- Type: **Junicode** (display), **Bricolage Grotesque** (UI), **Geist Mono** (technical)

## Getting started

```bash
npm install
npm run dev            # http://localhost:3000
```

`getDisplayMedia` requires a secure context, so recording is available on
`localhost` during development and over HTTPS in production.

```bash
npm run build && npm run start    # production build
```

## Browser support

Kırmızı targets desktop **Chromium (Chrome / Edge)** and **Firefox**, where
support is strongest. Safari's implementation is partial; the app feature-detects
the required APIs and presents a clear fallback where they are unavailable.
Microphone capture is reliable across browsers, while system-audio capture is
best-effort and depends on the browser and operating system.

## License

Released under the [MIT License](./LICENSE).
