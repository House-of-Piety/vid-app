# Active context — 2026-11-23

## What's live

- https://house-of-piety.github.io/vid-app/ — deployed from `House-of-Piety/vid-app` (commit `88d9ad9`, "Deploy under /vid-app/"). Loads, registers the service worker and precaches the app; the second load is served by the service worker.
- `House-of-Piety/Video-control` (private) holds the same code plus the handover docs. It is ahead of vid-app: the captions fix, VR remote support and default phone are NOT live until `git push pages main` (ask User).

## Done and verified this session (desktop Chrome / browser pane)

- Chapter parsers (sidecar VTT, Nero chpl, QuickTime chapter track, ID3 CHAP) — 53 unit tests pass locally and in GitHub Actions.
- Player: chapters panel, keyboard chapter jumps, captions line, video playback.
- Resume across a full reload ("Resumed at 0:47 — …" toast), Continue list with "Pick the file again to resume".
- Keep in app via OPFS, reopened after reload without the original file.
- Offline cold start (local preview with the server stopped).
- VR desktop preview: test pattern with lens pre-distortion, live fine-tune HUD, video and audio cover on the virtual screen, HUD chapter jump, exit back to the player.
- Audit of vid-app for personal information: none found (files, full history, media tags, PNG metadata, live HTML).

- Captions: only one text track shows (sidecar preferred, else embedded), checked in Chrome with a simulated embedded track.
- VR remote: simulated gamepad in Chrome — buttons, stick, chapter jumps, play/pause, HUD navigation to Exit VR. Default phone = iPhone 13 Pro on a fresh install.

## Not verified (to check)

- Everything on a real iPhone: install to home screen, airplane-mode cold start, Files picker with .vtt, background audio, lock-screen chapter buttons, AirPods, OPFS backend actually chosen, motion permission + head tracking, wake lock in standalone, VR frame rate (target 60 fps on iPhone 13 Pro), camera QR scan. Checklist: [docs/IPHONE_TEST.md](docs/IPHONE_TEST.md).
- Live site with the network actually off (only the local preview was tested offline).
- "Open folder" on Edge with a real folder (the persisted-handle reopen flow wasn't clicked through).
- A real VR Box remote (only a simulated gamepad was used); real embedded-subtitle MP4 on iPhone.
- Lens correctness through real Cardboard lenses (only the maths is tested).

## Known limits

- Files longer than 12.5 min: the 98 % rule marks them finished before the "last 15 s" rule (by design of the two rules).
- SBS 3D assumes half-width side-by-side.
- In Safari with browser bars (not installed), the VR lens placement is approximate; it's exact in standalone mode.
- GitHub Actions warns that `actions/*@v4/v5` run on Node 20 (deprecated, forced to Node 24). Harmless for now.
- `npm audit`: moderate issues in a build-time dependency of vite-plugin-pwa (not shipped).

## Next steps, in order

1. User runs [docs/IPHONE_TEST.md](docs/IPHONE_TEST.md) on the iPhone and reports what fails.
2. Fix whatever the iPhone test finds; then `git push` (Video-control) and, with User's OK, `git push pages main` to redeploy.
3. Optional: bump GitHub Actions to Node-24 versions when available.

## Open questions for User

- None blocking. Waiting on iPhone test results.
