import type { AppSettings, GaragePreset, SavedState } from '../types';
import { defaultParams } from '../physics/model';

const STORAGE_KEY = 'vehicle-dynamics-lab:v1';
const CURRENT_VERSION = 1;

const defaultSettings: AppSettings = {
  units: 'metric',
  cameraMode: 'follow',
  tractionControl: true,
  stabilityControl: true,
  transmission: 'auto',
  volume: 0.5,
};

const defaultPresets: GaragePreset[] = [
  {
    name: 'Balanced',
    description: 'All-rounder with neutral handling and predictable braking.',
    params: { ...defaultParams },
  },
  {
    name: 'Drift Missile',
    description: 'RWD, soft rear, low grip balance — easy to break the rear loose.',
    params: {
      ...defaultParams,
      drivetrain: 'RWD',
      weightDistributionFront: 0.48,
      gripBalanceFront: 0.42,
      corneringStiffness: 42000,
      frictionCoefficient: 0.85,
      maxSteerAngle: 0.75,
    },
  },
  {
    name: 'Grip Monster',
    description: 'AWD, racing compound, high downforce, stiff chassis.',
    params: {
      ...defaultParams,
      drivetrain: 'AWD',
      tireCompound: 'racing',
      frictionCoefficient: 1.1,
      corneringStiffness: 70000,
      downforceCoefficient: 3.0,
      aeroBalanceFront: 0.45,
      maxBrakeForce: 11000,
    },
  },
];

export function emptyState(): SavedState {
  return {
    setup: { ...defaultParams },
    presets: [...defaultPresets],
    records: [],
    settings: { ...defaultSettings },
    version: CURRENT_VERSION,
  };
}

export function loadState(): SavedState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    // Validate version.
    if (parsed.version !== CURRENT_VERSION) return null;
    return parsed as SavedState;
  } catch {
    return null;
  }
}

export function saveState(state: SavedState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Quota exceeded or private mode — silently ignore.
  }
}

export function exportJSON(state: SavedState): string {
  return JSON.stringify(state, null, 2);
}

export function importJSON(json: string): SavedState | null {
  try {
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed !== 'object') return null;
    if (parsed.version !== CURRENT_VERSION) return null;
    // Minimal structural validation.
    if (!parsed.setup || !parsed.settings || !Array.isArray(parsed.presets)) return null;
    if (!Array.isArray(parsed.records)) return null;
    return parsed as SavedState;
  } catch {
    return null;
  }
}

/** Debounced saver. Call whenever state changes; writes at most once per `ms`. */
export class DebouncedSaver {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly save: (state: SavedState) => void;
  private readonly ms: number;
  constructor(save: (state: SavedState) => void, ms: number = 800) {
    this.save = save;
    this.ms = ms;
  }
  schedule(state: SavedState): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.save(state);
    }, this.ms);
  }
  flush(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
