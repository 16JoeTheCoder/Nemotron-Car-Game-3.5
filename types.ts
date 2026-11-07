// Shared contract types for Vehicle Dynamics Lab.
// Unit convention: SI units internally (m, kg, s, N, Pa, rad, rad/s).
// Unit conversion happens only at the UI boundary (km/h, °/s, %).
export type Drivetrain = 'FWD' | 'RWD' | 'AWD';
export type Transmission = 'auto' | 'manual';
export type TireCompound = 'economy' | 'touring' | 'sport' | 'racing';
export type Surface = 'asphalt' | 'lowGrip' | 'concrete';
export type CarStatus =
  | 'normal'
  | 'understeer'
  | 'oversteer'
  | 'tractionLimited'
  | 'wheelLock';

export interface VehicleParams {
  // Chassis
  mass: number; // kg
  weightDistributionFront: number; // 0..1, share of static weight on front axle
  wheelbase: number; // m
  cogHeight: number; // m
  yawInertia: number; // kg*m^2, 0 = auto-compute from mass & dimensions
  // Powertrain
  peakPowerKw: number;
  peakTorqueNm: number;
  redlineRpm: number;
  gearRatios: number[]; // ratio per gear, index 0 = 1st gear
  finalDrive: number;
  drivetrainEfficiency: number; // 0..1
  drivetrain: Drivetrain;
  transmission: Transmission;
  // Tires
  tireCompound: TireCompound;
  frictionCoefficient: number; // mu, 0..1+
  gripBalanceFront: number; // 0..1, share of lateral grip capability at front
  corneringStiffness: number; // N/rad per axle (scaled by compound)
  // Aerodynamics
  cd: number; // drag coefficient
  frontalArea: number; // m^2
  downforceCoefficient: number; // effective downforce scale (N per (m/s)^2)
  aeroBalanceFront: number; // 0..1, share of downforce on front axle
  // Braking / steering
  maxBrakeForce: number; // N, total braking force at limit
  brakeBiasFront: number; // 0..1, share of braking at front
  maxSteerAngle: number; // rad
  steerRate: number; // rad/s, steering response speed
  wheelRadius: number; // m
}

export interface VehicleState {
  x: number; // m
  y: number; // m
  psi: number; // rad, heading
  vx: number; // m/s, body longitudinal velocity
  vy: number; // m/s, body lateral velocity
  r: number; // rad/s, yaw rate
  wheelOmega: number; // rad/s, driven axle wheel angular velocity
  gear: number; // 1-based current gear
  rpm: number;
  throttle: number; // 0..1
  brake: number; // 0..1
  steering: number; // -1..1 driver input
  steerAngle: number; // rad, actual front steer angle
  surface: Surface;
  ax: number; // m/s^2, world longitudinal accel (for g display)
  ay: number; // m/s^2, world lateral accel
}

export interface Inputs {
  throttle: number; // 0..1
  brake: number; // 0..1
  steer: number; // -1..1
  handbrake: boolean;
  shiftUp: boolean; // edge-triggered
  shiftDown: boolean; // edge-triggered
  reset: boolean; // edge-triggered
}

export interface TelemetrySample {
  t: number; // s
  speedKmh: number;
  rpm: number;
  gear: number;
  throttle: number;
  brake: number;
  steer: number;
  axG: number;
  ayG: number;
  yawRateDeg: number;
  alphaF: number; // deg
  alphaR: number; // deg
  gripUtil: number; // 0..1
  powerKw: number;
  surface: Surface;
  status: CarStatus;
}

export interface TrackDef {
  id: string;
  name: string;
  // Procedural track description: list of {kind, length, radius, turnDir}
  segments: TrackSegment[];
  surfaceZones: SurfaceZone[]; // along-track s ranges with different friction
  checkpoints: Checkpoint[]; // ordered, for circuit laps
  cones: Cone[]; // decorative + slalom
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
  start: { x: number; y: number; psi: number };
}

export interface TrackSegment {
  kind: 'straight' | 'arc';
  length: number; // m
  radius?: number; // m, for arcs
  turnDir?: -1 | 1; // for arcs
  surface: Surface;
}

export interface SurfaceZone {
  sStart: number; // m along track
  sEnd: number;
  surface: Surface;
  frictionCoefficient: number;
}

export interface Checkpoint {
  id: string;
  x: number;
  y: number;
  radius: number; // m, trigger radius
  order: number;
}

export interface Cone {
  x: number;
  y: number;
  size: number; // m
  color: 'orange' | 'blue' | 'yellow';
}

export interface TestResult {
  testId: 'A' | 'B' | 'C';
  setupName: string;
  paramsHash: string;
  values: Record<string, number>;
  timestamp: number; // ms
}

export interface GaragePreset {
  name: string;
  description: string;
  params: VehicleParams;
}

export interface AppSettings {
  units: 'metric' | 'imperial';
  cameraMode: 'follow' | 'fixed' | 'cinematic';
  tractionControl: boolean;
  stabilityControl: boolean;
  transmission: Transmission;
  volume: number; // 0..1 placeholder for future audio
}

export interface SavedState {
  setup: VehicleParams;
  presets: GaragePreset[];
  records: TestResult[];
  settings: AppSettings;
  version: number;
}

export interface EngineInternals {
  ax: number;
  ay: number;
  alphaF: number;
  alphaR: number;
  Fyf: number;
  Fyr: number;
  FxDrive: number;
  FxBrake: number;
  Fzf: number;
  Fzr: number;
  mu: number;
  gripUtil: number;
  status: CarStatus;
}
