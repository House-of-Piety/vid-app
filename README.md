# Chapter Player

An offline-first web app (PWA) that plays local audio and video files with chapter marks, jumps to any chapter, and always resumes where you left off. Dark, dense, keyboard-friendly player UI, plus a VR mode for watching with an iPhone in a Cardboard-style viewer.

- Runs on **Windows** (Edge/Chrome, installed as an app) and **iPhone** (Safari → Share → Add to Home Screen).
- After the first visit it works with **no internet at all**. No backend, no accounts, no analytics.
- **Media never leaves the device.** Files are read locally; nothing is uploaded.

Live: <https://house-of-piety.github.io/vid-app/>

## Features

- Chapters from a sidecar `name.chapters.vtt`, MP4/M4B Nero `chpl`, the QuickTime chapter track, or MP3 ID3 `CHAP` frames (in that order).
- Resume: position, chapter, speed and volume saved every 5 s and on pause / seek / chapter change / app hide; reopening jumps back 3 s with a "Resumed at …" toast and a Start-over button. Continue list on the home screen.
- Seek bar with chapter ticks and a time + chapter tooltip, chapters drawer (PC) / bottom sheet (iPhone), speed 0.5×–3× per file, captions.
- Lock screen / headphone controls (Media Session): play/pause, ±10/30 s, previous/next **chapter**.
- Library: "Open folder" on PC (remembered between launches), "Open file(s)" everywhere, drag and drop.
- "Keep in app": copy a file and its .vtt files into app storage so it reopens with one tap, even offline on iPhone.
- VR mode: stereo virtual screen with lens-distortion correction that uses the same viewer profile as the Google Cardboard app (scan the viewer's QR code), head tracking, in-VR controls (gaze, tap, or a VR Box / Bluetooth game-controller remote), test pattern and fine-tuning. The phone model defaults to iPhone 13 Pro.

## Supported formats

| | Windows (Chrome/Edge) | iPhone (Safari) |
|---|---|---|
| M4B, M4A, MP4, M4V, MP3, AAC, WAV | ✓ | ✓ |
| WebM, OGG/Opus | ✓ | ✗ |
| MKV | most files | ✗ |

When a file can't play, the app says so plainly (for example "iPhone can't play MKV files.").

## Kokoromake file conventions

Files with the same `<name>` belong together:

| File | What it is |
|---|---|
| `<name>.m4b` | AAC audio with embedded chapters (Nero `chpl` + QuickTime chapter track, written by ffmpeg) |
| `<name>.mp4` | H.264/AAC video with the same chapters |
| `<name>.chapters.vtt` | WebVTT chapter list, one cue per chapter, cue text = title (takes priority over embedded chapters) |
| `<name>.captions.vtt` | Timed captions of the narration (shown as a transcript line for audio, or captions on video) |

Select the media file and its `.vtt` files together (or open the whole folder on PC).

## Run locally

Needs Node.js 22+.

```powershell
npm install
npm run dev        # http://localhost:5173/vid-app/
npm test           # unit tests (Vitest)
npm run build
npm run preview    # production build with the service worker: http://localhost:4173/vid-app/
```

Regenerate test fixtures (needs ffmpeg on PATH): `npm run fixtures` and `npm run fixtures:qr`. Regenerate the icons: `npm run icons`.

## Repositories and deploy

The same `main` branch lives in two repositories:

| Remote | Repository | Role |
|---|---|---|
| `origin` | [House-of-Piety/Video-control](https://github.com/House-of-Piety/Video-control) (private) | Development and handover docs. The deploy workflow is skipped here. |
| `pages` | [House-of-Piety/vid-app](https://github.com/House-of-Piety/vid-app) (public) | Hosts the live site. |

To publish, push `main` to the `pages` remote:

```powershell
git push pages main
```

That runs [.github/workflows/deploy.yml](.github/workflows/deploy.yml) in vid-app: install → test → build → publish `dist/` to GitHub Pages. The workflow only runs when the repository is `House-of-Piety/vid-app`.

Pages setup (already done): vid-app is public, **Settings → Pages → Source** is **GitHub Actions**, and the org allows Pages creation. The Vite `base` is `/vid-app/` (see [vite.config.ts](vite.config.ts)); change it if the deploy repository is renamed.

## Testing on iPhone

See [docs/IPHONE_TEST.md](docs/IPHONE_TEST.md).
