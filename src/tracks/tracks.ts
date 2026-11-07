import type {
  Checkpoint,
  Cone,
  Surface,
  SurfaceZone,
  TrackDef,
  TrackSegment,
} from '../types';

export const TRACK_WIDTH = 14; // m, drivable surface width
export const SAMPLE_EVERY = 2; // m, centerline sampling resolution

export interface TrackGeometry {
  centerline: { x: number; y: number; s: number; surface: Surface }[];
  left: { x: number; y: number }[];
  right: { x: number; y: number }[];
  totalLength: number;
  zones: SurfaceZone[];
  checkpoints: Checkpoint[];
  cones: Cone[];
  start: { x: number; y: number; psi: number };
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
}

/** Sample a track's centerline and build left/right boundaries. */
export function buildGeometry(
  segments: TrackSegment[],
  zones: SurfaceZone[],
  checkpoints: Checkpoint[],
  cones: Cone[],
  start: { x: number; y: number; psi: number },
): TrackGeometry {
  const width = TRACK_WIDTH;
  const samples: { x: number; y: number; s: number; surface: Surface }[] = [];
  let x = start.x;
  let y = start.y;
  let psi = start.psi;
  let s = 0;

  const push = (nx: number, ny: number, npsi: number) => {
    samples.push({ x: nx, y: ny, s, surface: surfaceAt(s, zones) });
    x = nx;
    y = ny;
    psi = npsi;
  };
  push(x, y, psi);

  for (const seg of segments) {
    if (seg.kind === 'straight') {
      const steps = Math.max(1, Math.ceil(seg.length / SAMPLE_EVERY));
      const dx = (Math.cos(psi) * seg.length) / steps;
      const dy = (Math.sin(psi) * seg.length) / steps;
      for (let i = 0; i < steps; i++) {
        s += SAMPLE_EVERY;
        x += dx;
        y += dy;
        push(x, y, psi);
      }
    } else {
      // arc
      const dir = seg.turnDir ?? 1;
      const radius = seg.radius!;
      const sweep = seg.length / radius;
      const steps = Math.max(1, Math.ceil(seg.length / SAMPLE_EVERY));
      const stepSweep = sweep / steps;
      const cx = x - Math.sin(psi) * radius * dir;
      const cy = y + Math.cos(psi) * radius * dir;
      for (let i = 0; i < steps; i++) {
        psi += stepSweep * dir;
        s += SAMPLE_EVERY;
        x = cx + Math.sin(psi) * radius * dir;
        y = cy - Math.cos(psi) * radius * dir;
        push(x, y, psi);
      }
    }
  }

  const totalLength = s;

  // Resolve placeholder cones (x===0 && y===0) by placing them along the
  // centerline, alternating sides, evenly spaced.
  const resolvedCones: Cone[] = cones.map((c, i) => {
    if (c.x === 0 && c.y === 0 && samples.length > 1) {
      const sPos = (i / Math.max(cones.length, 1)) * totalLength;
      // Find the sample nearest sPos and use local track heading.
      let idx = 0;
      while (idx < samples.length - 1 && samples[idx + 1].s < sPos) idx++;
      const a = samples[idx];
      const b = samples[Math.min(idx + 1, samples.length - 1)];
      const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const hx = (b.x - a.x) / d;
      const hy = (b.y - a.y) / d;
      const side = i % 2 === 0 ? 1 : -1;
      const half = width / 2 + 1 + c.size;
      return {
        x: a.x - hy * side * half,
        y: a.y + hx * side * half,
        size: c.size,
        color: c.color,
      };
    }
    return c;
  });

  // Build left/right boundaries (offset from centerline).
  const left: { x: number; y: number }[] = [];
  const right: { x: number; y: number }[] = [];
  for (let i = 0; i < samples.length; i++) {
    const p = samples[i];
    // Heading at this sample: use next sample direction, or current psi.
    let hx = Math.cos(p.s === 0 ? start.psi : 0);
    let hy = Math.sin(p.s === 0 ? start.psi : 0);
    if (i < samples.length - 1) {
      const n = samples[i + 1];
      const d = Math.hypot(n.x - p.x, n.y - p.y) || 1;
      hx = (n.x - p.x) / d;
      hy = (n.y - p.y) / d;
    }
    const nx = -hy;
    const ny = hx;
    const half = width / 2;
    left.push({ x: p.x + nx * half, y: p.y + ny * half });
    right.push({ x: p.x - nx * half, y: p.y - ny * half });
  }

  // Bounds.
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of samples) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }

  return {
    centerline: samples,
    left,
    right,
    totalLength,
    zones,
    checkpoints,
    cones: resolvedCones,
    start,
    bounds: { minX, maxX, minY, maxY },
  };
}

function surfaceAt(s: number, zones: SurfaceZone[]): Surface {
  for (const z of zones) {
    if (s >= z.sStart && s <= z.sEnd) return z.surface;
  }
  return 'asphalt';
}

/** Point on centerline at along-track distance s (linear interpolation). */
export function centerlineAt(
  geometry: TrackGeometry,
  s: number,
): { x: number; y: number; psi: number } {
  const pts = geometry.centerline;
  if (s <= 0) return { x: pts[0].x, y: pts[0].y, psi: 0 };
  if (s >= pts[pts.length - 1].s)
    return {
      x: pts[pts.length - 1].x,
      y: pts[pts.length - 1].y,
      psi: 0,
    };
  let i = 0;
  while (i < pts.length - 1 && pts[i + 1].s < s) i++;
  const a = pts[i];
  const b = pts[i + 1];
  const t = (s - a.s) / Math.max(b.s - a.s, 1e-6);
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    psi: 0,
  };
}

/* ------------------------------------------------------------------ */
/* Track definitions                                                  */
/* ------------------------------------------------------------------ */

export function speedStrip(): TrackDef {
  const segments: TrackSegment[] = [
    { kind: 'straight', length: 500, surface: 'asphalt' },
  ];
  const zones: SurfaceZone[] = [
    { sStart: 150, sEnd: 250, surface: 'lowGrip', frictionCoefficient: 0.5 },
  ];
  const cones: Cone[] = [];
  for (let s = 20; s <= 480; s += 40) {
    cones.push({ x: 0, y: 0, size: 0.6, color: 'orange' }); // placed at render time via centerline
  }
  return {
    id: 'speed-strip',
    name: 'Speed Strip',
    segments,
    surfaceZones: zones,
    checkpoints: [],
    cones,
    start: { x: 0, y: 0, psi: 0 },
    bounds: { minX: -40, maxX: 540, minY: -40, maxY: 40 },
  };
}

export function skidpad(): TrackDef {
  const segments: TrackSegment[] = [
    { kind: 'arc', length: Math.PI * 60, radius: 30, turnDir: 1, surface: 'asphalt' },
    { kind: 'arc', length: Math.PI * 60, radius: 30, turnDir: 1, surface: 'asphalt' },
  ];
  const zones: SurfaceZone[] = [];
  const cones: Cone[] = [];
  return {
    id: 'skidpad',
    name: 'Skidpad',
    segments,
    surfaceZones: zones,
    checkpoints: [],
    cones,
    start: { x: 30, y: 0, psi: Math.PI / 2 },
    bounds: { minX: -45, maxX: 75, minY: -45, maxY: 75 },
  };
}

export function slalom(): TrackDef {
  const segments: TrackSegment[] = [
    { kind: 'straight', length: 200, surface: 'asphalt' },
  ];
  const zones: SurfaceZone[] = [];
  const cones: Cone[] = [];
  for (let i = 0; i < 10; i++) {
    cones.push({ x: 0, y: 0, size: 0.5, color: i % 2 === 0 ? 'orange' : 'blue' });
  }
  return {
    id: 'slalom',
    name: 'Slalom',
    segments,
    surfaceZones: zones,
    checkpoints: [],
    cones,
    start: { x: 0, y: 0, psi: 0 },
    bounds: { minX: -25, maxX: 225, minY: -25, maxY: 25 },
  };
}

export function handlingCircuit(): TrackDef {
  const segments: TrackSegment[] = [
    { kind: 'straight', length: 120, surface: 'asphalt' },
    { kind: 'arc', length: Math.PI * 20, radius: 20, turnDir: 1, surface: 'asphalt' },
    { kind: 'straight', length: 80, surface: 'asphalt' },
    { kind: 'arc', length: Math.PI * 18, radius: 18, turnDir: -1, surface: 'lowGrip' },
    { kind: 'straight', length: 100, surface: 'asphalt' },
    { kind: 'arc', length: Math.PI * 22, radius: 22, turnDir: 1, surface: 'asphalt' },
    { kind: 'straight', length: 90, surface: 'asphalt' },
    { kind: 'arc', length: Math.PI * 16, radius: 16, turnDir: -1, surface: 'asphalt' },
    { kind: 'straight', length: 70, surface: 'asphalt' },
  ];
  const zones: SurfaceZone[] = [
    { sStart: 200, sEnd: 320, surface: 'lowGrip', frictionCoefficient: 0.5 },
  ];
  const checkpoints: Checkpoint[] = [
    { id: 'cp1', x: 0, y: 0, radius: 8, order: 1 },
    { id: 'cp2', x: 0, y: 0, radius: 8, order: 2 },
    { id: 'cp3', x: 0, y: 0, radius: 8, order: 3 },
    { id: 'cp4', x: 0, y: 0, radius: 8, order: 4 },
  ];
  const cones: Cone[] = [];
  return {
    id: 'handling-circuit',
    name: 'Handling Circuit',
    segments,
    surfaceZones: zones,
    checkpoints,
    cones,
    start: { x: 0, y: 0, psi: 0 },
    bounds: { minX: -60, maxX: 260, minY: -60, maxY: 60 },
  };
}

export const allTracks: Record<string, TrackDef> = {
  'speed-strip': speedStrip(),
  skidpad: skidpad(),
  slalom: slalom(),
  'handling-circuit': handlingCircuit(),
};
