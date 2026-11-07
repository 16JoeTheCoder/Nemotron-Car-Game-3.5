import type {
  EngineInternals,
  Surface,
  TelemetrySample,
  VehicleState,
} from '../types';
import { Camera } from './camera';
import type { TrackGeometry } from '../tracks/tracks';

/* ------------------------------------------------------------------ */
/* Palette: dark charcoal, electric blue, amber                       */
/* ------------------------------------------------------------------ */
const C_GRASS = '#161c1f';
const C_GRASS_ALT = '#111518';
const C_ROAD = '#2a3134';
const C_ROAD_LOWGRIP = '#3a4246';
const C_CURB = '#ffffff';
const C_CURB_ALT = '#b80000';
const C_MARK = '#e8e8e8';
const C_BODY = '#00d4ff'; // electric blue
const C_BODY_DARK = '#007a99';
const C_BRAKE = '#ff3b3b';
const C_SMOKE = 'rgba(150,150,150,0.4)';
const C_DUST = 'rgba(200,180,140,0.4)';
const C_SHADOW = 'rgba(0,0,0,0.45)';

const WHEEL_RADIUS = 0.33;
const CAR_WIDTH = 1.4;
const CAR_LENGTH = 4.4;

interface Particle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
}

interface SkidMark {
  active: boolean;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  life: number;
  color: string;
}

interface RenderFrame {
  camera: Camera;
  state: VehicleState;
  internals: EngineInternals;
  geometry: TrackGeometry;
  surface: Surface;
  width: number;
  height: number;
}

export class Renderer {
  private particles: Particle[] = [];
  private skidMarks: SkidMark[] = [];
  private wheelAngle = 0; // visual wheel rotation (rad)

  constructor(maxParticles = 240, maxSkidMarks = 200) {
    for (let i = 0; i < maxParticles; i++) this.particles.push(this.deadParticle());
    for (let i = 0; i < maxSkidMarks; i++) this.skidMarks.push(this.deadSkid());
  }

  private deadParticle(): Particle {
    return { active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 0, size: 0, color: '' };
  }
  private deadSkid(): SkidMark {
    return { active: false, x1: 0, y1: 0, x2: 0, y2: 0, life: 0, color: '' };
  }

  /** Emit tire smoke/dust at a contact patch when slipping. */
  emitSlip(x: number, y: number, slip: number, surface: Surface): void {
    if (slip < 0.55 || Math.random() > 0.5) return;
    const p = this.particles.find((p) => !p.active);
    if (!p) return;
    const angle = Math.random() * Math.PI * 2;
    const spread = 1.5 + slip * 2;
    p.active = true;
    p.x = x + (Math.random() - 0.5) * 0.6;
    p.y = y + (Math.random() - 0.5) * 0.6;
    p.vx = Math.cos(angle) * spread * slip + (Math.random() - 0.5) * 0.5;
    p.vy = Math.sin(angle) * spread * slip + (Math.random() - 0.5) * 0.5;
    p.life = 0;
    p.maxLife = 0.35 + slip * 0.5;
    p.size = 2 + slip * 4;
    p.color = surface === 'lowGrip' ? C_DUST : C_SMOKE;
  }

  /** Leave a skid mark segment when wheels lock / slide hard. */
  emitSkid(x1: number, y1: number, x2: number, y2: number, slip: number): void {
    if (slip < 0.8) return;
    const m = this.skidMarks.find((m) => !m.active);
    if (!m) return;
    m.active = true;
    m.x1 = x1;
    m.y1 = y1;
    m.x2 = x2;
    m.y2 = y2;
    m.life = 0;
    m.color = slip > 0.95 ? '#555555' : '#888888';
  }

  private updateParticles(dt: number): void {
    for (const p of this.particles) {
      if (!p.active) continue;
      p.life += dt;
      if (p.life >= p.maxLife) {
        p.active = false;
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.92;
      p.vy *= 0.92;
    }
  }

  private updateSkidMarks(dt: number): void {
    for (const m of this.skidMarks) {
      if (!m.active) continue;
      m.life += dt;
      if (m.life > 25) m.active = false;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Drawing helpers                                                    */
  /* ------------------------------------------------------------------ */
  private drawCircle(ctx: CanvasRenderingContext2D, camera: Camera, wx: number, wy: number, r: number, color: string, fill = true): void {
    const s = camera.worldToScreen(wx, wy);
    const sr = r * camera.state.zoom;
    ctx.beginPath();
    ctx.arc(s.x, s.y, sr, 0, Math.PI * 2);
    ctx.fillStyle = color;
    if (fill) ctx.fill();
    else { ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke(); }
  }

  private drawLine(ctx: CanvasRenderingContext2D, camera: Camera, x1: number, y1: number, x2: number, y2: number, color: string, width = 2): void {
    const a = camera.worldToScreen(x1, y1);
    const b = camera.worldToScreen(x2, y2);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.strokeStyle = color;
    ctx.lineWidth = width * camera.state.zoom;
    ctx.stroke();
  }

  private drawPoly(ctx: CanvasRenderingContext2D, camera: Camera, pts: { x: number; y: number }[], color: string): void {
    if (pts.length === 0) return;
    ctx.beginPath();
    const first = camera.worldToScreen(pts[0].x, pts[0].y);
    ctx.moveTo(first.x, first.y);
    for (let i = 1; i < pts.length; i++) {
      const s = camera.worldToScreen(pts[i].x, pts[i].y);
      ctx.lineTo(s.x, s.y);
    }
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }

  private rot(x: number, y: number, psi: number): { x: number; y: number } {
    return { x: x * Math.cos(psi) - y * Math.sin(psi), y: x * Math.sin(psi) + y * Math.cos(psi) };
  }

  /* ------------------------------------------------------------------ */
  /* Track                                                              */
  /* ------------------------------------------------------------------ */
  private drawGrass(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    ctx.fillStyle = C_GRASS;
    ctx.fillRect(0, 0, width, height);
    // Subtle parallax grass layer (darker band) for depth.
    ctx.fillStyle = C_GRASS_ALT;
    ctx.fillRect(0, height * 0.55, width, height * 0.45);
  }

  private drawRoad(ctx: CanvasRenderingContext2D, camera: Camera, geometry: TrackGeometry): void {
    const { centerline, left, right } = geometry;
    if (centerline.length < 2) return;
    // Group contiguous samples with the same surface and draw a polygon per group.
    let groupStart = 0;
    for (let i = 1; i <= centerline.length; i++) {
      const same = i < centerline.length && centerline[i].surface === centerline[groupStart].surface;
      if (!same) {
        const surface = centerline[groupStart].surface;
        const color = surface === 'lowGrip' ? C_ROAD_LOWGRIP : C_ROAD;
        const pts: { x: number; y: number }[] = [];
        for (let j = groupStart; j < i; j++) pts.push(left[j]);
        for (let j = i - 1; j >= groupStart; j--) pts.push(right[j]);
        this.drawPoly(ctx, camera, pts, color);
        groupStart = i;
      }
    }
  }

  private drawBoundaries(ctx: CanvasRenderingContext2D, camera: Camera, geometry: TrackGeometry): void {
    const { left, right } = geometry;
    const drawStrip = (arr: { x: number; y: number }[], color: string) => {
      for (let i = 0; i < arr.length - 1; i++) {
        this.drawLine(ctx, camera, arr[i].x, arr[i].y, arr[i + 1].x, arr[i + 1].y, color, 3);
      }
    };
    drawStrip(left, C_CURB);
    drawStrip(right, C_CURB);
    // Inner red/white curb hint on alternating segments.
    for (let i = 0; i < left.length - 1; i += 12) {
      this.drawLine(ctx, camera, left[i].x, left[i].y, left[i + 1].x, left[i + 1].y, C_CURB_ALT, 2);
    }
  }

  private drawCenterline(ctx: CanvasRenderingContext2D, camera: Camera, geometry: TrackGeometry): void {
    const pts = geometry.centerline;
    ctx.beginPath();
    const first = camera.worldToScreen(pts[0].x, pts[0].y);
    ctx.moveTo(first.x, first.y);
    for (let i = 1; i < pts.length; i++) {
      const s = camera.worldToScreen(pts[i].x, pts[i].y);
      ctx.lineTo(s.x, s.y);
    }
    ctx.strokeStyle = C_MARK;
    ctx.lineWidth = 2 * camera.state.zoom;
    ctx.setLineDash([14 * camera.state.zoom, 16 * camera.state.zoom]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  private drawDistanceMarkers(ctx: CanvasRenderingContext2D, camera: Camera, geometry: TrackGeometry): void {
    const len = geometry.totalLength;
    const halfW = 14 / 2 + 1.5;
    for (let s = 50; s < len; s += 50) {
      // nearest sample
      let idx = 0;
      while (idx < geometry.centerline.length - 1 && geometry.centerline[idx + 1].s < s) idx++;
      const p = geometry.centerline[idx];
      // heading
      let hx = 1, hy = 0;
      if (idx < geometry.centerline.length - 1) {
        const n = geometry.centerline[idx + 1];
        const d = Math.hypot(n.x - p.x, n.y - p.y) || 1;
        hx = (n.x - p.x) / d; hy = (n.y - p.y) / d;
      }
      const nx = -hy, ny = hx;
      const x = p.x + nx * halfW;
      const y = p.y + ny * halfW;
      this.drawLine(ctx, camera, p.x + nx * (halfW - 0.6), p.y + ny * (halfW - 0.6), x, y, C_MARK, 2);
      const sscr = camera.worldToScreen(x, y);
      ctx.fillStyle = C_MARK;
      ctx.font = `bold ${10 * camera.state.zoom}px monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(`${Math.round(s)}m`, sscr.x, sscr.y - 6);
    }
  }

  private drawCones(ctx: CanvasRenderingContext2D, camera: Camera, geometry: TrackGeometry): void {
    for (const c of geometry.cones) {
      const s = camera.worldToScreen(c.x, c.y);
      const r = c.size * camera.state.zoom * 14;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y - r);
      ctx.lineTo(s.x - r, s.y + r * 0.55);
      ctx.lineTo(s.x + r, s.y + r * 0.55);
      ctx.closePath();
      ctx.fillStyle = c.color === 'orange' ? '#ff8c00' : c.color === 'blue' ? '#00d4ff' : '#ffb800';
      ctx.fill();
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  private drawCheckpoints(ctx: CanvasRenderingContext2D, camera: Camera, geometry: TrackGeometry): void {
    for (const cp of geometry.checkpoints) {
      const s = camera.worldToScreen(cp.x, cp.y);
      const r = cp.radius * camera.state.zoom;
      ctx.beginPath();
      ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
      ctx.strokeStyle = '#00d4ff';
      ctx.lineWidth = 2 * camera.state.zoom;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(s.x - r, s.y);
      ctx.lineTo(s.x + r, s.y);
      ctx.moveTo(s.x, s.y - r);
      ctx.lineTo(s.x, s.y + r);
      ctx.stroke();
    }
  }

  /* ------------------------------------------------------------------ */
  /* Scenery                                                            */
  /* ------------------------------------------------------------------ */
  private drawScenery(ctx: CanvasRenderingContext2D, camera: Camera, geometry: TrackGeometry): void {
    const { start } = geometry;
    // Place facility scenery near the start of the track.
    const ox = start.x;
    const oy = start.y - 22;
    // Pit building.
    ctx.fillStyle = '#22282e';
    this.drawRectWorld(ctx, camera, ox - 14, oy - 9, 28, 14, '#22282e', '#161a1f');
    ctx.fillStyle = '#00d4ff';
    this.drawRectWorld(ctx, camera, ox - 10, oy - 6, 20, 2, '#00d4ff', '#00d4ff'); // windows
    // Lighting masts.
    for (let i = -1; i <= 1; i += 2) {
      const mx = ox + i * 16;
      this.drawLine(ctx, camera, mx, oy - 12, mx, oy + 6, '#888', 2);
      ctx.fillStyle = '#ffb800';
      ctx.beginPath();
      const t = camera.worldToScreen(mx, oy + 6);
      ctx.arc(t.x, t.y, 3 * camera.state.zoom, 0, Math.PI * 2);
      ctx.fill();
    }
    // Tire wall.
    for (let i = 0; i < 6; i++) {
      const tx = ox - 10 + i * 3.2;
      this.drawCircle(ctx, camera, tx, oy - 14, 0.7, '#111');
    }
    // Grandstand silhouette.
    this.drawRectWorld(ctx, camera, ox + 26, oy - 14, 16, 6, '#1f262b', '#161a1f');
    this.drawRectWorld(ctx, camera, ox + 26, oy - 10, 16, 2, '#2a3134', '#2a3134');
    // Barriers along far edge near start.
    for (let i = 0; i < 5; i++) {
      const bx = ox - 6 + i * 2.6;
      this.drawRectWorld(ctx, camera, bx, oy - 20, 2, 1.2, '#b80000', '#7a0000');
    }
  }

  private drawRectWorld(
    ctx: CanvasRenderingContext2D,
    camera: Camera,
    x: number,
    y: number,
    w: number,
    h: number,
    color: string,
    sideColor: string,
  ): void {
    // Low-poly facet: front face + darker side face.
    const pts = [
      { x, y },
      { x: x + w, y },
      { x: x + w, y: y + h },
      { x, y: y + h },
    ];
    this.drawPoly(ctx, camera, pts, color);
    const side = [
      { x: x + w, y },
      { x: x + w + 1.2, y: y - 1.2 },
      { x: x + w + 1.2, y: y + h - 1.2 },
      { x: x + w, y: y + h },
    ];
    this.drawPoly(ctx, camera, side, sideColor);
  }

  /* ------------------------------------------------------------------ */
  /* Car                                                                */
  /* ------------------------------------------------------------------ */
  drawCar(ctx: CanvasRenderingContext2D, camera: Camera, state: VehicleState, steerAngle: number, brake: number): void {
    const { x, y, psi } = state;
    const a = 2.7 * (1 - 0.55); // CG to front (approx from defaults)
    const b = 2.7 * 0.55;
    const halfW = CAR_WIDTH / 2;

    // Shadow.
    const shadow = [
      this.rot(-a * 0.4, -halfW * 0.9, psi),
      this.rot(a * 0.4, -halfW * 0.9, psi),
      this.rot(a * 0.4, halfW * 0.9, psi),
      this.rot(-a * 0.4, halfW * 0.9, psi),
    ].map((p) => ({ x: x + p.x, y: y + p.y }));
    ctx.save();
    const sc = camera.worldToScreen(shadow[0].x, shadow[0].y);
    ctx.translate(sc.x, sc.y);
    ctx.rotate(psi);
    ctx.fillStyle = C_SHADOW;
    ctx.beginPath();
    ctx.ellipse(0, 0, CAR_LENGTH * 0.45 * camera.state.zoom, CAR_WIDTH * 0.45 * camera.state.zoom, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Chassis body (low-poly facets).
    const bodyPts = [
      this.rot(-CAR_LENGTH / 2, -halfW, psi),
      this.rot(CAR_LENGTH / 2, -halfW, psi),
      this.rot(CAR_LENGTH / 2 * 0.6, halfW, psi),
      this.rot(-CAR_LENGTH / 2 * 0.6, halfW, psi),
    ].map((p) => ({ x: x + p.x, y: y + p.y }));
    this.drawPoly(ctx, camera, bodyPts, C_BODY);
    // Darker side facet.
    const sidePts = [
      this.rot(CAR_LENGTH / 2, -halfW, psi),
      this.rot(CAR_LENGTH / 2 + 0.9, -halfW + 0.9, psi),
      this.rot(CAR_LENGTH / 2 * 0.6 + 0.9, halfW + 0.9, psi),
      this.rot(CAR_LENGTH / 2 * 0.6, halfW, psi),
    ].map((p) => ({ x: x + p.x, y: y + p.y }));
    this.drawPoly(ctx, camera, sidePts, C_BODY_DARK);
    // Cabin.
    const cabin = [
      this.rot(-CAR_LENGTH / 2 * 0.35, -halfW * 0.55, psi),
      this.rot(CAR_LENGTH / 2 * 0.25, -halfW * 0.55, psi),
      this.rot(CAR_LENGTH / 2 * 0.25, halfW * 0.55, psi),
      this.rot(-CAR_LENGTH / 2 * 0.35, halfW * 0.55, psi),
    ].map((p) => ({ x: x + p.x, y: y + p.y }));
    this.drawPoly(ctx, camera, cabin, '#0b1014');

    // Wheels.
    this.wheelAngle += (Math.hypot(state.vx, state.vy) / WHEEL_RADIUS) * 0.02; // visual roll
    const wheelLocs = [
      { lon: a, lat: -halfW, steer: steerAngle },
      { lon: a, lat: halfW, steer: steerAngle },
      { lon: -b, lat: -halfW, steer: 0 },
      { lon: -b, lat: halfW, steer: 0 },
    ];
    for (const w of wheelLocs) {
      const r = this.rot(w.lon, w.lat, psi);
      const wx = x + r.x;
      const wy = y + r.y;
      this.drawWheel(ctx, camera, wx, wy, psi + w.steer, this.wheelAngle);
    }

    // Brake lights.
    if (brake > 0.1) {
      const r1 = this.rot(-CAR_LENGTH / 2 + 0.3, -halfW + 0.25, psi);
      const r2 = this.rot(-CAR_LENGTH / 2 + 0.3, halfW - 0.25, psi);
      this.drawRectWorld(ctx, camera, x + r1.x - 0.25, y + r1.y - 0.12, 0.5, 0.24, C_BRAKE, '#7a0000');
      this.drawRectWorld(ctx, camera, x + r2.x - 0.25, y + r2.y - 0.12, 0.5, 0.24, C_BRAKE, '#7a0000');
      // Glow.
      ctx.fillStyle = 'rgba(255,59,59,0.35)';
      const g1 = camera.worldToScreen(x + r1.x, y + r1.y);
      ctx.beginPath();
      ctx.arc(g1.x, g1.y, 10 * camera.state.zoom, 0, Math.PI * 2);
      ctx.fill();
      const g2 = camera.worldToScreen(x + r2.x, y + r2.y);
      ctx.beginPath();
      ctx.arc(g2.x, g2.y, 10 * camera.state.zoom, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawWheel(
    ctx: CanvasRenderingContext2D,
    camera: Camera,
    wx: number,
    wy: number,
    angle: number,
    roll: number,
  ): void {
    const s = camera.worldToScreen(wx, wy);
    const r = 0.33 * camera.state.zoom;
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(angle);
    // Tire.
    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1.5 * camera.state.zoom;
    ctx.stroke();
    // Hub.
    ctx.fillStyle = '#222';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.4, 0, Math.PI * 2);
    ctx.fill();
    // Spoke to show rotation.
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 2 * camera.state.zoom;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(roll) * r * 0.85, Math.sin(roll) * r * 0.85);
    ctx.stroke();
    ctx.restore();
  }

  /* ------------------------------------------------------------------ */
  /* Particles & skid marks                                             */
  /* ------------------------------------------------------------------ */
  private drawParticles(ctx: CanvasRenderingContext2D, camera: Camera): void {
    for (const p of this.particles) {
      if (!p.active) continue;
      const s = camera.worldToScreen(p.x, p.y);
      const alpha = 1 - p.life / p.maxLife;
      const size = p.size * camera.state.zoom * alpha;
      if (size <= 0) continue;
      ctx.fillStyle = p.color;
      ctx.globalAlpha = alpha;
      ctx.fillRect(s.x - size / 2, s.y - size / 2, size, size);
      ctx.globalAlpha = 1;
    }
  }

  private drawSkidMarks(ctx: CanvasRenderingContext2D, camera: Camera): void {
    for (const m of this.skidMarks) {
      if (!m.active) continue;
      const alpha = 1 - Math.min(m.life / 25, 1);
      const a = camera.worldToScreen(m.x1, m.y1);
      const b = camera.worldToScreen(m.x2, m.y2);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = m.color;
      ctx.globalAlpha = alpha * 0.6;
      ctx.lineWidth = 3 * camera.state.zoom;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Main render                                                        */
  /* ------------------------------------------------------------------ */
  render(ctx: CanvasRenderingContext2D, frame: RenderFrame): void {
    const { camera, state, internals, geometry, surface, width, height } = frame;
    const dt = 1 / 60;
    this.updateParticles(dt);
    this.updateSkidMarks(dt);

    this.drawGrass(ctx, width, height);
    this.drawScenery(ctx, camera, geometry);
    this.drawRoad(ctx, camera, geometry);
    this.drawBoundaries(ctx, camera, geometry);
    this.drawCenterline(ctx, camera, geometry);
    this.drawDistanceMarkers(ctx, camera, geometry);
    this.drawCones(ctx, camera, geometry);
    this.drawCheckpoints(ctx, camera, geometry);

    // Slip particles + skid marks at contact patches.
    const slip = internals.gripUtil;
    const slipping = internals.status === 'tractionLimited' || internals.status === 'wheelLock' || slip > 0.8;
    const a = 2.7 * (1 - 0.55);
    const b = 2.7 * 0.55;
    const halfW = CAR_WIDTH / 2;
    const patches = [
      { lon: a, lat: -halfW },
      { lon: a, lat: halfW },
      { lon: -b, lat: -halfW },
      { lon: -b, lat: halfW },
    ];
    const prevPatches = this.lastPatches;
    this.lastPatches = patches.map((p) => this.rot(p.lon, p.lat, state.psi));
    if (prevPatches && slipping) {
      for (let i = 0; i < patches.length; i++) {
        const r = this.lastPatches[i];
        const px = state.x + r.x;
        const py = state.y + r.y;
        this.emitSlip(px, py, slip, surface);
        if (slip > 0.85 && prevPatches[i]) {
          const pr = prevPatches[i];
          this.emitSkid(state.x + pr.x, state.y + pr.y, px, py, slip);
        }
      }
    }

    this.drawSkidMarks(ctx, camera);
    this.drawCar(ctx, camera, state, state.steerAngle, state.brake);
    this.drawParticles(ctx, camera);
  }

  private lastPatches: { x: number; y: number }[] | null = null;
}

export type { TelemetrySample };
