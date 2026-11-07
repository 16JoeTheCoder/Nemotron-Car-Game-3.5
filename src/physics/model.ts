import type {
  CarStatus,
  EngineInternals,
  Inputs,
  Surface,
  TelemetrySample,
  VehicleParams,
  VehicleState,
} from '../types';

/** Physical constants (SI). */
export const G = 9.81;
export const RHO_AIR = 1.225; // kg/m^3
export const CRR = 0.012; // rolling resistance coefficient
export const FIXED_DT = 1 / 60; // s, fixed physics timestep
export const MAX_SUBSTEPS = 4; // catch-up cap per frame
export const SPEED_FLOOR = 0.3; // m/s, keeps slip-angle math stable near zero
export const KINEMATIC_SPEED = 0.15; // m/s, below this steering is kinematic
export const TRACK_WIDTH = 1.5; // m, used for lateral load-transfer approx

/** Tire compound multipliers: [corneringStiffness scale, friction scale]. */
const COMPOUND: Record<string, [number, number]> = {
  economy: [0.8, 0.8],
  touring: [1.0, 0.9],
  sport: [1.2, 1.0],
  racing: [1.5, 1.1],
};

const SURFACE_MU: Record<Surface, number> = {
  asphalt: 1.0,
  lowGrip: 0.5,
  concrete: 1.05,
};

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function sign(v: number): number {
  return v >= 0 ? 1 : -1;
}

/** Sensible default setup that drives well out of the box. */
export const defaultParams: VehicleParams = {
  mass: 1400,
  weightDistributionFront: 0.55,
  wheelbase: 2.7,
  cogHeight: 0.5,
  yawInertia: 0, // filled in by engine if 0
  peakPowerKw: 200,
  peakTorqueNm: 350,
  redlineRpm: 7000,
  gearRatios: [3.5, 2.1, 1.4, 1.0, 0.8],
  finalDrive: 3.8,
  drivetrainEfficiency: 0.9,
  drivetrain: 'RWD',
  transmission: 'auto',
  tireCompound: 'sport',
  frictionCoefficient: 0.9,
  gripBalanceFront: 0.5,
  corneringStiffness: 50000,
  cd: 0.32,
  frontalArea: 2.1,
  downforceCoefficient: 1.5,
  aeroBalanceFront: 0.4,
  maxBrakeForce: 9000,
  brakeBiasFront: 0.6,
  maxSteerAngle: 0.6,
  steerRate: 2.5,
  wheelRadius: 0.33,
};

/**
 * Dynamic bicycle model with longitudinal/lateral motion, yaw rate, and a
 * driven-axle wheel-inertia model for wheel spin / traction limiting.
 * All SI units. Deterministic given the same inputs and timestep.
 */
export class PhysicsEngine {
  private p: VehicleParams;
  private s: VehicleState;
  private internals: EngineInternals;
  private prevAx = 0;
  private prevReset = false;

  constructor(params: Partial<VehicleParams> = {}) {
    this.p = { ...defaultParams, ...params };
    if (this.p.yawInertia === 0) {
      const w = TRACK_WIDTH;
      const L = this.p.wheelbase;
      this.p.yawInertia = (this.p.mass * (L * L + w * w)) / 12;
    }
    this.s = this.resetState();
    this.internals = this.emptyInternals();
  }

  private resetState(): VehicleState {
    return {
      x: 0,
      y: 0,
      psi: 0,
      vx: 0,
      vy: 0,
      r: 0,
      wheelOmega: 0,
      gear: 1,
      rpm: 0,
      throttle: 0,
      brake: 0,
      steering: 0,
      steerAngle: 0,
      surface: 'asphalt',
      ax: 0,
      ay: 0,
    };
  }

  private emptyInternals(): EngineInternals {
    return {
      ax: 0,
      ay: 0,
      alphaF: 0,
      alphaR: 0,
      Fyf: 0,
      Fyr: 0,
      FxDrive: 0,
      FxBrake: 0,
      Fzf: 0,
      Fzr: 0,
      mu: 0,
      gripUtil: 0,
      status: 'normal',
    };
  }

  /** Set / change vehicle parameters mid-drive (garage). Safe at any speed. */
  setParams(params: Partial<VehicleParams>): void {
    this.p = { ...this.p, ...params };
    if (this.p.yawInertia === 0) {
      const w = TRACK_WIDTH;
      const L = this.p.wheelbase;
      this.p.yawInertia = (this.p.mass * (L * L + w * w)) / 12;
    }
    this.s.gear = clamp(this.s.gear, 1, this.p.gearRatios.length);
  }

  /** Advance the physics by `dt` seconds using fixed sub-steps. */
  step(inputs: Inputs, dt: number): VehicleState {
    this.s.throttle = clamp(inputs.throttle, 0, 1);
    this.s.brake = clamp(inputs.brake, 0, 1);
    const steerTarget = clamp(inputs.steer, -1, 1);
    const handbrake = inputs.handbrake;

    if (inputs.reset && !this.prevReset) {
      this.s = this.resetState();
      this.internals = this.emptyInternals();
      this.prevAx = 0;
    }
    this.prevReset = inputs.reset;

    let remaining = dt;
    let steps = 0;
    while (remaining > 1e-6 && steps < MAX_SUBSTEPS) {
      const h = Math.min(remaining, FIXED_DT);
      this.subStep(steerTarget, handbrake, h);
      remaining -= h;
      steps += 1;
    }
    if (remaining > 1e-6) {
      // Frame ran slow: bounded leftover step so the sim slows down rather
      // than spiraling into an unbounded catch-up loop.
      this.subStep(steerTarget, handbrake, remaining);
    }
    this.s.steering = steerTarget;
    return this.s;
  }

  private subStep(steerTarget: number, handbrake: boolean, h: number): void {
    const p = this.p;
    const s = this.s;

    // ---- Steering (rate limited) ----
    const targetAngle = steerTarget * p.maxSteerAngle;
    const angleDiff = targetAngle - s.steerAngle;
    const maxStep = p.steerRate * h;
    s.steerAngle += clamp(angleDiff, -maxStep, maxStep);

    // ---- Gear / transmission ----
    this.updateGear(s);

    const gearRatio =
      s.gear >= 1 && s.gear <= p.gearRatios.length
        ? p.gearRatios[s.gear - 1]
        : 0;
    const totalRatio = gearRatio * p.finalDrive;

    // ---- Longitudinal load transfer uses previous-step longitudinal accel ----
    const axPrev = this.prevAx;

    // ---- Normal loads (static + aero + longitudinal transfer) ----
    const L = p.wheelbase;
    const a = L * (1 - p.weightDistributionFront); // CG to front axle
    const b = L * p.weightDistributionFront; // CG to rear axle
    const speed = Math.hypot(s.vx, s.vy);
    const vxEff =
      Math.abs(s.vx) < SPEED_FLOOR ? sign(s.vx) * SPEED_FLOOR : s.vx;

    const downforce = p.downforceCoefficient * speed * speed;
    const dfFront = downforce * p.aeroBalanceFront;
    const dfRear = downforce * (1 - p.aeroBalanceFront);

    const FzfStatic = (p.mass * G * b) / L + dfFront;
    const FzrStatic = (p.mass * G * a) / L + dfRear;
    const dFzLong = (p.mass * axPrev * p.cogHeight) / L;
    let Fzf = FzfStatic - dFzLong;
    let Fzr = FzrStatic + dFzLong;
    Fzf = Math.max(Fzf, 50);
    Fzr = Math.max(Fzr, 50);
    this.internals.Fzf = Fzf;
    this.internals.Fzr = Fzr;

    // ---- Effective friction (tire compound x surface) ----
    const [stiffScale, muScale] = COMPOUND[p.tireCompound] ?? COMPOUND.sport;
    const mu = p.frictionCoefficient * muScale * SURFACE_MU[s.surface];
    this.internals.mu = mu;

    // ---- Slip angles (bicycle model) ----
    const alphaF = Math.atan2(s.vy + a * s.r, vxEff) - s.steerAngle;
    const alphaR = Math.atan2(s.vy - b * s.r, vxEff);
    this.internals.alphaF = alphaF;
    this.internals.alphaR = alphaR;

    // ---- Drivetrain / engine ----
    const [FxDrive, tractionLimited, wheelOmega] = this.driveForce(
      s,
      p,
      Fzf,
      Fzr,
      totalRatio,
      h,
    );
    s.wheelOmega = wheelOmega;
    this.internals.FxDrive = FxDrive;

    // ---- Braking ----
    let FxBrake = 0;
    let wheelLock = false;
    if (s.brake > 0.02 || handbrake) {
      const brakePedal = handbrake ? 1 : s.brake;
      const total = brakePedal * p.maxBrakeForce;
      const dir =
        Math.abs(s.vx) > 0.05 ? sign(s.vx) : 1; // oppose motion
      const frontShare = total * p.brakeBiasFront;
      const rearShare = total * (1 - p.brakeBiasFront);
      const frontLimit = mu * Fzf;
      const rearLimit = mu * Fzr;
      // Braking opposes motion: apply force in -dir.
      const fF = clamp(-dir * frontShare, -frontLimit, frontLimit);
      const rF = clamp(-dir * rearShare, -rearLimit, rearLimit);
      FxBrake = fF + rF;
      wheelLock =
        Math.abs(frontShare) > frontLimit * 0.95 ||
        Math.abs(rearShare) > rearLimit * 0.95;
    }
    this.internals.FxBrake = FxBrake;

    // ---- Aerodynamic drag & rolling resistance (oppose velocity) ----
    let FdX = 0,
      FdY = 0,
      FrrX = 0,
      FrrY = 0;
    if (speed > 0.01) {
      const Fd = 0.5 * RHO_AIR * p.cd * p.frontalArea * speed * speed;
      FdX = (-Fd * s.vx) / speed;
      FdY = (-Fd * s.vy) / speed;
      const Frr = CRR * p.mass * G;
      FrrX = (-Frr * s.vx) / speed;
      FrrY = (-Frr * s.vy) / speed;
    }

    // ---- Lateral tire forces with combined-slip friction circle ----
    const Cf = p.corneringStiffness * stiffScale * p.gripBalanceFront;
    const Cr = p.corneringStiffness * stiffScale * (1 - p.gripBalanceFront);
    let FyfRaw = -Cf * alphaF;
    let FyrRaw = -Cr * alphaR;

    const driveShare =
      p.drivetrain === 'FWD'
        ? Fzf
        : p.drivetrain === 'RWD'
          ? Fzr
          : (Fzf + Fzr) / 2;
    const FxUsed = Math.abs(FxDrive) + Math.abs(FxBrake);

    const latBudgetF = Math.sqrt(
      Math.max(0, (mu * Fzf) ** 2 - (FxUsed / 2) ** 2),
    );
    const latBudgetR = Math.sqrt(
      Math.max(0, (mu * Fzr) ** 2 - (FxUsed / 2) ** 2),
    );
    const Fyf = clamp(FyfRaw, -latBudgetF, latBudgetF);
    const Fyr = clamp(FyrRaw, -latBudgetR, latBudgetR);
    this.internals.Fyf = Fyf;
    this.internals.Fyr = Fyr;

    // ---- Equations of motion (body frame) ----
    const FxTotal = FxDrive + FxBrake + FdX + FrrX;
    const FyTotal = Fyf + Fyr + FdY + FrrY;

    const dvx = FxTotal / p.mass + s.r * s.vy;
    const dvy = FyTotal / p.mass - s.r * s.vx;
    const dr = (a * Fyf - b * Fyr) / p.yawInertia;

    this.prevAx = dvx;
    s.ax = dvx;
    s.ay = dvy;

    // ---- Integrate (semi-implicit Euler) ----
    s.vx += dvx * h;
    s.vy += dvy * h;
    s.r += dr * h;

    // Near-zero speed: kinematic damping keeps the model from wandering.
    if (Math.abs(s.vx) < KINEMATIC_SPEED && Math.abs(s.vy) < KINEMATIC_SPEED) {
      s.vx *= 0.9;
      s.vy *= 0.9;
      s.r *= 0.9;
    }

    s.psi += s.r * h;
    const psi = s.psi;
    s.x += (s.vx * Math.cos(psi) - s.vy * Math.sin(psi)) * h;
    s.y += (s.vx * Math.sin(psi) + s.vy * Math.cos(psi)) * h;

    // ---- Engine RPM from driven wheel speed ----
    const engineOmega = s.wheelOmega * totalRatio;
    s.rpm = Math.abs(engineOmega) * (60 / (2 * Math.PI));

    // ---- Telemetry derived values ----
    const FxDriveLimit = mu * driveShare;
    const FxBrakeLimit = mu * (Fzf + Fzr);
    const gripUtil = Math.max(
      Math.abs(Fyf) / Math.max(1, mu * Fzf),
      Math.abs(Fyr) / Math.max(1, mu * Fzr),
      Math.abs(FxDrive) / Math.max(1, FxDriveLimit),
      Math.abs(FxBrake) / Math.max(1, FxBrakeLimit),
    );
    this.internals.gripUtil = clamp(gripUtil, 0, 1);
    this.internals.status = this.determineStatus(
      alphaF,
      alphaR,
      tractionLimited,
      wheelLock,
      steerTarget,
    );
  }

  /**
   * Drive force for the driven axle(s) with a driven-wheel inertia model.
   * Returns [force, tractionLimited, newWheelOmega].
   */
  private driveForce(
    s: VehicleState,
    p: VehicleParams,
    Fzf: number,
    Fzr: number,
    totalRatio: number,
    h: number,
  ): [number, boolean, number] {
    const throttle = s.throttle;
    if (throttle < 0.02) {
      // No drive demand: wheel rolls with the road.
      return [0, false, s.vx / p.wheelRadius];
    }

    // Reverse when nearly stopped, brake held, and throttle applied.
    const reverse = s.brake > 0.6 && Math.abs(s.vx) < 1.0 && throttle > 0.2;
    const dir = reverse ? -1 : 1;
    const torqueScale = reverse ? 0.4 : 1.0;

    // Engine torque curve: flat peak torque to torquePeakRpm, then constant power.
    const torquePeakRpm = p.redlineRpm * 0.5;
    let engineTorque = p.peakTorqueNm;
    const rpm = Math.abs(s.wheelOmega * totalRatio) * (60 / (2 * Math.PI));
    if (rpm > torquePeakRpm) {
      engineTorque = p.peakTorqueNm * (torquePeakRpm / Math.max(rpm, 1));
    }
    engineTorque *= throttle * torqueScale * p.drivetrainEfficiency;

    const axleTorque = engineTorque * totalRatio; // N m at driven wheels
    const desiredForce = axleTorque / p.wheelRadius;

    // Driven normal load.
    let FzDriven: number;
    if (p.drivetrain === 'FWD') FzDriven = Fzf;
    else if (p.drivetrain === 'RWD') FzDriven = Fzr;
    else FzDriven = (Fzf + Fzr) / 2;
    const [, compoundMu] = COMPOUND[p.tireCompound] ?? COMPOUND.sport;
    const tractionLimit =
      p.frictionCoefficient *
      compoundMu *
      SURFACE_MU[s.surface] *
      FzDriven;

    let tractionLimited = false;
    let omega = s.wheelOmega;
    const actualForce = clamp(dir * desiredForce, 0, tractionLimit) * dir;
    if (Math.abs(desiredForce) > tractionLimit) {
      tractionLimited = true;
      // Excess torque spins the driven wheel: integrate wheel inertia.
      const tauNet = axleTorque - Math.abs(actualForce) * p.wheelRadius;
      omega += (tauNet * dir) * h / 1.0; // I_wheel = 1 kg m^2 (driven axle eq.)
      omega = clamp(omega, -800, 800);
    } else {
      // Rolling without slip: wheel speed matches road speed.
      omega = s.vx / p.wheelRadius;
    }
    return [actualForce, tractionLimited, omega];
  }

  private updateGear(s: VehicleState): void {
    const p = this.p;
    const maxGear = p.gearRatios.length;
    if (p.transmission === 'auto') {
      const rpm = s.rpm;
      if (rpm > p.redlineRpm * 0.97 && s.gear < maxGear) {
        s.gear += 1;
      } else if (rpm < 1300 && s.gear > 1 && Math.abs(s.vx) > 1.5) {
        s.gear -= 1;
      }
    }
  }

  /** UI-triggered manual gear change (Q/E). Safe at any speed. */
  setGear(gear: number): void {
    const maxGear = this.p.gearRatios.length;
    this.s.gear = clamp(gear, 1, maxGear);
    // On a shift, decouple wheel speed briefly (clutch) to avoid jerk.
    this.s.wheelOmega = this.s.vx / this.p.wheelRadius;
  }

  private determineStatus(
    alphaF: number,
    alphaR: number,
    tractionLimited: boolean,
    wheelLock: boolean,
    steering: number,
  ): CarStatus {
    if (wheelLock) return 'wheelLock';
    if (tractionLimited && Math.abs(steering) > 0.15) return 'tractionLimited';
    const af = Math.abs(alphaF);
    const ar = Math.abs(alphaR);
    if (af > 0 && ar > 0) {
      if (ar > af * 1.25) return 'oversteer';
      if (af > ar * 1.25) return 'understeer';
    }
    if (tractionLimited) return 'tractionLimited';
    return 'normal';
  }

  getState(): VehicleState {
    return { ...this.s };
  }

  getInternals(): EngineInternals {
    return { ...this.internals };
  }

  getParams(): VehicleParams {
    return { ...this.p };
  }

  setSurface(surface: Surface): void {
    this.s.surface = surface;
  }

  telemetrySample(t: number): TelemetrySample {
    const s = this.s;
    const p = this.p;
    const speedKmh = Math.hypot(s.vx, s.vy) * 3.6;
    const engineOmega = s.wheelOmega * (s.gear >= 1 && s.gear <= p.gearRatios.length ? p.gearRatios[s.gear - 1] * p.finalDrive : 0);
    const engineTorque = (this.internals.FxDrive * p.wheelRadius) /
      (engineOmega === 0 ? 1 : engineOmega) * p.drivetrainEfficiency;
    const powerKw = Math.max(0, (engineOmega * engineTorque) / 1000);
    return {
      t,
      speedKmh,
      rpm: s.rpm,
      gear: s.gear,
      throttle: s.throttle,
      brake: s.brake,
      steer: s.steering,
      axG: s.ax / G,
      ayG: s.ay / G,
      yawRateDeg: (s.r * 180) / Math.PI,
      alphaF: (this.internals.alphaF * 180) / Math.PI,
      alphaR: (this.internals.alphaR * 180) / Math.PI,
      gripUtil: this.internals.gripUtil,
      powerKw,
      surface: s.surface,
      status: this.internals.status,
    };
  }
}
