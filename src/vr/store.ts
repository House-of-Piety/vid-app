/** VR settings storage (own IndexedDB database, independent of the rest of the app). */
import { builtinPresets, type DeviceParams } from './profile';
import { DEFAULT_TUNE, type FineTune, type ScreenPreset } from './lens';
import type { PhoneScreen } from './screens';

const DB = 'cardboard-vr';
let dbp: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  dbp ??= new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => {
      dbp = null;
      reject(r.error);
    };
  });
  return dbp;
}

async function get<T>(key: string): Promise<T | undefined> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const r = d.transaction('kv').objectStore('kv').get(key);
    r.onsuccess = () => resolve(r.result as T | undefined);
    r.onerror = () => reject(r.error);
  });
}

async function set(key: string, value: unknown): Promise<void> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction('kv', 'readwrite');
    tx.objectStore('kv').put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export interface SavedProfile {
  id: string;
  name: string;
  params: DeviceParams;
  builtin?: boolean;
}

export interface SceneSettings {
  headTracking: boolean;
  sbs: boolean;
  preset: ScreenPreset | 'custom';
}

export const DEFAULT_SCENE: SceneSettings = { headTracking: true, sbs: false, preset: 'comfortable' };

export interface VRConfig {
  profiles: SavedProfile[];
  activeId: string;
  phone: PhoneScreen | null;
  tunes: Record<string, FineTune>;
  scene: SceneSettings;
}

export async function loadConfig(): Promise<VRConfig> {
  const presets: SavedProfile[] = builtinPresets().map((p) => ({ ...p, builtin: true }));
  let user: SavedProfile[] = [];
  let activeId = 'preset:v2';
  let phone: PhoneScreen | null = null;
  let tunes: Record<string, FineTune> = {};
  let scene = DEFAULT_SCENE;
  try {
    user = (await get<SavedProfile[]>('profiles')) ?? [];
    activeId = (await get<string>('activeId')) ?? activeId;
    phone = (await get<PhoneScreen>('phone')) ?? null;
    tunes = (await get<Record<string, FineTune>>('tunes')) ?? {};
    scene = { ...DEFAULT_SCENE, ...((await get<SceneSettings>('scene')) ?? {}) };
  } catch {
    /* private mode etc. */
  }
  const profiles = [...user, ...presets];
  if (!profiles.some((p) => p.id === activeId)) activeId = profiles[0].id;
  return { profiles, activeId, phone, tunes, scene };
}

export async function saveUserProfiles(profiles: SavedProfile[]) {
  await set('profiles', profiles.filter((p) => !p.builtin));
}
export const saveActiveId = (id: string) => set('activeId', id);
export const savePhone = (p: PhoneScreen | null) => set('phone', p);
export const saveTunes = (t: Record<string, FineTune>) => set('tunes', t);
export const saveScene = (s: SceneSettings) => set('scene', s);

export function tuneFor(cfg: VRConfig, id = cfg.activeId): FineTune {
  return { ...DEFAULT_TUNE, ...(cfg.tunes[id] ?? {}) };
}

export function activeProfile(cfg: VRConfig): SavedProfile {
  return cfg.profiles.find((p) => p.id === cfg.activeId) ?? cfg.profiles[0];
}
