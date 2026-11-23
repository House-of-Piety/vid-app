import { useEffect, useMemo, useRef, useState } from 'react';
import { FILE_ACCEPT, formatBytes, fromFileList, playabilityProblem, type MediaItem } from '../lib/media';
import { canPickFolder, folderPermission, forgetFolder, pickFolder, savedFolder, scanFolder } from '../lib/library';
import {
  deleteImported,
  detectBackend,
  importItem,
  importedToMedia,
  listImported,
  requestPersist,
  storageEstimate,
  type Backend,
  type ImportedItem,
} from '../lib/importStore';
import { deleteResume, listResume } from '../lib/resumeStore';
import type { ResumeState } from '../lib/resume';
import { normalizeName } from '../lib/resume';
import { formatTime } from '../lib/chapterNav';
import { displayTitle } from '../lib/cover';
import { Icon } from './Icons';

interface Props {
  visible: boolean;
  onOpen: (item: MediaItem) => void;
  onHelp: () => void;
  onVRSettings: () => void;
  /** Files dropped anywhere on the window (handled by App). */
  dropped: File[] | null;
  onDroppedHandled: () => void;
}

const BACKEND_LABEL: Record<Backend, string> = {
  opfs: 'private app files (OPFS)',
  'opfs-worker': 'private app files (OPFS, worker)',
  idb: 'app database (IndexedDB)',
};

const sameFile = (r: Pick<ResumeState, 'name' | 'size'>, m: Pick<MediaItem, 'name' | 'size'>) =>
  normalizeName(r.name) === normalizeName(m.name) && r.size === m.size;

export function Home({ visible, onOpen, onHelp, onVRSettings, dropped, onDroppedHandled }: Props) {
  const [library, setLibrary] = useState<MediaItem[]>([]);
  const [picked, setPicked] = useState<MediaItem[]>([]);
  const [folder, setFolder] = useState<FileSystemDirectoryHandle | null>(null);
  const [needsPermission, setNeedsPermission] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [resumes, setResumes] = useState<ResumeState[]>([]);
  const [imported, setImported] = useState<ImportedItem[]>([]);
  const [estimate, setEstimate] = useState<{ usage: number; quota: number } | null>(null);
  const [backend, setBackend] = useState<Backend | null>(null);
  const [importing, setImporting] = useState<{ id: string; p: number } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState<ResumeState | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const anyInput = useRef<HTMLInputElement>(null);

  const refresh = async () => {
    setResumes(await listResume());
    setImported(await listImported());
    setEstimate(await storageEstimate());
  };

  // Refresh the Continue list / storage each time the home screen is shown.
  useEffect(() => {
    if (visible) void refresh();
  }, [visible]);

  useEffect(() => {
    void detectBackend().then(setBackend);
    void (async () => {
      const dir = await savedFolder();
      if (!dir) return;
      setFolder(dir);
      if ((await folderPermission(dir)) === 'granted') await scan(dir);
      else setNeedsPermission(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (dropped?.length) {
      handlePicked(dropped);
      onDroppedHandled();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dropped]);

  async function scan(dir: FileSystemDirectoryHandle) {
    setScanning(true);
    try {
      setLibrary(await scanFolder(dir));
      setNeedsPermission(false);
    } catch (e) {
      setMessage(`Couldn't read the folder: ${e instanceof Error ? e.message : e}`);
    } finally {
      setScanning(false);
    }
  }

  async function openFolder() {
    try {
      const dir = await pickFolder();
      setFolder(dir);
      await scan(dir);
    } catch (e) {
      if ((e as DOMException)?.name !== 'AbortError') setMessage(String(e));
    }
  }

  async function reopenFolder() {
    if (!folder) return;
    if ((await folderPermission(folder, true)) === 'granted') await scan(folder);
  }

  function handlePicked(files: Iterable<File>) {
    const items = fromFileList(files);
    if (!items.length) {
      setMessage('No playable media in the selection. Pick the audio/video file (and its .vtt files) together.');
      return;
    }
    setPicked((old) => {
      const ids = new Set(items.map((i) => i.id));
      return [...items, ...old.filter((o) => !ids.has(o.id))];
    });
    // "Pick the file again to resume": open the match straight away.
    const match = pending ? items.find((i) => sameFile(pending, i)) : undefined;
    setPending(null);
    if (match) onOpen(match);
    else if (items.length === 1) onOpen(items[0]);
  }

  async function keep(item: MediaItem) {
    setImporting({ id: item.id, p: 0 });
    try {
      await importItem(item, (p) => setImporting({ id: item.id, p }));
      setMessage(`“${displayTitle(item.name)}” is now kept in the app.`);
    } catch (e) {
      setMessage(`Couldn't keep the file: ${e instanceof Error ? e.message : e}. There may not be enough free space.`);
    } finally {
      setImporting(null);
      await refresh();
    }
  }

  async function removeImported(item: ImportedItem) {
    if (!confirm(`Delete “${displayTitle(item.name)}” from app storage? Your saved position is kept.`)) return;
    await deleteImported(item);
    await refresh();
  }

  const allMedia = useMemo(() => [...picked, ...library], [picked, library]);

  function continueItem(r: ResumeState) {
    const imp = r.importedId ? imported.find((i) => i.id === r.importedId) : undefined;
    if (imp) return onOpen(importedToMedia(imp));
    const impByName = imported.find((i) => sameFile(r, i));
    if (impByName) return onOpen(importedToMedia(impByName));
    const m = allMedia.find((i) => sameFile(r, i));
    if (m) return onOpen(m);
    setPending(r);
    fileInput.current?.click();
  }

  const isAvailable = (r: ResumeState) =>
    imported.some((i) => i.id === r.importedId || sameFile(r, i)) || allMedia.some((i) => sameFile(r, i));

  const groups = useMemo(() => {
    const m = new Map<string, MediaItem[]>();
    for (const it of allMedia) {
      const g = it.folder || (picked.includes(it) ? 'Opened files' : folder?.name ?? 'Files');
      m.set(g, [...(m.get(g) ?? []), it]);
    }
    return [...m.entries()];
  }, [allMedia, picked, folder]);

  return (
    <div className="home">
      <header className="home-top">
        <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" width={28} height={28} />
        <h1>Chapter Player</h1>
        <div className="spacer" />
        <button className="icon-btn" onClick={onVRSettings} aria-label="VR viewer settings" title="VR viewer settings">
          <Icon name="vr" />
        </button>
        <button className="icon-btn" onClick={onHelp} aria-label="Help" title="Help">
          <Icon name="help" />
        </button>
      </header>

      <section className="actions">
        {canPickFolder() && (
          <button className="btn primary" onClick={openFolder}>
            <Icon name="folder" size={18} /> Open folder
          </button>
        )}
        {needsPermission && folder && (
          <button className="btn" onClick={reopenFolder}>
            <Icon name="refresh" size={18} /> Reopen “{folder.name}”
          </button>
        )}
        <button className={`btn ${canPickFolder() ? '' : 'primary'}`} onClick={() => fileInput.current?.click()}>
          <Icon name="file" size={18} /> Open file(s)
        </button>
        <input
          ref={fileInput}
          type="file"
          multiple
          accept={FILE_ACCEPT}
          hidden
          onChange={(e) => {
            if (e.target.files) handlePicked(e.target.files);
            e.target.value = '';
          }}
        />
        <input
          ref={anyInput}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) handlePicked(e.target.files);
            e.target.value = '';
          }}
        />
        <button className="linkish small" onClick={() => anyInput.current?.click()}>
          .vtt greyed out? Pick any file type
        </button>
        {canPickFolder() && <span className="muted small hide-touch">…or drop files anywhere</span>}
      </section>

      {message && (
        <div className="notice" role="status">
          <span>{message}</span>
          <button className="icon-btn" aria-label="Dismiss" onClick={() => setMessage(null)}>
            <Icon name="close" />
          </button>
        </div>
      )}
      {pending && (
        <div className="notice" role="status">
          <span>
            Pick “{pending.name}” again to resume at {formatTime(pending.position)}.
          </span>
          <button className="icon-btn" aria-label="Cancel" onClick={() => setPending(null)}>
            <Icon name="close" />
          </button>
        </div>
      )}

      {resumes.length > 0 && (
        <section>
          <h2>Continue</h2>
          <ul className="list">
            {resumes.slice(0, 30).map((r) => {
              const pct = r.duration > 0 ? (r.finished ? 100 : (r.position / r.duration) * 100) : 0;
              const avail = isAvailable(r);
              return (
                <li key={r.key} className="row">
                  <button className="row-main" onClick={() => continueItem(r)}>
                    <span className="row-title">{displayTitle(r.name)}</span>
                    <span className="row-sub muted small">
                      {r.finished ? 'Finished · starts over' : `${formatTime(r.position)} / ${formatTime(r.duration)}`}
                      {r.chapterTitle && !r.finished ? ` · ${r.chapterTitle}` : ''}
                      {!avail && <em className="pick-again"> · Pick the file again to resume</em>}
                    </span>
                    <span className="progress">
                      <span style={{ width: `${pct}%` }} />
                    </span>
                  </button>
                  <button
                    className="icon-btn"
                    aria-label={`Remove ${r.name} from Continue`}
                    title="Remove from list"
                    onClick={async () => {
                      await deleteResume(r.key);
                      await refresh();
                    }}
                  >
                    <Icon name="close" />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {(groups.length > 0 || scanning) && (
        <section>
          <h2>
            Library {scanning && <span className="muted small">scanning…</span>}
            {folder && !scanning && (
              <>
                <button className="linkish small" onClick={() => scan(folder)}>
                  Rescan
                </button>
                <button
                  className="linkish small"
                  onClick={async () => {
                    await forgetFolder();
                    setFolder(null);
                    setLibrary([]);
                  }}
                >
                  Forget folder
                </button>
              </>
            )}
          </h2>
          {groups.map(([name, items]) => (
            <details key={name} open>
              <summary>
                <Icon name="folder" size={16} /> {name} <span className="muted small">({items.length})</span>
              </summary>
              <ul className="list">
                {items.map((it) => {
                  const problem = playabilityProblem(it.name);
                  const isImp = imported.some((i) => sameFile(i, it));
                  return (
                    <li key={it.id} className={`row ${problem ? 'disabled' : ''}`}>
                      <button className="row-main" onClick={() => onOpen(it)}>
                        <span className="row-title">
                          <Icon name={it.kind === 'video' ? 'video' : 'audio'} size={16} /> {displayTitle(it.name)}
                        </span>
                        <span className="row-sub muted small">
                          {it.ext.toUpperCase()} · {formatBytes(it.size)}
                          {it.getChaptersVtt ? ' · chapters.vtt' : ''}
                          {it.getCaptionsVtt ? ' · captions' : ''}
                          {problem ? ` · ${problem}` : ''}
                        </span>
                      </button>
                      {!isImp && !problem && (
                        <button
                          className="btn small-btn"
                          onClick={() => keep(it)}
                          disabled={!!importing}
                          title="Copy into app storage so it reopens with one tap"
                        >
                          {importing?.id === it.id ? `${Math.round(importing.p * 100)}%` : 'Keep in app'}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </details>
          ))}
        </section>
      )}

      <section>
        <h2>Kept in app</h2>
        {imported.length === 0 ? (
          <p className="muted small">
            Nothing kept yet. Use “Keep in app” on a file to copy it (with its .vtt files) into app storage, so it reopens with one
            tap, even offline and after iOS closes the app.
          </p>
        ) : (
          <ul className="list">
            {imported.map((it) => (
              <li key={it.id} className="row">
                <button className="row-main" onClick={() => onOpen(importedToMedia(it))}>
                  <span className="row-title">{displayTitle(it.name)}</span>
                  <span className="row-sub muted small">
                    {formatBytes(it.size)}
                    {it.files.some((f) => f.role === 'chapters') ? ' · chapters.vtt' : ''}
                    {it.files.some((f) => f.role === 'captions') ? ' · captions' : ''}
                  </span>
                </button>
                <button className="icon-btn" aria-label={`Delete ${it.name} from app storage`} title="Delete" onClick={() => removeImported(it)}>
                  <Icon name="trash" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="muted small">
          {estimate ? `Storage used ${formatBytes(estimate.usage)} · free about ${formatBytes(Math.max(0, estimate.quota - estimate.usage))}` : ''}
          {backend ? ` · stored as ${BACKEND_LABEL[backend]}` : ''}{' '}
          <button className="linkish small" onClick={async () => setMessage((await requestPersist()) ? 'Storage is persistent: the browser won’t clear it automatically.' : 'The browser didn’t grant persistent storage (it may still keep your files; installing the app helps).')}>
            Check persistence
          </button>
        </p>
      </section>
    </div>
  );
}
