import { Icon } from './Icons';

export function Help({ onClose }: { onClose: () => void }) {
  return (
    <div className="page help">
      <header className="page-top">
        <button className="icon-btn" onClick={onClose} aria-label="Back">
          <Icon name="back" />
        </button>
        <h1>Help</h1>
      </header>

      <section>
        <h2>What it does</h2>
        <p>
          Chapter Player plays audio and video files from your device, shows their chapters, and always resumes where you left off.
          Nothing is uploaded: files stay on your device, and the app works with no internet after the first visit.
        </p>
      </section>

      <section>
        <h2>Supported formats</h2>
        <ul>
          <li>
            <b>Everywhere:</b> M4B, M4A, MP4, M4V, MP3, AAC, WAV.
          </li>
          <li>
            <b>PC only (Chrome/Edge):</b> WebM, OGG/Opus, and many MKV files. iPhone can't play WebM, OGG or MKV.
          </li>
          <li>
            <b>Chapters</b> come from, in order: a <code>name.chapters.vtt</code> file next to the media, chapters embedded in M4B/MP4
            (Nero or QuickTime), or ID3 chapters in MP3. Without any, the file still plays and shows “No chapters”.
          </li>
          <li>
            <b>Captions:</b> a <code>name.captions.vtt</code> file shows as a transcript line for audio, or as captions on video.
          </li>
        </ul>
      </section>

      <section>
        <h2>Getting files onto the iPhone</h2>
        <ol>
          <li>Put the files in iCloud Drive or OneDrive on the PC (or AirDrop them and save to Files).</li>
          <li>On the iPhone, tap “Open file(s)”, browse to the folder in the Files picker, and select the media file and its .vtt files together.</li>
          <li>If .vtt files are greyed out, use “Pick any file type”.</li>
          <li>For files in OneDrive, make sure they're downloaded (“Keep offline”) or the picker has to fetch them first.</li>
        </ol>
      </section>

      <section>
        <h2>Keep in app</h2>
        <p>
          On iPhone, the app can't reopen a file from Files by itself. “Keep in app” copies the file (and its .vtt files) into the app's
          private storage, so it reopens with one tap, even offline and after iOS closes the app. Files that aren't kept show “Pick the
          file again to resume” in the Continue list; once you pick the file, it jumps straight to your saved spot. Delete kept files from
          the home screen to free space.
        </p>
      </section>

      <section>
        <h2>Background and lock screen</h2>
        <p>
          Audio keeps playing with the screen locked or the app in the background, and the lock screen / AirPods buttons skip between
          chapters. Video pauses when the app goes to the background on iPhone; that's how iOS works and is expected.
        </p>
      </section>

      <section>
        <h2>Keyboard (PC)</h2>
        <table className="keys">
          <tbody>
            <tr><td><kbd>Space</kbd></td><td>Play / pause</td></tr>
            <tr><td><kbd>←</kbd> <kbd>→</kbd></td><td>Back / forward 10 s</td></tr>
            <tr><td><kbd>Shift</kbd>+<kbd>←</kbd> <kbd>→</kbd></td><td>Previous / next chapter</td></tr>
            <tr><td><kbd>↑</kbd> <kbd>↓</kbd></td><td>Volume</td></tr>
            <tr><td><kbd>[</kbd> <kbd>]</kbd> <kbd>=</kbd></td><td>Slower / faster / normal speed</td></tr>
            <tr><td><kbd>F</kbd> <kbd>M</kbd> <kbd>C</kbd></td><td>Fullscreen / mute / chapters</td></tr>
            <tr><td><kbd>Esc</kbd></td><td>Close panels</td></tr>
          </tbody>
        </table>
        <p className="muted small">On iPhone: double-tap the left or right third of a video to skip 10 s.</p>
      </section>

      <section>
        <h2>VR mode (Cardboard-style viewer)</h2>
        <ol>
          <li>
            <b>Import your viewer.</b> Open VR viewer settings (the headset icon) and scan the QR code printed on your viewer, pick a photo
            of it, or paste its address. You get the same lens settings the Google Cardboard app uses. Short links (goo.gl/…) can't be read
            offline: open them in Safari while online, copy the final <code>google.com/cardboard/cfg?p=…</code> address and paste it.
          </li>
          <li>
            <b>Choose your phone model</b> so the lens maths knows the real screen size, or calibrate with a bank card.
          </li>
          <li>
            <b>Fine-tune</b> while wearing the viewer: use the test pattern and adjust lens spacing, vertical offset, distortion and screen
            size until lines look straight and both edges are visible. If you wear glasses, use “Shrink to fit”.
          </li>
          <li>
            In the player, tap the headset icon. Turn the phone to landscape and put it in the viewer. Tap the screen (or press the viewer
            button) to show the controls; look at a button for 1.5 s or tap while looking at it. AirPods and lock-screen buttons keep
            working.
          </li>
        </ol>
      </section>

      <section>
        <h2>About</h2>
        <p className="muted">
          Chapter Player version {__APP_VERSION__}. No accounts, no tracking, no network requests after install.
        </p>
      </section>
    </div>
  );
}
