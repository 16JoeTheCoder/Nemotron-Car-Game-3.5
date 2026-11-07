// Platform Module - Persistence, Service Worker, Import/Export

import type { SavedGame, VehicleParams, GameSettings } from '../types';
import { DEFAULT_VEHICLE, PRESETS } from '../types';
import { validateParams } from '../physics';

const STORAGE_KEY = 'vehicle-dynamics-lab';
const STORAGE_VERSION = 1;

/** Default game settings */
export const DEFAULT_SETTINGS: GameSettings = {
  units: 'metric',
  cameraMode: 'follow',
  showTelemetry: true,
  showHud: true,
  masterVolume: 0.7,
  graphicsQuality: 'high',
};

/** Load saved game from localStorage */
export function loadGame(): SavedGame | null {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return null;

    const parsed = JSON.parse(data);
    if (parsed.version !== STORAGE_VERSION) {
      return migrateSave(parsed);
    }

    // Validate loaded data
    return validateSave(parsed);
  } catch (e) {
    console.warn('Failed to load save:', e);
    return null;
  }
}

/** Save game to localStorage */
export function saveGame(game: SavedGame): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(game));
  } catch (e) {
    console.warn('Failed to save game:', e);
  }
}

/** Validate and sanitize saved data */
function validateSave(data: any): SavedGame {
  const validated: SavedGame = {
    version: STORAGE_VERSION,
    currentVehicle: validateParams(data.currentVehicle || DEFAULT_VEHICLE),
    presets: (data.presets || []).map((p: any) => ({
      name: String(p.name || 'Preset'),
      params: validateParams(p.params || DEFAULT_VEHICLE),
    })),
    records: (data.records || []).map((r: any) => ({
      ...r,
      vehicleConfig: validateParams(r.vehicleConfig || DEFAULT_VEHICLE),
      timestamp: Number(r.timestamp) || Date.now(),
    })),
    settings: {
      ...DEFAULT_SETTINGS,
      ...data.settings,
      units: data.settings?.units === 'imperial' ? 'imperial' : 'metric',
      cameraMode: ['follow', 'fixed', 'top-down'].includes(data.settings?.cameraMode)
        ? data.settings.cameraMode : 'follow',
      graphicsQuality: ['low', 'medium', 'high'].includes(data.settings?.graphicsQuality)
        ? data.settings.graphicsQuality : 'high',
    },
  };

  // Ensure we have at least the default presets
  if (validated.presets.length === 0) {
    validated.presets = PRESETS.map(p => ({ name: p.name, params: validateParams(p.params) }));
  }

  return validated;
}

/** Migrate old save format */
function migrateSave(oldData: any): SavedGame {
  console.log('Migrating save from version', oldData.version, 'to', STORAGE_VERSION);
  return validateSave(oldData);
}

/** Create new game with defaults */
export function createNewGame(): SavedGame {
  return {
    version: STORAGE_VERSION,
    currentVehicle: validateParams({ ...DEFAULT_VEHICLE }),
    presets: PRESETS.map(p => ({ name: p.name, params: validateParams(p.params) })),
    records: [],
    settings: { ...DEFAULT_SETTINGS },
  };
}

/** Export vehicle setup as JSON */
export function exportVehicle(params: VehicleParams): string {
  const exportData = {
    version: STORAGE_VERSION,
    type: 'vehicle',
    name: 'Custom Setup',
    params: validateParams(params),
    timestamp: Date.now(),
  };
  return JSON.stringify(exportData, null, 2);
}

/** Import vehicle setup from JSON */
export function importVehicle(json: string): VehicleParams | null {
  try {
    const data = JSON.parse(json);
    if (data.type !== 'vehicle' || !data.params) {
      throw new Error('Invalid vehicle export format');
    }
    return validateParams(data.params);
  } catch (e) {
    console.warn('Failed to import vehicle:', e);
    return null;
  }
}

/** Export full save */
export function exportSave(game: SavedGame): string {
  return JSON.stringify({ ...game, type: 'full-save' }, null, 2);
}

/** Import full save */
export function importSave(json: string): SavedGame | null {
  try {
    const data = JSON.parse(json);
    if (data.type !== 'full-save') {
      throw new Error('Invalid save format');
    }
    return validateSave(data);
  } catch (e) {
    console.warn('Failed to import save:', e);
    return null;
  }
}

/** Register service worker */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) {
    console.log('Service Worker not supported');
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
    });
    console.log('Service Worker registered:', registration.scope);
    return registration;
  } catch (e) {
    console.warn('Service Worker registration failed:', e);
    return null;
  }
}

/** Unregister service worker */
export async function unregisterServiceWorker(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  const registrations = await navigator.serviceWorker.getRegistrations();
  for (const reg of registrations) {
    await reg.unregister();
  }
}

/** Check if running offline */
export function isOffline(): boolean {
  return !navigator.onLine;
}

/** Listen for online/offline events */
export function onOnlineChange(callback: (online: boolean) => void): () => void {
  const handler = () => callback(navigator.onLine);
  window.addEventListener('online', handler);
  window.addEventListener('offline', handler);
  return () => {
    window.removeEventListener('online', handler);
    window.removeEventListener('offline', handler);
  };
}

/** Debounced save to avoid writing every frame */
let saveTimeout: number | null = null;
export function debouncedSave(game: SavedGame, delay = 1000): void {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = window.setTimeout(() => saveGame(game), delay);
}

/** Force immediate save */
export function forceSave(game: SavedGame): void {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveGame(game);
}

/** Clear all data */
export function clearAllData(): void {
  localStorage.removeItem(STORAGE_KEY);
}

/** Get storage usage estimate */
export function getStorageInfo(): { used: number; available: number } {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    const used = data ? new Blob([data]).size : 0;
    // Estimate available (5MB typical for localStorage)
    return { used, available: 5 * 1024 * 1024 };
  } catch {
    return { used: 0, available: 0 };
  }
}