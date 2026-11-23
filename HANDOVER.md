# Handover — Chapter Player

## Last session

2026-11-23 — Built Chapter Player from scratch: an offline-first PWA (Vite + React + TypeScript) that plays local audio/video with chapters, resumes reliably, keeps files in app storage, supports lock-screen/headphone chapter controls, and has a Cardboard VR mode that reads the viewer's QR code profile and does its own lens-distortion pass. Deployed to GitHub Pages from `House-of-Piety/vid-app`; development and docs live in `House-of-Piety/Video-control`. Checked vid-app for personal information (none found). Not yet tested on an iPhone.

## What changed

- 2026-11-23 — Scaffold, theme, chapter parsers (VTT, chpl, QuickTime chapter track, ID3) + ffmpeg fixtures and tests.
- 2026-11-23 — Player, chapters panel, resume (IndexedDB + localStorage mirror), library (Open folder / files / drag-drop), Keep in app (OPFS → worker → IndexedDB), Media Session, captions, PWA shell, original icon, Help screen.
- 2026-11-23 — VR core: viewer-profile protobuf decoder/encoder, QR import/export, iPhone screen table, distortion maths + tests.
- 2026-11-23 — VR runtime: WebGL2 stereo renderer, head tracking, gaze/tap HUD, test pattern with live fine-tune, viewer settings UI.
- 2026-11-23 — GitHub Pages workflow, README, CLAUDE.md, iPhone checklist; base path `/vid-app/`; deployed.
- 2026-11-23 — Remotes split: `origin` = Video-control, `pages` = vid-app; deploy workflow only runs in vid-app.

## Pending tasks

- [ ] Run [docs/IPHONE_TEST.md](docs/IPHONE_TEST.md) on the iPhone (User).
- [ ] Fix issues found by the iPhone test, then redeploy with `git push pages main` (ask User first).
- [ ] Confirm the live site cold-starts with the network off (Edge, installed as an app).
- [ ] Try "Open folder" in Edge with a real Kokoromake output folder, including the reopen-permission flow after restarting.
- [ ] Optional: update GitHub Actions versions when Node-24 releases are out.
- [x] Deploy to GitHub Pages (2026-11-23).
- [x] Check vid-app for personal information (2026-11-23).

## Needs testing

- [ ] iPhone: background audio with screen locked; lock-screen ⏮/⏭ = chapters; AirPods.
- [ ] iPhone: Keep in app backend (OPFS on Safari 26+, worker fallback before) and reopen after the app is killed.
- [ ] iPhone: VR — camera QR scan, photo import, phone model, test pattern through the lenses with glasses, head tracking + recenter, gaze dwell, 20+ min wake lock (needs iOS 18.4+ in standalone).
- [ ] VR frame rate on iPhone 13 Pro (target 60 fps).

## Pending decisions

- None open.

## Risks

- Wake Lock doesn't work in home-screen web apps before iOS 18.4 — the screen may dim in VR on older iOS.
- Files not kept in app can't be reopened automatically on iPhone (platform limit); the app asks to pick them again.
- Pushing to `pages` publishes publicly; keep personal information out of commits and docs.

## Who to contact

- User (project owner) — decisions, iPhone testing, GitHub org settings.

## Where everything lives

- Live site: https://house-of-piety.github.io/vid-app/
- Deploy repo (public): https://github.com/House-of-Piety/vid-app — remote `pages`.
- Dev + docs repo (private): https://github.com/House-of-Piety/Video-control — remote `origin`.
- Workflow: [.github/workflows/deploy.yml](.github/workflows/deploy.yml).
- Architecture, decisions, browser-support findings: [CLAUDE.md](CLAUDE.md). Current state: [ACTIVE_CONTEXT.md](ACTIVE_CONTEXT.md). How to run/deploy: [README.md](README.md).
- VR module (reusable, self-contained): `src/vr/`.
