// Canvas 2D Renderer
// Dynamic low-poly aesthetic with procedural drawing

import type { VehicleState, TrackDef, SurfaceType, TelemetrySample } from '../types';
import { PHYSICS_CONSTANTS } from '../types';

/** Camera state */
export interface CameraState {
  x: number;
  y: number;
  zoom: number;
  rotation: number;
  mode: 'follow' | 'fixed' | 'top-down';
  targetX: number;
  targetY: number;
  targetZoom: number;
  shakeIntensity: number;
  shakeDecay: number;
}

/** Skid mark */
export interface SkidMark {
  x: number;
  y: number;
  heading: number;
  intensity: number;
  age: number;
  width: number;
}

/** Particle for smoke/dust */
export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  type: 'smoke' | 'dust' | 'spark';
}

/** Renderer configuration */
export interface RendererConfig {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  pixelRatio: number;
}

/** Color palette - dynamic low-poly */
const COLORS = {
  // Background
  sky: '#0d0d1a',
  skyHorizon: '#1a1a3e',
  ground: '#151525',
  groundDark: '#0f0f1a',

  // Track
  asphalt: '#2a2a3e',
  asphaltLight: '#35354a',
  asphaltDark: '#1e1e30',
  lowGrip: '#3a2a2a',
  lowGripLight: '#4a3a3a',
  wet: '#1a1a3a',
  gravel: '#3a352a',
  curb: '#e8e8e8',
  curbDark: '#888888',
  lineWhite: '#ffffff',
  lineYellow: '#ffcc00',
  lineRed: '#cc3333',

  // Car
  carBody: '#0066cc',
  carBodyDark: '#004499',
  carBodyLight: '#3399ff',
  carRoof: '#003366',
  wheel: '#1a1a1a',
  wheelRim: '#444444',
  brakeLight: '#cc0000',
  brakeLightGlow: '#ff3333',
  headlight: '#ffffee',
  headlightGlow: '#ffffcc',

  // UI
  electricBlue: '#00ccff',
  electricBlueDim: '#0088aa',
  amber: '#ffaa00',
  amberDim: '#cc8800',
  white: '#ffffff',
  gray: '#888888',
  darkGray: '#444444',
  red: '#ff3333',
  green: '#33cc33',

  // Particles
  smoke: '#444455',
  dust: '#665544',
  spark: '#ffaa00',
} as const;

/** Create renderer */
export function createRenderer(config: RendererConfig) {
  const { canvas, width, height, pixelRatio } = config;
  const ctx = canvas.getContext('2d')!;

  canvas.width = width * pixelRatio;
  canvas.height = height * pixelRatio;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  ctx.scale(pixelRatio, pixelRatio);

  // Camera
  let camera: CameraState = {
    x: 0,
    y: 0,
    zoom: 1,
    rotation: 0,
    mode: 'follow',
    targetX: 0,
    targetY: 0,
    targetZoom: 1,
    shakeIntensity: 0,
    shakeDecay: 0.9,
  };

  // Skid marks (capped ring buffer)
  const MAX_SKID_MARKS = 500;
  const skidMarks: SkidMark[] = [];

  // Particles
  const MAX_PARTICLES = 200;
  const particles: Particle[] = [];

  // Track mesh cache
  let trackMesh: TrackMesh | null = null;

  /** Update camera */
    function updateCamera(vehicle: VehicleState, _dt: number, speedKph: number) {
    const targetZoom = Math.max(0.5, Math.min(2.5, 1.5 - speedKph / 400));
    const lookAhead = 30 + speedKph / 3;

    camera.targetX = vehicle.x + Math.cos(vehicle.heading) * lookAhead;
    camera.targetY = vehicle.y + Math.sin(vehicle.heading) * lookAhead;
    camera.targetZoom = targetZoom;

    // Smooth follow
    const lerp = 0.08;
    camera.x += (camera.targetX - camera.x) * lerp;
    camera.y += (camera.targetY - camera.y) * lerp;
    camera.zoom += (camera.targetZoom - camera.zoom) * lerp;

    // Camera shake
    if (camera.shakeIntensity > 0.1) {
      camera.x += (Math.random() - 0.5) * camera.shakeIntensity;
      camera.y += (Math.random() - 0.5) * camera.shakeIntensity;
      camera.shakeIntensity *= camera.shakeDecay;
    } else {
      camera.shakeIntensity = 0;
    }

    // Speed-based rotation (slight banking feel)
    camera.rotation = vehicle.yawRate * 0.3;
  }

  /** Add camera shake */
  function addCameraShake(intensity: number) {
    camera.shakeIntensity = Math.max(camera.shakeIntensity, intensity);
  }

  /** Add skid mark */
  function addSkidMark(x: number, y: number, heading: number, intensity: number, width: number) {
    if (intensity < 0.3) return;

    skidMarks.push({
      x,
      y,
      heading,
      intensity: Math.min(1, intensity),
      age: 0,
      width,
    });

    if (skidMarks.length > MAX_SKID_MARKS) {
      skidMarks.shift();
    }
  }

  /** Add particle */
  function addParticle(particle: Omit<Particle, 'life'>) {
    if (particles.length >= MAX_PARTICLES) return;

    particles.push({
      ...particle,
      life: particle.maxLife,
    });
  }

  /** Update particles */
  function updateParticles(dt: number) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 2 * dt; // Gravity
      p.life -= dt;
      if (p.life <= 0) {
        particles.splice(i, 1);
      }
    }
  }

  /** Update skid marks */
  function updateSkidMarks(dt: number) {
    for (const mark of skidMarks) {
      mark.age += dt;
      mark.intensity *= 0.995; // Fade slowly
    }
    // Remove very old marks
    while (skidMarks.length > 0 && skidMarks[0].age > 30) {
      skidMarks.shift();
    }
  }

  /** World to screen transform */
  function worldToScreen(wx: number, wy: number): { x: number; y: number } {
    const dx = wx - camera.x;
    const dy = wy - camera.y;
    const cos = Math.cos(-camera.rotation);
    const sin = Math.sin(-camera.rotation);
    const rx = dx * cos - dy * sin;
    const ry = dx * sin + dy * cos;
    return {
      x: width / 2 + rx * camera.zoom,
      y: height / 2 + ry * camera.zoom,
    };
  }

  /** Draw track */
  function drawTrack(track: TrackDef) {
    if (!trackMesh) {
      trackMesh = buildTrackMesh(track);
    }

    ctx.save();

    // Draw track surface
    for (const segment of trackMesh.segments) {
      const screenPts = segment.points.map(p => worldToScreen(p.x, p.y));

      // Determine color based on surface
            let fillColor: string = COLORS.asphalt;
      if (segment.surfaceType === 'low-grip') fillColor = COLORS.lowGrip;
            else if (segment.surfaceType === 'wet') fillColor = COLORS.wet;
            else if (segment.surfaceType === 'gravel') fillColor = COLORS.gravel;

      // Draw polygon
      ctx.beginPath();
      ctx.moveTo(screenPts[0].x, screenPts[0].y);
      for (let i = 1; i < screenPts.length; i++) {
        ctx.lineTo(screenPts[i].x, screenPts[i].y);
      }
      ctx.closePath();

      // Flat shaded with subtle gradient
      const grad = ctx.createLinearGradient(
        screenPts[0].x, screenPts[0].y,
        screenPts[screenPts.length - 1].x, screenPts[screenPts.length - 1].y
      );
      grad.addColorStop(0, fillColor);
      grad.addColorStop(1, shadeColor(fillColor, -20));
      ctx.fillStyle = grad;
      ctx.fill();

      // Edge highlight
      ctx.strokeStyle = shadeColor(fillColor, 30);
      ctx.lineWidth = 1 / camera.zoom;
      ctx.stroke();
    }

    // Draw curbs
    for (const curb of trackMesh.curbs) {
      const screenPts = curb.points.map(p => worldToScreen(p.x, p.y));
      ctx.beginPath();
      ctx.moveTo(screenPts[0].x, screenPts[0].y);
      for (let i = 1; i < screenPts.length; i++) {
        ctx.lineTo(screenPts[i].x, screenPts[i].y);
      }
      ctx.closePath();
      ctx.fillStyle = curb.side === 'left' ? COLORS.curb : COLORS.curbDark;
      ctx.fill();
    }

    // Draw lines
    for (const line of trackMesh.lines) {
      const screenPts = line.points.map(p => worldToScreen(p.x, p.y));
      ctx.beginPath();
      ctx.moveTo(screenPts[0].x, screenPts[0].y);
      for (let i = 1; i < screenPts.length; i++) {
        ctx.lineTo(screenPts[i].x, screenPts[i].y);
      }
      ctx.strokeStyle = line.color;
      ctx.lineWidth = (line.width || 0.15) * camera.zoom;
      ctx.setLineDash(line.dash || []);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Draw distance markers
        for (const marker of trackMesh.markers) {
          const pos = worldToScreen(marker.x, marker.y);
          ctx.fillStyle = COLORS.lineWhite;
          ctx.font = `bold ${Math.max(8, 12 * camera.zoom)}px monospace`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(marker.text, pos.x, pos.y);
        }

    ctx.restore();
  }

  /** Draw car */
  function drawCar(vehicle: VehicleState) {
    ctx.save();

    const pos = worldToScreen(vehicle.x, vehicle.y);
    ctx.translate(pos.x, pos.y);
    ctx.rotate(vehicle.heading - camera.rotation);
    ctx.scale(camera.zoom, camera.zoom);

    // Car dimensions
    const length = 4.5;
    const width = 1.9;
    const wheelbase = 2.7;
    const frontOverhang = 0.9;
        // const rearOverhang = length - wheelbase - frontOverhang;
    const trackWidth = 1.6;

    // Shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.beginPath();
    ctx.ellipse(0, 0.3, length * 0.4, width * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Chassis - low poly facets
    const facets = [
      // Main body
      { points: [-frontOverhang, -width/2, wheelbase - frontOverhang, -width/2, wheelbase - frontOverhang, width/2, -frontOverhang, width/2], color: COLORS.carBody },
      // Roof
      { points: [-frontOverhang + 0.5, -width/2 * 0.6, wheelbase - frontOverhang - 0.5, -width/2 * 0.6, wheelbase - frontOverhang - 0.5, width/2 * 0.6, -frontOverhang + 0.5, width/2 * 0.6], color: COLORS.carRoof },
      // Front hood
      { points: [-frontOverhang, -width/2, -frontOverhang + 0.5, -width/2 * 0.6, -frontOverhang + 0.5, width/2 * 0.6, -frontOverhang, width/2], color: COLORS.carBodyDark },
      // Rear deck
      { points: [wheelbase - frontOverhang, -width/2, wheelbase - frontOverhang - 0.5, -width/2 * 0.6, wheelbase - frontOverhang - 0.5, width/2 * 0.6, wheelbase - frontOverhang, width/2], color: COLORS.carBodyDark },
    ];

    for (const facet of facets) {
      ctx.beginPath();
      ctx.moveTo(facet.points[0], facet.points[1]);
      for (let i = 2; i < facet.points.length; i += 2) {
        ctx.lineTo(facet.points[i], facet.points[i + 1]);
      }
      ctx.closePath();

      // Add subtle lighting based on facet normal
            const lightDir = { x: 0.3, y: -0.5 }; // Top-right light
            const normal = { x: 0, y: -1 }; // Simplified
            const lightIntensity = 0.8 + 0.2 * (normal.x * lightDir.x + normal.y * lightDir.y);

      ctx.fillStyle = shadeColor(facet.color, lightIntensity > 0.9 ? 20 : -20);
      ctx.fill();

      // Edge lines
      ctx.strokeStyle = shadeColor(facet.color, -40);
      ctx.lineWidth = 0.02;
      ctx.stroke();
    }

    // Wheels
    const wheelPositions = [
      { x: -frontOverhang + 0.3, y: -trackWidth / 2 - 0.15 }, // FL
      { x: -frontOverhang + 0.3, y: trackWidth / 2 + 0.15 },  // FR
      { x: wheelbase - frontOverhang - 0.3, y: -trackWidth / 2 - 0.15 }, // RL
      { x: wheelbase - frontOverhang - 0.3, y: trackWidth / 2 + 0.15 },  // RR
    ];

    const steerAngle = vehicle.steeringInput * 0.6; // Max steer angle

    for (let i = 0; i < 4; i++) {
      const wp = wheelPositions[i];
      ctx.save();
      ctx.translate(wp.x, wp.y);

      // Steer front wheels
      if (i < 2) {
        ctx.rotate(steerAngle);
      }

      // Wheel rotation
      const wheelRot = vehicle.wheelOmega[i] * PHYSICS_CONSTANTS.WHEEL_RADIUS * 0.1;

      // Tire
      ctx.fillStyle = COLORS.wheel;
      ctx.beginPath();
      ctx.ellipse(0, 0, 0.33, 0.12, 0, 0, Math.PI * 2);
      ctx.fill();

      // Rim (low poly - 8 spokes)
      ctx.strokeStyle = COLORS.wheelRim;
      ctx.lineWidth = 0.015;
      for (let s = 0; s < 8; s++) {
        const angle = (s / 8) * Math.PI * 2 + wheelRot;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(angle) * 0.25, Math.sin(angle) * 0.25);
        ctx.stroke();
      }
      // Rim outer
      ctx.beginPath();
      ctx.arc(0, 0, 0.25, 0, Math.PI * 2);
      ctx.stroke();

      ctx.restore();
    }

    // Brake lights
    if (vehicle.brake > 0.1) {
      const rearY = wheelbase - frontOverhang;
      ctx.fillStyle = COLORS.brakeLightGlow;
      ctx.beginPath();
      ctx.ellipse(-width/2 + 0.2, rearY + 0.15, 0.15, 0.08, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(width/2 - 0.2, rearY + 0.15, 0.15, 0.08, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Headlights (subtle glow forward)
    if (vehicle.vx > 1) {
      const frontY = -frontOverhang;
      const grad = ctx.createRadialGradient(-width/2 + 0.3, frontY - 0.2, 0, -width/2 + 0.3, frontY - 0.2, 10);
      grad.addColorStop(0, 'rgba(255,255,230,0.3)');
      grad.addColorStop(1, 'rgba(255,255,230,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(-width/2 + 0.3, frontY - 0.2);
      ctx.lineTo(-width/2 - 2, frontY - 5);
      ctx.lineTo(-width/2 + 2, frontY - 5);
      ctx.closePath();
      ctx.fill();

      const grad2 = ctx.createRadialGradient(width/2 - 0.3, frontY - 0.2, 0, width/2 - 0.3, frontY - 0.2, 10);
      grad2.addColorStop(0, 'rgba(255,255,230,0.3)');
      grad2.addColorStop(1, 'rgba(255,255,230,0)');
      ctx.fillStyle = grad2;
      ctx.beginPath();
      ctx.moveTo(width/2 - 0.3, frontY - 0.2);
      ctx.lineTo(width/2 - 2, frontY - 5);
      ctx.lineTo(width/2 + 2, frontY - 5);
      ctx.closePath();
      ctx.fill();
    }

    // Status indicators (understeer/oversteer)
    if (vehicle.status === 'understeer') {
      ctx.fillStyle = 'rgba(255, 170, 0, 0.5)';
      ctx.beginPath();
      ctx.arc(0, -1, 0.5, 0, Math.PI * 2);
      ctx.fill();
    } else if (vehicle.status === 'oversteer') {
      ctx.fillStyle = 'rgba(255, 50, 50, 0.5)';
      ctx.beginPath();
      ctx.arc(0, -1, 0.5, 0, Math.PI * 2);
      ctx.fill();
    } else if (vehicle.status === 'traction-limited') {
      ctx.fillStyle = 'rgba(0, 200, 255, 0.5)';
      ctx.beginPath();
      ctx.arc(0, -1, 0.5, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  /** Draw skid marks */
  function drawSkidMarks() {
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';

    for (const mark of skidMarks) {
      const pos = worldToScreen(mark.x, mark.y);
      const alpha = mark.intensity * (1 - mark.age / 30) * 0.4;
      if (alpha < 0.02) continue;

      ctx.translate(pos.x, pos.y);
      ctx.rotate(mark.heading - camera.rotation);
      ctx.scale(camera.zoom, camera.zoom);

      ctx.fillStyle = `rgba(20, 20, 20, ${alpha})`;
      ctx.fillRect(-mark.width / 2, -0.05, mark.width, 0.1);

      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }

    ctx.restore();
  }

  /** Draw particles */
  function drawParticles() {
    ctx.save();

    for (const p of particles) {
      const pos = worldToScreen(p.x, p.y);
      const alpha = p.life / p.maxLife;
      const size = p.size * camera.zoom * alpha;

      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, size, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  /** Draw facility background */
    function drawFacility(_track: TrackDef) {
    // Sky gradient
    const skyGrad = ctx.createLinearGradient(0, 0, 0, height);
    skyGrad.addColorStop(0, COLORS.sky);
    skyGrad.addColorStop(0.5, COLORS.skyHorizon);
    skyGrad.addColorStop(1, COLORS.ground);
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, width, height);

    // Distant buildings (parallax)
    ctx.save();
    ctx.translate(-camera.x * 0.1, -camera.y * 0.1);
    ctx.scale(camera.zoom * 0.5, camera.zoom * 0.5);
    ctx.translate(width / 2, height / 2);

    // Grandstand silhouettes
    ctx.fillStyle = '#0a0a15';
    for (let i = -5; i <= 5; i++) {
      const x = i * 80 + Math.sin(i * 1.5) * 20;
      const h = 15 + Math.abs(i) * 3;
      ctx.fillRect(x - 15, -height - h, 30, h);
    }

    // Lighting masts
    ctx.strokeStyle = '#222233';
    ctx.lineWidth = 2;
    for (let i = -3; i <= 3; i++) {
      const x = i * 120;
      ctx.beginPath();
      ctx.moveTo(x, -height);
      ctx.lineTo(x, -height + 40);
      ctx.stroke();
      // Light at top
      ctx.fillStyle = '#ffffcc';
      ctx.beginPath();
      ctx.arc(x, -height + 40, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  /** Main render function */
  function render(vehicle: VehicleState, track: TrackDef, dt: number) {
    // Clear
    ctx.clearRect(0, 0, width, height);

    // Update camera
    updateCamera(vehicle, dt, vehicle.speedKph);

    // Draw facility background
    drawFacility(track);

    // Draw track
    drawTrack(track);

    // Draw skid marks
    drawSkidMarks();

    // Draw car
    drawCar(vehicle);

    // Draw particles
    drawParticles();

    // Update simulation
    updateParticles(dt);
    updateSkidMarks(dt);
  }

  /** Get camera state */
  function getCamera(): CameraState {
    return { ...camera };
  }

  /** Set camera mode */
  function setCameraMode(mode: CameraState['mode']) {
    camera.mode = mode;
  }

  /** Resize */
  function resize(newWidth: number, newHeight: number, newPixelRatio: number) {
    canvas.width = newWidth * newPixelRatio;
    canvas.height = newHeight * newPixelRatio;
    canvas.style.width = `${newWidth}px`;
    canvas.style.height = `${newHeight}px`;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(newPixelRatio, newPixelRatio);
  }

  return {
    render,
    getCamera,
    setCameraMode,
    resize,
    addSkidMark,
    addParticle,
    addCameraShake,
  };
}

/** Build track mesh for efficient rendering */
interface TrackMesh {
  segments: TrackSegment[];
  curbs: Curb[];
  lines: TrackLine[];
  markers: DistanceMarker[];
}

interface TrackSegment {
  points: { x: number; y: number }[];
  surfaceType: SurfaceType;
}

interface Curb {
  points: { x: number; y: number }[];
  side: 'left' | 'right';
}

interface TrackLine {
  points: { x: number; y: number }[];
  color: string;
  width?: number;
  dash?: number[];
}

interface DistanceMarker {
  x: number;
  y: number;
  text: string;
}

function buildTrackMesh(track: TrackDef): TrackMesh {
  const segments: TrackSegment[] = [];
  const curbs: Curb[] = [];
  const lines: TrackLine[] = [];
  const markers: DistanceMarker[] = [];

  const { centerline, width } = track;
  const halfWidth = width / 2;

  // Build track segments from centerline
  for (let i = 0; i < centerline.length - 1; i++) {
    const p1 = centerline[i];
    const p2 = centerline[i + 1];

    // Calculate perpendicular
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.hypot(dx, dy);
    if (len === 0) continue;

    const nx = -dy / len;
    const ny = dx / len;

    // Determine surface type at this segment
    let surfaceType: SurfaceType = 'asphalt';
    for (const zone of track.surfaces) {
      if (pointInZone(p1, zone)) {
        surfaceType = zone.type;
        break;
      }
    }

    // Track segment polygon
    segments.push({
      points: [
        { x: p1.x - nx * halfWidth, y: p1.y - ny * halfWidth },
        { x: p2.x - nx * halfWidth, y: p2.y - ny * halfWidth },
        { x: p2.x + nx * halfWidth, y: p2.y + ny * halfWidth },
        { x: p1.x + nx * halfWidth, y: p1.y + ny * halfWidth },
      ],
      surfaceType,
    });

    // Curbs
    curbs.push({
      points: [
        { x: p1.x - nx * halfWidth, y: p1.y - ny * halfWidth },
        { x: p2.x - nx * halfWidth, y: p2.y - ny * halfWidth },
        { x: p2.x - nx * (halfWidth + 0.5), y: p2.y - ny * (halfWidth + 0.5) },
        { x: p1.x - nx * (halfWidth + 0.5), y: p1.y - ny * (halfWidth + 0.5) },
      ],
      side: 'left',
    });
    curbs.push({
      points: [
        { x: p1.x + nx * halfWidth, y: p1.y + ny * halfWidth },
        { x: p2.x + nx * halfWidth, y: p2.y + ny * halfWidth },
        { x: p2.x + nx * (halfWidth + 0.5), y: p2.y + ny * (halfWidth + 0.5) },
        { x: p1.x + nx * (halfWidth + 0.5), y: p1.y + ny * (halfWidth + 0.5) },
      ],
      side: 'right',
    });

    // Center line (dashed)
    if (i % 4 === 0) {
      lines.push({
        points: [p1, p2],
        color: COLORS.lineWhite,
        width: 0.1,
        dash: [3, 6],
      });
    }

    // Edge lines
    lines.push({
      points: [
        { x: p1.x - nx * halfWidth, y: p1.y - ny * halfWidth },
        { x: p2.x - nx * halfWidth, y: p2.y - ny * halfWidth },
      ],
      color: COLORS.lineWhite,
      width: 0.15,
    });
    lines.push({
      points: [
        { x: p1.x + nx * halfWidth, y: p1.y + ny * halfWidth },
        { x: p2.x + nx * halfWidth, y: p2.y + ny * halfWidth },
      ],
      color: COLORS.lineWhite,
      width: 0.15,
    });

    // Distance markers every 100m
    const dist = i * len;
    if (Math.abs(dist % 100) < len / 2) {
      markers.push({
        x: p1.x,
        y: p1.y - ny * (halfWidth + 2),
        text: `${Math.round(dist)}m`,
      });
    }
  }

  return { segments, curbs, lines, markers };
}

function pointInZone(point: { x: number; y: number }, zone: any): boolean {
  if (zone.shape === 'circle' && zone.center && zone.radius) {
    const dx = point.x - zone.center.x;
    const dy = point.y - zone.center.y;
    return dx * dx + dy * dy <= zone.radius * zone.radius;
  }
  if (zone.shape === 'rect' && zone.rect) {
    return point.x >= zone.rect.x && point.x <= zone.rect.x + zone.rect.w &&
           point.y >= zone.rect.y && point.y <= zone.rect.y + zone.rect.h;
  }
  if (zone.shape === 'polygon' && zone.polygon) {
    return pointInPolygon(point, zone.polygon);
  }
  return false;
}

function pointInPolygon(point: { x: number; y: number }, polygon: { x: number; y: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    if (((yi > point.y) !== (yj > point.y)) &&
        (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

function shadeColor(color: string, amount: number): string {
  // Simple color shading
  const hex = color.replace('#', '');
  const r = Math.max(0, Math.min(255, parseInt(hex.substr(0, 2), 16) + amount));
  const g = Math.max(0, Math.min(255, parseInt(hex.substr(2, 2), 16) + amount));
  const b = Math.max(0, Math.min(255, parseInt(hex.substr(4, 2), 16) + amount));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

/** Telemetry graph renderer */
export function drawTelemetryGraph(
  ctx: CanvasRenderingContext2D,
  samples: TelemetrySample[],
  x: number,
  y: number,
  width: number,
  height: number,
  dataKey: keyof TelemetrySample,
  color: string,
  label: string,
  minVal: number,
  maxVal: number
) {
  if (samples.length < 2) return;

  ctx.save();

  // Background
  ctx.fillStyle = 'rgba(10, 10, 20, 0.8)';
  ctx.fillRect(x, y, width, height);

  // Grid
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
  ctx.lineWidth = 1;
  for (let i = 1; i < 4; i++) {
    const gy = y + (height / 4) * i;
    ctx.beginPath();
    ctx.moveTo(x, gy);
    ctx.lineTo(x + width, gy);
    ctx.stroke();
  }

  // Graph line
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();

  const range = maxVal - minVal;
  for (let i = 0; i < samples.length; i++) {
    const val = samples[i][dataKey] as number;
    const px = x + (i / (samples.length - 1)) * width;
    const py = y + height - ((val - minVal) / range) * height;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();

  // Current value indicator
  const lastVal = samples[samples.length - 1][dataKey] as number;
  const lastX = x + width;
  const lastY = y + height - ((lastVal - minVal) / range) * height;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(lastX, lastY, 4, 0, Math.PI * 2);
  ctx.fill();

  // Label
  ctx.fillStyle = '#ffffff';
  ctx.font = '11px monospace';
  ctx.textAlign = 'left';
  ctx.fillText(`${label}: ${lastVal.toFixed(1)}`, x + 5, y + 15);

  ctx.restore();
}