# iPhone test checklist

Run on the iPhone after each deploy. Use files from Kokoromake (an `.m4b` with its `.chapters.vtt` and `.captions.vtt`, and an `.mp4`), copied to iCloud Drive or OneDrive (set to "Keep offline").

## Install and offline

- [ ] Open <https://house-of-piety.github.io/vid-app/> in Safari → Share → **Add to Home Screen**. Launch it from the home screen icon (no Safari bars visible).
- [ ] Close the app (swipe it away), turn on **Airplane mode**, launch it again: the home screen appears (cold start offline works).
- [ ] Turn Airplane mode off again for the rest (or keep it on, everything below should still work).

## Playback

- [ ] **Open file(s)** → in the Files picker select the `.m4b` **and** its `.chapters.vtt` and `.captions.vtt` together. (If .vtt files are greyed out, use "Pick any file type".)
- [ ] Open an `.mp4` that has embedded subtitles together with its `.captions.vtt`: each caption line appears **once**, centred near the bottom of the picture (above the controls while they're shown), also in fullscreen. Open the same `.mp4` alone: the embedded subtitles show, and the captions button toggles them.
- [ ] It plays; the cover shows the title and current chapter; the caption line updates under it; captions button toggles it.
- [ ] Chapters button → bottom sheet lists every chapter with start time and length, current one highlighted. Tap a chapter: it plays from its start. "Chapter X of Y" updates.
- [ ] Previous chapter: more than 3 s in → back to the chapter start; within the first 3 s → previous chapter.
- [ ] On the `.mp4`, pinch out: the video zooms in where your fingers are; one finger drags it around; pinching in returns to fit (snaps to "fill the screen" near it). The page itself never zooms, and a pinch doesn't pause. "Fit" pill resets. Works in portrait and landscape.
- [ ] Speed button → the speed panel is fully on screen (full width above the controls).
- [ ] Speed 1.5×, close the file, reopen: speed is still 1.5×.
- [ ] Open the `.mp4`: video plays inline; double-tap the right third = +10 s, left third = −10 s; no page zoom on double-tap; fullscreen works.

## Lock screen and background

- [ ] Play the `.m4b`, lock the phone: audio keeps playing. Lock screen shows the file name and the chapter title.
- [ ] Lock screen ⏮ / ⏭ jump to the previous / next **chapter**; play/pause works; the scrubber is in the right place.
- [ ] Switch to another app: audio keeps playing. (Video pausing in the background is normal iOS behaviour.)
- [ ] AirPods / headphone buttons: play/pause, double-press = next chapter, triple-press = previous chapter.

## Resume

- [ ] Play to about 12 minutes in, then swipe the app away (kill it). Relaunch: the home screen's **Continue** list shows the file with a progress bar and chapter title, plus "Pick the file again to resume".
- [ ] Pick the file again: it starts 3 s before where you left, with a "Resumed at 12:… — Chapter …" toast. "Start over" goes to 0:00.
- [ ] Play to the last 15 s and close: next time it starts from the beginning ("Finished").

## Keep in app

- [ ] On the `.m4b`, tap **Keep in app**; the percentage counts up. It appears under "Kept in app" with storage used / free.
- [ ] Kill the app, turn on Airplane mode, relaunch: tap the item in Continue (or Kept in app): it opens with one tap and resumes.
- [ ] Delete it from "Kept in app": storage used goes down; the Continue entry stays and says "Pick the file again to resume".

## VR

- [ ] Home → headset icon (VR viewer settings) → **Scan with camera**: allow the camera, point at the viewer's QR code: the viewer is imported and its values are shown (vendor, model, distances, distortion).
- [ ] Take a photo of the QR (or a screenshot of it) → **From photo**: imports the same values.
- [ ] Phone model: iPhone 13 Pro is preselected; it should be marked "matches this device". Optionally try the bank-card calibration.
- [ ] **Test pattern in the viewer** → Start → put the phone in the viewer **with glasses on**: grid lines look straight; all four coloured edges (red, green, yellow, blue) are visible. Tap → controls; use Less / More / Next setting to adjust lens spacing, vertical offset, distortion, screen size until it looks right. "Done" exits.
- [ ] In the player: headset icon → Start (allow motion access) → landscape → viewer. The video (or cover for audio) floats on a screen in a dark room.
- [ ] Head tracking: turn your head, the screen stays in place. Tap → controls → look at **Recenter** for 1.5 s: the screen moves straight ahead.
- [ ] Look at **Next chapter** for 1.5 s → jumps; tap while looking at **Prev chapter** → jumps.
- [ ] Turn head tracking off in the VR start screen: taps cycle the highlighted button, a long press activates it.
- [ ] AirPods next/previous and lock-screen controls change chapter while in VR.
- [ ] Leave it playing in VR for **20+ minutes**: the screen never dims or locks.
- [ ] VR Box remote, game mode: stick moves the highlight, trigger shows the controls / presses, B hides them, shoulder buttons change chapter. If nothing reacts, switch the remote to iOS / music mode: play/pause and next/previous chapter should work.
- [ ] **Exit VR**: back in the normal player at the same position; close and reopen the file: it resumes from where VR left off.
