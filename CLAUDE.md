# CLAUDE.md — Chapter Player

Offline-first PWA (Vite + React + TypeScript strict, plain CSS) that plays local audio/video with chapters, resumes reliably, and has a Cardboard VR mode. The owner is referred to as "User" in docs. Live at https://house-of-piety.github.io/vid-app/.

Current state and next steps: [ACTIVE_CONTEXT.md](ACTIVE_CONTEXT.md). Handover: [HANDOVER.md](HANDOVER.md).

## Repositories

- `origin` = `House-of-Piety/Video-control` (private): development and handover docs. `git push` goes here. The deploy workflow is skipped in this repo (`if: github.repository == 'House-of-Piety/vid-app'`).
- `pages` = `House-of-Piety/vid-app` (public): the live site. `git push pages main` deploys. **Ask User before pushing to `pages`** — it publishes publicly.
- Pages is configured (source: GitHub Actions; the org's "allow Pages creation" setting is on).

## User's standing rules (verbatim where quoted)

- "In project docs (README.md, CLAUDE.md, etc.) refer to me as \"User\"."
- "Make sure no personal information is saved on vid-app." — no real names, emails or local user paths in files, docs or commit messages. Commits use the GitHub no-reply address.
- "Media never leaves the device and is never uploaded. Never commit media files" (test fixtures in `tests/fixtures/` are the exception).
- "After the first visit the app must work with no internet at all. No backend, no accounts, no analytics, no CDN fonts/scripts."
- "Do not use VLC's name, logo or traffic-cone icon; design an original icon."
- "Commit after each step with a clear message."
- "When something has to be decided and isn't covered here, pick the simplest option that works offline on both iPhone and Windows, and note it in CLAUDE.md."
- Put all VR code in `src/vr/` with no dependencies on the rest of the app.

## Environment notes

- Windows PC; Node.js LTS installed with winget at `C:\Program Files\nodejs` (in Git Bash prepend it to `PATH` if `node` isn't found). ffmpeg is on PATH.
- `.claude/launch.json` has `dev` (5173) and `preview` (4173) configs for the browser pane. A hidden browser pane pauses `requestAnimationFrame`, so VR shows nothing until the pane is visible.

## Commands

```powershell
npm run dev          # Vite dev server, http://localhost:5173/vid-app/
npm test             # Vitest (node environment), tests/*.test.ts
npm run build        # tsc -b && vite build (+ service worker)
npm run preview      # serve dist/ on :4173 — use this to test offline/SW behaviour
npm run fixtures     # regenerate tests/fixtures media with ffmpeg
npm run fixtures:qr  # regenerate the viewer QR PNG fixtures
npm run icons        # regenerate public/ icons from scripts/make-icons.mjs
```

Manual testing in a browser: drop files onto the window (drag-and-drop), or put long local test media in `tmp-media/` (gitignored) — the dev server serves it at `/vid-app/tmp-media/…`. Append `?vrdebug` to the URL to keep the WebGL drawing buffer so screenshots of VR mode work.

## Architecture

```
src/
  lib/                 app logic, no React
    chapters/          parsers: vtt.ts, mp4.ts (chpl + QuickTime chapter track), id3.ts, index.ts (priority order)
    resume.ts          resume key + finished/rewind rules (pure)
    resumeStore.ts     IndexedDB + synchronous localStorage mirror
    chapterNav.ts      current/prev/next chapter, time formatting (pure)
    media.ts           MediaItem, extensions, playability messages, sidecar grouping
    library.ts         showDirectoryPicker scan, persisted directory handle
    importStore.ts     "Keep in app" (OPFS / OPFS worker / IndexedDB blobs)
    opfsWorker.ts      createSyncAccessHandle writer
    idb.ts, cover.ts
  components/          React UI: Home, Player, SeekBar, ChaptersPanel, Help, UpdatePrompt, VRHost (glue), VRSettingsScreen
  vr/                  self-contained Cardboard module — imports nothing from lib/ or components/
    protobuf.ts        tiny protobuf reader/writer
    profile.ts         DeviceParams decode/encode, cfg?p= URLs, short links, presets
    qr.ts              jsQR decode (image data, photo, camera), qrcode-generator export
    screens.ts         iPhone physical screen table + bank-card calibration
    distortion.ts      r' = r(1 + k1 r² + k2 r⁴ …), Newton inverse
    lens.ts            Cardboard-SDK eye FOV, lens centres, distortion mesh, shrink-to-fit
    math.ts            mat4 / quaternion, deviceorientation → camera quaternion
    renderer.ts        WebGL2: per-eye FBO scene → distortion mesh pass, separator + alignment marker
    hud.ts, session.ts VR runtime: canvas sizing, head tracking, gaze/tap HUD, wake lock
    store.ts           own IndexedDB ("cardboard-vr"): profiles, active, phone, per-profile fine-tune
    ui/                React: VRView (start screen + running session), VRSettings, PhonePicker
tests/                 chapters, resume/nav, vr (profiles, distortion, lens layout, QR images) + fixtures
```

The `src/vr` folder can be copied into another project: it needs only React (for `ui/`), `jsqr` and `qrcode-generator`. `vr/ui/vr.css` uses the host's CSS variables when present, with fallbacks.

## Key decisions

- **Chapter priority:** sidecar `.chapters.vtt` → Nero `chpl` → QuickTime chapter track (`tref/chap`) → ID3 `CHAP` → none. All parsing uses `Blob.slice()`; only the `moov` box (or the ID3 tag) is read, never the whole file. `moov` is found by walking top-level box headers, so it can be at the start or the end; 64-bit sizes handled.
- **Resume key** = NFC-normalised lower-case file name + size in bytes + rounded duration (`lastModified` deliberately not used). Duration comes from the media element after `loadedmetadata`.
- **Saving**: every 5 s while playing and on pause, seek, chapter change, `visibilitychange`→hidden, `pagehide` and when leaving the player. Each save writes IndexedDB **and** a synchronous `localStorage` copy; reads take the newer one (protects against a `pagehide` IDB transaction being cut short). The initial resume seek doesn't trigger a save (otherwise each reopen would rewind another 3 s).
- **Finished** = within the last 15 s **or** past 98 % → next open starts at 0. Note: for anything longer than 12.5 min the 98 % rule triggers first.
- **Continue list** finds the file again by name + size (imported items, the scanned folder, or files opened this session). Otherwise it asks to pick the file again and opens the match straight away.
- **Home stays mounted** (hidden) while the player is open so the scanned library and opened files survive.
- **Player** uses `<audio>` for audio (reliable background playback on iOS) and `<video playsinline>` for video. The element ref is kept separately because React detaches refs before unmount cleanups run; the element is paused on unmount (a detached element keeps playing otherwise).
- **Media Session**: title = file name, artist = chapter, album = folder; previous/next track = previous/next chapter; `setPositionState` kept in sync; a generated PNG cover is used as artwork.
- **PWA**: `vite-plugin-pwa` generateSW, `registerType: 'prompt'`, all built assets precached (`globPatterns`), `navigateFallback` to `index.html`. The update banner never reloads on its own.
- **No runtime network**: system fonts, inline SVG icons, bundled QR libraries. The icon is an original design (play triangle over a timeline with chapter ticks), drawn by `scripts/make-icons.mjs`.
- **VR placement**: the canvas covers the full screen, ignoring safe areas, because lens centres are placed by physical millimetres (inter-lens distance, tray-to-lens minus the SDK's 3 mm border, vertical alignment). On the actual phone (CSS screen size matches the chosen model) CSS px map to mm directly; on a desktop the canvas is letterboxed to the chosen phone's aspect as a preview. In Safari with browser bars the mapping is approximate; in standalone mode it's exact.
- **VR distortion** follows the Cardboard SDK: eye FOV = min(profile FOV, screen edge seen through the lens); the mesh maps a grid in undistorted tan-angle texture space to the screen via the inverse distortion. Fine-tune scales k1/k2 (0–150 %), shifts IPD/vertical (mm), zoom scales the scene projection only (so straight lines stay straight). "Shrink to fit" (default on) caps the virtual-screen width at 90 % of the narrowest visible half-angle — important with glasses.
- **Captions — one track only**: a video can expose the sidecar `<track>` *and* subtitle tracks embedded in the MP4 (Safari shows embedded `mov_text`; Kokoromake MP4s have one). Showing all of them drew every line twice on iPhone. The player now shows exactly one: the sidecar `.captions.vtt` if present, else the first embedded subtitles/captions track; all others are `disabled`. The `<track>` has no `default` attribute (the effect sets the mode). In VR, embedded captions come from the chosen track's `activeCues`.
- **SBS 3D**: left half → left eye, right half → right eye, displayed at the full frame's aspect (assumes half-width SBS, the common format).
- **VR controls**: tap toggles the HUD. With head tracking: gaze dwell 1.5 s or tap while looking at a button; tap elsewhere hides the HUD. Without: tap cycles the highlight, long press (≥ 600 ms) activates; HUD auto-hides after 10 s. Desktop preview: drag to look, H/Enter/arrows/R/Esc keys. The test pattern uses the same HUD with Less / Next setting / More to fine-tune live while wearing the viewer.
- **VR Box / Bluetooth remote** (`src/vr/gamepad.ts`, polled every frame through the Gamepad API): stick / d-pad / hat axis 9 → left/right (move highlight, or prev/next chapter when the HUD is hidden; repeats while held), up = show HUD, down = hide; button 0 select, 1 back, 2/3 play-pause, 4/6 prev chapter, 5/7 next chapter, 8 recenter, 9 toggle HUD. Keyboard and remote share one action map (`handleAction`). After a remote/keyboard move, gaze doesn't take over the highlight for 4 s. Remotes in iOS/music mode send media keys, which reach the player's Media Session handlers (play/pause, chapters). Not tested with a real remote; iOS Safari may not expose cheap HID remotes in game mode.
- **Default phone** is the iPhone 13 Pro screen (the `iphone-12` table entry, same panel) until User picks another; set in `vr/store.ts` `loadConfig`.
- **SW update during VR / playback**: only on the user's "Reload" tap.
- **Viewer profile protobuf**: field numbers 1 vendor, 2 model, 3 screen_to_lens, 4 inter_lens, 5 FOV (packed floats), 6 tray_to_lens, 7 distortion (packed floats), 10 has_magnet, 11 vertical_alignment, 12 primary_button; unknown fields (incl. fixed64) skipped. The View-Master test vector has `has_magnet = false` (field 10 = 0).
- `g.co/cardboard` → built-in Cardboard v1 profile (Cardboard SDK values: 42 mm, 60 mm, 40°, k = 0.441, 0.156). Other short links get instructions (they can't be resolved offline / through CORS).

## Browser-support findings (checked November 2026)

- **OPFS writes on Safari/WebKit**: `FileSystemFileHandle.createWritable()` / `FileSystemWritableFileStream` first shipped in **Safari 26** (WebKit bugs 254726, 283841, 284735; MDN BCD lists Safari 26). Older Safari (15.2+) only allows OPFS writes through `createSyncAccessHandle()` **in a worker**. Chrome/Edge support `createWritable()` on the main thread.
  → `importStore.ts` detects: `createWritable` on the main thread → `createSyncAccessHandle` in `opfsWorker.ts` → IndexedDB Blob fallback. The chosen backend is shown under "Kept in app".
  Sources: <https://bugs.webkit.org/show_bug.cgi?id=254726>, <https://bugs.webkit.org/show_bug.cgi?id=231706>, <https://caniuse.com/mdn-api_filesystemwritablefilestream>.
- **Screen Wake Lock in iOS standalone (home-screen) web apps**: supported by Safari since 16.4, but it **did not work in home-screen apps until iOS 18.4**, where Apple fixed it (WebKit bug 254545). On iOS < 18.4 in standalone mode the screen may dim in VR; the app requests the lock anyway and re-acquires it when the page becomes visible again.
  Sources: <https://bugs.webkit.org/show_bug.cgi?id=254545>, <https://progressier.com/pwa-capabilities/screen-wake-lock>.
- iOS: no `BarcodeDetector` → bundled jsQR. `DeviceOrientationEvent.requestPermission()` must be called from a tap and needs HTTPS. No `screen.orientation.lock()` for web apps → "Turn your phone to landscape" screen. No element fullscreen for non-video elements on iPhone → `webkitEnterFullscreen()` on the video.
- iOS can't play WebM/OGG/MKV; the app says so instead of failing silently.

## Tests

`npm test` runs:
- `tests/chapters.test.ts` — every parser against every fixture (titles with `;`, `=`, `#`, accents, ñ, em dash; times to the millisecond), moov-at-end without whole-file reads, priority order, VTT edge cases.
- `tests/resume.test.ts` — resume key, finished rules, rewind, previous/next chapter logic.
- `tests/vr.test.ts` — both viewer test vectors (every field), URL variants, export→import round trip, unknown fields, short links, distortion inverse (< 0.001), iPhone 13 Pro lens-centre placement, FOV clipping, mesh halves, shrink-to-fit, QR PNG decoding.

Fixtures in `tests/fixtures/` are generated by the scripts and committed (a few KB each).

## Known limits / not verified here

- Not yet verified on a real iPhone: use `docs/IPHONE_TEST.md`. VR 60 fps on iPhone 13 Pro is the design target (video uploaded straight from the `<video>` element with `requestVideoFrameCallback`, ~1.2× eye buffers) but has only been run in desktop Chrome.
- Build-time `npm audit` reports moderate issues in `workbox-build`'s `minimatch` (dev dependency only, not shipped).
