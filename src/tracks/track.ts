// Track Definitions and Test Logic
// Five test areas: straight, skidpad, slalom, handling circuit, low-grip section

import type { TrackDef, SurfaceZone, Checkpoint, SurfaceType, TestResult, VehicleParams } from '../types';

/** Create the main test facility track */
export function createTestFacility(): TrackDef {
  const centerline = generateCenterline();
  const surfaces = generateSurfaces();
  const checkpoints = generateCheckpoints();
  const bounds = calculateBounds(centerline);

  return {
    id: 'test-facility',
    name: 'Vehicle Dynamics Test Facility',
    description: 'Comprehensive test facility with straight, skidpad, slalom, and handling circuit',
    centerline,
    width: 12,
    surfaces,
    checkpoints,
    startPos: { x: -500, y: 0, heading: 0 },
    bounds,
  };
}

/** Generate the main centerline path */
function generateCenterline(): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = [];

  // 1. Long straight (1.2km) - for acceleration/braking
  for (let x = -600; x <= 600; x += 10) {
    points.push({ x, y: 0 });
  }

  // 2. Transition to handling circuit
  // Large radius turn to connect straight to circuit
  const turnRadius = 80;
  for (let angle = -Math.PI / 2; angle <= Math.PI / 2; angle += 0.02) {
    points.push({
      x: 600 + turnRadius * Math.cos(angle),
      y: turnRadius * Math.sin(angle),
    });
  }

  // 3. Handling circuit - figure-8 style with straights and corners
  const circuitCenterX = 600 + turnRadius;
  const circuitCenterY = 0;

  // Upper loop
  for (let angle = Math.PI / 2; angle <= 3 * Math.PI / 2; angle += 0.015) {
    const r = 120 + 30 * Math.sin(angle * 2);
    points.push({
      x: circuitCenterX + r * Math.cos(angle),
      y: circuitCenterY + r * Math.sin(angle),
    });
  }

  // Connect to lower loop
  for (let angle = 3 * Math.PI / 2; angle <= 5 * Math.PI / 2; angle += 0.015) {
    const r = 100 + 20 * Math.sin(angle * 2);
    points.push({
      x: circuitCenterX + 200 + r * Math.cos(angle),
      y: circuitCenterY + r * Math.sin(angle),
    });
  }

  // Return straight to start
  for (let x = circuitCenterX + 300; x >= -600; x -= 10) {
    points.push({ x, y: -150 });
  }

  // Close the loop
  for (let angle = -Math.PI / 2; angle <= Math.PI / 2; angle += 0.02) {
    points.push({
      x: -600 + turnRadius * Math.cos(angle),
      y: -150 + turnRadius * Math.sin(angle),
    });
  }

  return points;
}

/** Generate surface zones */
function generateSurfaces(): SurfaceZone[] {
  return [
    // Main asphalt surface (most of track)
    {
      type: 'asphalt',
      frictionMultiplier: 1.0,
      shape: 'rect',
      rect: { x: -700, y: -200, w: 1400, h: 400 },
    },
    // Low-grip section on the straight (200m section)
    {
      type: 'low-grip',
      frictionMultiplier: 0.55,
      shape: 'rect',
      rect: { x: -200, y: -8, w: 200, h: 16 },
    },
    // Skidpad area (circular)
    {
      type: 'asphalt',
      frictionMultiplier: 1.0,
      shape: 'circle',
      center: { x: -400, y: -100 },
      radius: 35,
    },
    // Slalom area
    {
      type: 'asphalt',
      frictionMultiplier: 1.0,
      shape: 'rect',
      rect: { x: 200, y: -120, w: 300, h: 80 },
    },
  ];
}

/** Generate checkpoints for tests */
function generateCheckpoints(): Checkpoint[] {
  return [
    // Acceleration test: start at -500, end at 100
    { id: 1, position: { x: -500, y: 0 }, radius: 8, direction: { x: 1, y: 0 } },
    { id: 2, position: { x: -400, y: 0 }, radius: 8 },
    { id: 3, position: { x: -300, y: 0 }, radius: 8 },
    { id: 4, position: { x: -200, y: 0 }, radius: 8 },
    { id: 5, position: { x: -100, y: 0 }, radius: 8 },
    { id: 6, position: { x: 0, y: 0 }, radius: 8 },
    { id: 7, position: { x: 100, y: 0 }, radius: 8 },

    // Skidpad: circular checkpoints
    { id: 10, position: { x: -400, y: -100 }, radius: 30 },
    { id: 11, position: { x: -400, y: -100 }, radius: 25 },
    { id: 12, position: { x: -400, y: -100 }, radius: 20 },

    // Handling circuit checkpoints
    { id: 20, position: { x: 680, y: 0 }, radius: 10, direction: { x: 0, y: 1 } },
    { id: 21, position: { x: 720, y: 100 }, radius: 10 },
    { id: 22, position: { x: 800, y: 120 }, radius: 10 },
    { id: 23, position: { x: 900, y: 80 }, radius: 10 },
    { id: 24, position: { x: 950, y: 0 }, radius: 10 },
    { id: 25, position: { x: 900, y: -80 }, radius: 10 },
    { id: 26, position: { x: 800, y: -120 }, radius: 10 },
    { id: 27, position: { x: 720, y: -100 }, radius: 10 },
    { id: 28, position: { x: 680, y: 0 }, radius: 10 }, // Lap complete

    // Return straight
    { id: 30, position: { x: 400, y: -150 }, radius: 10 },
    { id: 31, position: { x: 0, y: -150 }, radius: 10 },
    { id: 32, position: { x: -400, y: -150 }, radius: 10 },
    { id: 33, position: { x: -500, y: 0 }, radius: 10 }, // Back to start
  ];
}

/** Calculate bounds from centerline */
function calculateBounds(centerline: { x: number; y: number }[]): TrackDef['bounds'] {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of centerline) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  return { minX: minX - 20, maxX: maxX + 20, minY: minY - 20, maxY: maxY + 20 };
}

/** Get surface type at position */
export function getSurfaceAt(x: number, y: number, track: TrackDef): SurfaceType {
  for (const zone of track.surfaces) {
    if (pointInZone(x, y, zone)) {
      return zone.type;
    }
  }
  return 'asphalt';
}

/** Check if point is in zone */
function pointInZone(x: number, y: number, zone: SurfaceZone): boolean {
  if (zone.shape === 'circle' && zone.center && zone.radius) {
    const dx = x - zone.center.x;
    const dy = y - zone.center.y;
    return dx * dx + dy * dy <= zone.radius * zone.radius;
  }
  if (zone.shape === 'rect' && zone.rect) {
    return x >= zone.rect.x && x <= zone.rect.x + zone.rect.w &&
           y >= zone.rect.y && y <= zone.rect.y + zone.rect.h;
  }
  if (zone.shape === 'polygon' && zone.polygon) {
    return pointInPolygon(x, y, zone.polygon);
  }
  return false;
}

function pointInPolygon(x: number, y: number, polygon: { x: number; y: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

/** Test mode state */
export interface TestState {
  mode: 'free' | 'acceleration' | 'skidpad' | 'circuit';
  active: boolean;
  startTime: number;
  currentLap: number;
  bestLap: number;
  lastCheckpoint: number;
  checkpointsHit: number[];
  lapTimes: number[];
  maxSpeed: number;
  maxLateralG: number;
  lateralGSamples: number[];
  speedSamples: number[];
  offTrackCount: number;
  wasOffTrack: boolean;
  brakingTestActive: boolean;
  brakingStartSpeed: number;
  brakingStartPos: { x: number; y: number };
  brakingDistance: number;
}

/** Create initial test state */
export function createTestState(): TestState {
  return {
    mode: 'free',
    active: false,
    startTime: 0,
    currentLap: 0,
    bestLap: Infinity,
    lastCheckpoint: 0,
    checkpointsHit: [],
    lapTimes: [],
    maxSpeed: 0,
    maxLateralG: 0,
    lateralGSamples: [],
    speedSamples: [],
    offTrackCount: 0,
    wasOffTrack: false,
    brakingTestActive: false,
    brakingStartSpeed: 0,
    brakingStartPos: { x: 0, y: 0 },
    brakingDistance: 0,
  };
}

/** Update test state */
export function updateTestState(
  state: TestState,
  vehicle: { x: number; y: number; speedKph: number; lateralG: number; heading: number },
  track: TrackDef,
  _dt: number
): TestState {
  const newState = { ...state };
  newState.maxSpeed = Math.max(newState.maxSpeed, vehicle.speedKph);
  newState.maxLateralG = Math.max(newState.maxLateralG, Math.abs(vehicle.lateralG));
  newState.lateralGSamples.push(Math.abs(vehicle.lateralG));
  newState.speedSamples.push(vehicle.speedKph);

  // Keep only recent samples (last 10 seconds at 60Hz)
  if (newState.lateralGSamples.length > 600) {
    newState.lateralGSamples.shift();
    newState.speedSamples.shift();
  }

  if (!newState.active) return newState;

  const now = performance.now() / 1000;

  // Check checkpoints
  for (const cp of track.checkpoints) {
    if (newState.checkpointsHit.includes(cp.id)) continue;

    const dx = vehicle.x - cp.position.x;
    const dy = vehicle.y - cp.position.y;
    const dist = Math.hypot(dx, dy);

    if (dist <= cp.radius) {
      // Check direction if specified
      if (cp.direction) {
        const dot = Math.cos(vehicle.heading) * cp.direction.x + Math.sin(vehicle.heading) * cp.direction.y;
        if (dot < 0.5) continue; // Wrong direction
      }

      newState.checkpointsHit.push(cp.id);
      newState.lastCheckpoint = cp.id;

      // Acceleration test milestones
      if (newState.mode === 'acceleration') {
        if (cp.id === 1) {
          newState.startTime = now;
        }
        if (cp.id === 7 && vehicle.speedKph >= 100) {
          // 0-100 complete
        }
      }

      // Circuit lap completion
      if (newState.mode === 'circuit' && cp.id === 28) {
        const lapTime = now - newState.startTime;
        newState.lapTimes.push(lapTime);
        if (lapTime < newState.bestLap) newState.bestLap = lapTime;
        newState.currentLap++;
        newState.startTime = now;
        // Reset checkpoints for next lap (keep start/finish)
        newState.checkpointsHit = newState.checkpointsHit.filter(id => id <= 20);
      }
    }
  }

  // Off-track detection
  const onTrack = isOnTrack(vehicle.x, vehicle.y, track);
  if (!onTrack && !newState.wasOffTrack) {
    newState.offTrackCount++;
    newState.wasOffTrack = true;
  } else if (onTrack) {
    newState.wasOffTrack = false;
  }

  // Braking test (100-0)
  if (newState.mode === 'acceleration' && newState.brakingTestActive) {
    const dx = vehicle.x - newState.brakingStartPos.x;
    const dy = vehicle.y - newState.brakingStartPos.y;
    newState.brakingDistance = Math.hypot(dx, dy);

    if (vehicle.speedKph <= 1) {
      newState.brakingTestActive = false;
    }
  }

  return newState;
}

/** Check if position is on track */
function isOnTrack(x: number, y: number, track: TrackDef): boolean {
  // Simple check: distance to centerline
  let minDist = Infinity;
  for (let i = 0; i < track.centerline.length - 1; i++) {
    const p1 = track.centerline[i];
    const p2 = track.centerline[i + 1];
    const dist = pointToSegmentDist(x, y, p1.x, p1.y, p2.x, p2.y);
    minDist = Math.min(minDist, dist);
  }
  return minDist <= track.width / 2 + 2; // 2m tolerance
}

function pointToSegmentDist(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  return Math.hypot(px - projX, py - projY);
}

/** Start a test */
export function startTest(_state: TestState, mode: TestState['mode']): TestState {
  return {
    ...createTestState(),
    mode,
    active: true,
    startTime: performance.now() / 1000,
  };
}

/** Stop test and generate result */
export function stopTest(state: TestState, vehicleConfig: VehicleParams): TestResult | null {
  if (!state.active) return null;

  const now = performance.now() / 1000;
  const avgLatG = state.lateralGSamples.length > 0
    ? state.lateralGSamples.reduce((a, b) => a + b, 0) / state.lateralGSamples.length
    : 0;
  const avgSpeed = state.speedSamples.length > 0
    ? state.speedSamples.reduce((a, b) => a + b, 0) / state.speedSamples.length
    : 0;

  const result: TestResult = {
    testId: state.mode,
    timestamp: Date.now(),
    vehicleConfig,
  };

  if (state.mode === 'acceleration') {
    // Find 0-100 time from checkpoint data
    // Simplified: use lap time if we hit the 100km/h checkpoint
    result.time0to100 = state.lapTimes[0] || now - state.startTime;
    result.maxSpeed = state.maxSpeed;
    result.brakingDistance100to0 = state.brakingDistance;
  } else if (state.mode === 'skidpad') {
    result.maxLateralG = state.maxLateralG;
    result.avgLateralG = avgLatG;
    result.steadyStateSpeed = avgSpeed;
  } else if (state.mode === 'circuit') {
    result.lapTime = state.lapTimes[state.lapTimes.length - 1];
    result.bestLapTime = state.bestLap === Infinity ? undefined : state.bestLap;
    result.offTrackCount = state.offTrackCount;
    result.avgSpeed = avgSpeed;
    result.peakLateralG = state.maxLateralG;
  }

  return result;
}

/** Get test-specific checkpoints */
export function getTestCheckpoints(mode: TestState['mode']): number[] {
  switch (mode) {
    case 'acceleration': return [1, 2, 3, 4, 5, 6, 7];
    case 'skidpad': return [10, 11, 12];
    case 'circuit': return [20, 21, 22, 23, 24, 25, 26, 27, 28];
    default: return [];
  }
}