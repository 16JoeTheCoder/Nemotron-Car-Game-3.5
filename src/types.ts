// Vehicle Dynamics Lab - Shared Type Contract
// All modules must import types from this file only.
// SI units used internally; UI layer handles unit conversion.

/** Drivetrain type */
export type DrivetrainType = 'FWD' | 'RWD' | 'AWD';

/** Tire compound type */
export type TireCompound = 'economy' | 'touring' | 'sport' | 'racing';

/** Surface type for track zones */
export type SurfaceType = 'asphalt' | 'low-grip' | 'wet' | 'gravel';

/** Camera mode */
export type CameraMode = 'follow' | 'fixed' | 'top-down';

/** Transmission mode */
export type TransmissionMode = 'automatic' | 'manual';

/** Vehicle status indicator */
export type VehicleStatus =
  | 'normal'
  | 'understeer'
  | 'oversteer'
  | 'traction-limited'
  | 'wheel-lock'
  | 'stability-intervention';

/** Test mode */
export type TestMode = 'free' | 'acceleration' | 'skidpad' | 'circuit';

/** Complete vehicle configuration parameters */
export interface VehicleParams {
  // Powertrain
  peakPower: number;           // kW
  peakTorque: number;          // Nm
  redlineRpm: number;          // RPM
  gearRatios: number[];        // Gear ratios (1st, 2nd, ...)
  finalDriveRatio: number;     // Final drive ratio
  drivetrain: DrivetrainType;  // FWD, RWD, AWD
  drivetrainEfficiency: number; // 0-1

  // Chassis
  mass: number;                // kg
  weightDistribution: number;  // Front % (0-1)
  wheelbase: number;           // m
  cgHeight: number;            // m
  yawInertia: number;          // kg*m^2 (calculated if not provided)

  // Tires
  tireCompound: TireCompound;
  frictionCoefficient: number; // Base mu
  frontGripBias: number;       // Front/rear grip balance (0-1)
  corneringStiffness: number;  // N/rad per tire

  // Aerodynamics
  dragCoefficient: number;     // Cd
  frontalArea: number;         // m^2
  downforceCoefficient: number; // Cl (negative = downforce)
  aeroBalance: number;         // Front % of downforce (0-1)

  // Braking & Steering
  maxBrakeForce: number;       // N per wheel
  brakeBias: number;           // Front % (0-1)
  maxSteerAngle: number;       // rad
  steerRate: number;           // rad/s

  // Transmission
  transmissionMode: TransmissionMode;
  shiftUpRpm: number;          // RPM
  shiftDownRpm: number;        // RPM

  // Driver aids
  tractionControl: boolean;
  stabilityControl: boolean;
  tcSlipThreshold: number;     // Longitudinal slip ratio
  scYawRateThreshold: number;  // rad/s
}

/** Runtime vehicle state (updated each physics step) */
export interface VehicleState {
  // Position & orientation
  x: number;           // m
  y: number;           // m
  heading: number;     // rad (yaw angle, 0 = +X)
  yawRate: number;     // rad/s

  // Velocities in body frame
  vx: number;          // m/s (longitudinal, +forward)
  vy: number;          // m/s (lateral, +left)

  // Wheel state
  wheelOmega: number[]; // rad/s per wheel [FL, FR, RL, RR]
  wheelSlip: number[];  // Longitudinal slip ratio per wheel

  // Tire forces
  frontSlipAngle: number;  // rad
  rearSlipAngle: number;   // rad
  frontLateralForce: number; // N
  rearLateralForce: number;  // N

  // Loads
  frontLoad: number;     // N
  rearLoad: number;      // N
  frontLeftLoad: number; // N
  frontRightLoad: number; // N
  rearLeftLoad: number;  // N
  rearRightLoad: number; // N

  // Powertrain
  engineRpm: number;     // RPM
  currentGear: number;   // 0 = neutral, 1 = 1st, etc.
  throttle: number;      // 0-1
  brake: number;         // 0-1
  steeringInput: number; // -1 to 1
  handbrake: boolean;

  // Derived
  speed: number;         // m/s (magnitude of velocity)
  speedKph: number;      // km/h
  longitudinalAccel: number; // m/s^2
  lateralAccel: number;  // m/s^2
  longitudinalG: number; // g
  lateralG: number;      // g

  // Status
  status: VehicleStatus;
  tcActive: boolean;
  scActive: boolean;
}

/** Player input state */
export interface Inputs {
  throttle: number;      // 0-1
  brake: number;         // 0-1
  steer: number;         // -1 to 1
  handbrake: boolean;
  shiftUp: boolean;
  shiftDown: boolean;
  reset: boolean;
  cameraCycle: boolean;
  pause: boolean;
}

/** Single telemetry sample for ring buffer */
export interface TelemetrySample {
  timestamp: number;     // ms
  speedKph: number;
  rpm: number;
  gear: number;
  throttle: number;
  brake: number;
  steerAngle: number;    // deg
  longitudinalG: number;
  lateralG: number;
  yawRate: number;       // deg/s
  frontSlipAngle: number; // deg
  rearSlipAngle: number;  // deg
  frontGripUtil: number;  // 0-1
  rearGripUtil: number;   // 0-1
  powerOutput: number;    // kW
  surfaceType: SurfaceType;
}

/** Track definition */
export interface TrackDef {
  id: string;
  name: string;
  description: string;
  // Track geometry
  centerline: { x: number; y: number }[]; // Center points
  width: number;           // Track width (m)
  surfaces: SurfaceZone[]; // Surface zones
  // Checkpoints for tests
  checkpoints: Checkpoint[];
  // Start position
  startPos: { x: number; y: number; heading: number };
  // Visual bounds
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
}

/** Surface zone on track */
export interface SurfaceZone {
  type: SurfaceType;
  frictionMultiplier: number;
  // Polygon or circle zone
  shape: 'circle' | 'rect' | 'polygon';
  center?: { x: number; y: number };
  radius?: number;
  rect?: { x: number; y: number; w: number; h: number };
  polygon?: { x: number; y: number }[];
}

/** Checkpoint for ordered crossing */
export interface Checkpoint {
  id: number;
  position: { x: number; y: number };
  radius: number;
  direction?: { x: number; y: number }; // Required crossing direction
}

/** Test result */
export interface TestResult {
  testId: 'free' | 'acceleration' | 'skidpad' | 'circuit';
  timestamp: number;
  vehicleConfig: VehicleParams;
  // Acceleration test
  time0to100?: number;      // s
  time0to200?: number;      // s
  brakingDistance100to0?: number; // m
  maxSpeed?: number;        // km/h
  // Skidpad test
  maxLateralG?: number;
  avgLateralG?: number;
  steadyStateSpeed?: number; // km/h
  // Circuit test
  lapTime?: number;         // s
  bestLapTime?: number;     // s
  offTrackCount?: number;
  avgSpeed?: number;        // km/h
  peakLateralG?: number;
}

/** Saved game data */
export interface SavedGame {
  version: number;
  currentVehicle: VehicleParams;
  presets: { name: string; params: VehicleParams }[];
  records: TestResult[];
  settings: GameSettings;
}

/** Game settings */
export interface GameSettings {
  units: 'metric' | 'imperial';
  cameraMode: CameraMode;
  showTelemetry: boolean;
  showHud: boolean;
  masterVolume: number;
  graphicsQuality: 'low' | 'medium' | 'high';
}

/** Physics constants */
export const PHYSICS_CONSTANTS = {
  GRAVITY: 9.81,           // m/s^2
  AIR_DENSITY: 1.225,      // kg/m^3
  FIXED_TIMESTEP: 1 / 60,  // s (60 Hz physics)
  MAX_SUBSTEPS: 4,
  WHEEL_RADIUS: 0.33,      // m (typical 225/45R17)
  WHEEL_INERTIA: 1.5,      // kg*m^2 per wheel
} as const;

/** Tire compound presets */
export const TIRE_COMPOUNDS: Record<TireCompound, {
  name: string;
  frictionCoefficient: number;
  corneringStiffness: number; // N/rad
  loadSensitivity: number;    // How much grip drops with load
}> = {
  economy: { name: 'Economy', frictionCoefficient: 0.85, corneringStiffness: 45000, loadSensitivity: 0.15 },
  touring: { name: 'Touring', frictionCoefficient: 0.95, corneringStiffness: 55000, loadSensitivity: 0.12 },
  sport: { name: 'Sport', frictionCoefficient: 1.05, corneringStiffness: 70000, loadSensitivity: 0.10 },
  racing: { name: 'Racing', frictionCoefficient: 1.20, corneringStiffness: 90000, loadSensitivity: 0.08 },
};

/** Default vehicle configuration */
export const DEFAULT_VEHICLE: VehicleParams = {
  peakPower: 200,           // kW (~268 hp)
  peakTorque: 400,          // Nm
  redlineRpm: 7000,
  gearRatios: [3.5, 2.2, 1.5, 1.1, 0.9, 0.75],
  finalDriveRatio: 3.7,
  drivetrain: 'RWD',
  drivetrainEfficiency: 0.92,
  mass: 1450,
  weightDistribution: 0.52,
  wheelbase: 2.7,
  cgHeight: 0.5,
  yawInertia: 0, // Calculated
  tireCompound: 'sport',
  frictionCoefficient: 1.05,
  frontGripBias: 0.52,
  corneringStiffness: 70000,
  dragCoefficient: 0.32,
  frontalArea: 2.2,
  downforceCoefficient: -0.1,
  aeroBalance: 0.5,
  maxBrakeForce: 8000,
  brakeBias: 0.65,
  maxSteerAngle: 0.6, // ~34 deg
  steerRate: 3.0,
  transmissionMode: 'automatic',
  shiftUpRpm: 6500,
  shiftDownRpm: 3000,
  tractionControl: true,
  stabilityControl: true,
  tcSlipThreshold: 0.15,
  scYawRateThreshold: 0.8,
};

/** Preset configurations demonstrating trade-offs */
export const PRESETS: { name: string; params: VehicleParams }[] = [
  {
    name: 'Balanced',
    params: { ...DEFAULT_VEHICLE },
  },
  {
    name: 'Drift Missile',
    params: {
      ...DEFAULT_VEHICLE,
      peakPower: 350,
      peakTorque: 550,
      mass: 1300,
      weightDistribution: 0.48,
      cgHeight: 0.55,
      tireCompound: 'sport',
      frictionCoefficient: 1.0,
      frontGripBias: 0.55,
      downforceCoefficient: -0.05,
      maxBrakeForce: 7000,
      brakeBias: 0.6,
      tractionControl: false,
      stabilityControl: false,
    },
  },
  {
    name: 'Grip Monster',
    params: {
      ...DEFAULT_VEHICLE,
      peakPower: 250,
      peakTorque: 450,
      mass: 1550,
      weightDistribution: 0.5,
      cgHeight: 0.45,
      tireCompound: 'racing',
      frictionCoefficient: 1.2,
      frontGripBias: 0.5,
      corneringStiffness: 90000,
      dragCoefficient: 0.45,
      frontalArea: 2.4,
      downforceCoefficient: -1.2,
      aeroBalance: 0.52,
      maxBrakeForce: 10000,
      brakeBias: 0.68,
      tractionControl: true,
      stabilityControl: true,
    },
  },
];

/** Unit conversion helpers */
export const UNITS = {
  msToKph: (ms: number) => ms * 3.6,
  kphToMs: (kph: number) => kph / 3.6,
  radToDeg: (rad: number) => rad * (180 / Math.PI),
  degToRad: (deg: number) => deg * (Math.PI / 180),
  nmToLbft: (nm: number) => nm * 0.73756,
  kwToHp: (kw: number) => kw * 1.34102,
  mToFt: (m: number) => m * 3.28084,
  kgToLb: (kg: number) => kg * 2.20462,
} as const;