// Vehicle Physics Engine
// Dynamic bicycle model with load transfer, tire saturation, and drivetrain

import type {
  VehicleParams,
  VehicleState,
  Inputs,
  SurfaceType,
  VehicleStatus,
} from '../types';
import { PHYSICS_CONSTANTS } from '../types';

/** Internal physics state (more detailed than VehicleState) */
export interface PhysicsState {
  // Position & orientation
  x: number;
  y: number;
  heading: number;
  yawRate: number;

  // Body velocities
  vx: number;
  vy: number;

  // Wheel speeds (rad/s) [FL, FR, RL, RR]
  wheelOmega: number[];

  // Engine
  engineRpm: number;
  currentGear: number;
  clutchSlip: number;

  // Previous accelerations for integration
  prevAx: number;
  prevAy: number;
  prevYawAccel: number;
}

/** Calculate yaw inertia from vehicle parameters */
export function calculateYawInertia(params: VehicleParams): number {
  // Approximate as rectangular mass distribution
  const { mass, wheelbase, weightDistribution, cgHeight } = params;
  const lf = wheelbase * (1 - weightDistribution);
  const lr = wheelbase * weightDistribution;
  // Izz ≈ m * (lf^2 + lr^2) / 12 + m * cgHeight^2 (simplified)
  return mass * (lf * lf + lr * lr) / 12 + mass * cgHeight * cgHeight * 0.5;
}

/** Engine torque curve (simplified) */
function engineTorque(rpm: number, params: VehicleParams): number {
  const { peakTorque, peakPower, redlineRpm } = params;
  const maxPowerRpm = redlineRpm * 0.85; // Peak power typically at 85% redline

  if (rpm <= 0) return 0;
  if (rpm >= redlineRpm) return 0;

  // Simple piecewise curve: flat torque to peak power RPM, then power-limited
  const torqueAtMaxPower = (peakPower * 1000) / (maxPowerRpm * 2 * Math.PI / 60);

  if (rpm <= maxPowerRpm) {
    // Flat torque region with slight rise
    return peakTorque * (0.8 + 0.2 * (rpm / maxPowerRpm));
  } else {
    // Power-limited region: torque drops to maintain constant power
    return Math.max(0, torqueAtMaxPower * (maxPowerRpm / rpm));
  }
}


/** Calculate slip ratios for each wheel */
function calculateSlipRatios(
  wheelOmega: number[],
  vehicleVx: number,
  yawRate: number
): number[] {
  const r = PHYSICS_CONSTANTS.WHEEL_RADIUS;
  const trackWidth = 1.6;
  const hw = trackWidth / 2;

  const slips: number[] = [];

  for (let i = 0; i < 4; i++) {
    let vxWheel: number;
    if (i === 0) vxWheel = vehicleVx - yawRate * hw; // FL
    else if (i === 1) vxWheel = vehicleVx + yawRate * hw; // FR
    else if (i === 2) vxWheel = vehicleVx - yawRate * hw; // RL
    else vxWheel = vehicleVx + yawRate * hw; // RR

    const wheelSpeed = wheelOmega[i] * r;

    // Slip ratio = (wheelSpeed - vxWheel) / max(|wheelSpeed|, |vxWheel|, 1)
    const denom = Math.max(Math.abs(wheelSpeed), Math.abs(vxWheel), 0.5);
    let slip = 0;
    if (denom > 0.01) {
      slip = (wheelSpeed - vxWheel) / denom;
    }
    slips.push(Math.max(-1, Math.min(1, slip)));
  }

  return slips;
}

/** Pacejka-like tire model (simplified) */
function tireForce(
  slip: number,
  load: number,
  frictionCoeff: number,
  corneringStiffness: number,
  isLateral: boolean
): number {
  if (load <= 0) return 0;

  const mu = frictionCoeff;
  const maxForce = mu * load;

  if (isLateral) {
    // Lateral force: Fy = D * sin(C * arctan(B * slip - E * (B * slip - arctan(B * slip))))
    // Simplified: linear region then saturation
    const rawForce = corneringStiffness * slip;
    // Smooth saturation using arctan
    return maxForce * Math.tanh(rawForce / maxForce);
  } else {
    // Longitudinal force: similar but with different shape
    const rawForce = corneringStiffness * 0.3 * slip; // Longitudinal stiffness ~30% of lateral
    return maxForce * Math.tanh(rawForce / maxForce);
  }
}

/** Combined slip (friction circle) */
function combineForces(fx: number, fy: number, maxForce: number): { fx: number; fy: number } {
  const total = Math.hypot(fx, fy);
  if (total <= maxForce || total === 0) return { fx, fy };
  const scale = maxForce / total;
  return { fx: fx * scale, fy: fy * scale };
}

/** Calculate load transfer */
function calculateLoads(
  params: VehicleParams,
  ax: number,
  ay: number,
  speed: number
): { fl: number; fr: number; rl: number; rr: number; front: number; rear: number } {
  const { mass, weightDistribution, wheelbase, cgHeight } = params;
  const g = PHYSICS_CONSTANTS.GRAVITY;
  const trackWidth = 1.6;

  // Static loads
  const staticFront = mass * g * (1 - weightDistribution);
  const staticRear = mass * g * weightDistribution;

  // Longitudinal load transfer
  const longTransfer = (mass * ax * cgHeight) / wheelbase;

  // Lateral load transfer (front and rear)
  const latTransferFront = (mass * ay * cgHeight * (1 - weightDistribution)) / trackWidth;
  const latTransferRear = (mass * ay * cgHeight * weightDistribution) / trackWidth;

  // Aerodynamic load (downforce)
  const aeroLoad = 0.5 * PHYSICS_CONSTANTS.AIR_DENSITY *
    params.dragCoefficient * params.frontalArea * speed * speed *
    Math.abs(params.downforceCoefficient);
  const aeroFront = aeroLoad * params.aeroBalance;
  const aeroRear = aeroLoad * (1 - params.aeroBalance);

  const frontLoad = staticFront - longTransfer + aeroFront;
  const rearLoad = staticRear + longTransfer + aeroRear;

  const fl = frontLoad / 2 - latTransferFront;
  const fr = frontLoad / 2 + latTransferFront;
  const rl = rearLoad / 2 - latTransferRear;
  const rr = rearLoad / 2 + latTransferRear;

  return { fl, fr, rl, rr, front: frontLoad, rear: rearLoad };
}

/** Main physics step */
export function physicsStep(
  state: PhysicsState,
  params: VehicleParams,
  inputs: Inputs,
  surfaceType: SurfaceType,
  dt: number
): PhysicsState {
  const { mass, wheelbase, weightDistribution, drivetrain, drivetrainEfficiency } = params;
  const g = PHYSICS_CONSTANTS.GRAVITY;
  const r = PHYSICS_CONSTANTS.WHEEL_RADIUS;
  const wheelInertia = PHYSICS_CONSTANTS.WHEEL_INERTIA;

  // Surface friction multiplier
  const surfaceMult = surfaceType === 'asphalt' ? 1.0 :
                      surfaceType === 'low-grip' ? 0.6 :
                      surfaceType === 'wet' ? 0.5 : 0.4;

  const frictionCoeff = params.frictionCoefficient * surfaceMult;
  const corneringStiffness = params.corneringStiffness * surfaceMult;

  // --- Steering ---
    const targetSteer = inputs.steer * params.maxSteerAngle;
    // We'll use a simple first-order response for steering
    // In a real implementation, this would be part of the state
    const steerAngle = targetSteer; // Simplified: instant steering

  // --- Drivetrain ---
  let engineTorqueNm = 0;
  let wheelTorques = [0, 0, 0, 0];
  let brakeForces = [0, 0, 0, 0];

  // Engine RPM from driven wheel speed
  let drivenWheelSpeed = 0;
  if (drivetrain === 'FWD') drivenWheelSpeed = (state.wheelOmega[0] + state.wheelOmega[1]) / 2;
  else if (drivetrain === 'RWD') drivenWheelSpeed = (state.wheelOmega[2] + state.wheelOmega[3]) / 2;
  else drivenWheelSpeed = (state.wheelOmega[0] + state.wheelOmega[1] + state.wheelOmega[2] + state.wheelOmega[3]) / 4;

  const gearRatio = state.currentGear > 0 ? params.gearRatios[state.currentGear - 1] * params.finalDriveRatio : 0;
  state.engineRpm = Math.max(0, drivenWheelSpeed * gearRatio * 60 / (2 * Math.PI));

  // Throttle input
  const throttle = Math.max(0, Math.min(1, inputs.throttle));
  const brake = Math.max(0, Math.min(1, inputs.brake));

  // Engine torque
    if (state.currentGear > 0 && throttle > 0) {
      // Use idle RPM for torque calculation when engine is starting (simulates starter motor/clutch)
      const idleRpm = 800;
      const effectiveRpm = state.engineRpm > idleRpm ? state.engineRpm : idleRpm;
      engineTorqueNm = engineTorque(effectiveRpm, params) * throttle * drivetrainEfficiency;
    }

  // Distribute torque to wheels based on drivetrain
  const driveTorque = engineTorqueNm * gearRatio;
  if (drivetrain === 'FWD') {
    wheelTorques[0] = driveTorque / 2;
    wheelTorques[1] = driveTorque / 2;
  } else if (drivetrain === 'RWD') {
    wheelTorques[2] = driveTorque / 2;
    wheelTorques[3] = driveTorque / 2;
  } else {
    wheelTorques[0] = driveTorque / 4;
    wheelTorques[1] = driveTorque / 4;
    wheelTorques[2] = driveTorque / 4;
    wheelTorques[3] = driveTorque / 4;
  }

  // Braking
  const maxBrake = params.maxBrakeForce;
  brakeForces[0] = maxBrake * brake * params.brakeBias;
  brakeForces[1] = maxBrake * brake * params.brakeBias;
  brakeForces[2] = maxBrake * brake * (1 - params.brakeBias);
  brakeForces[3] = maxBrake * brake * (1 - params.brakeBias);

  // Handbrake (rear only)
  if (inputs.handbrake) {
    brakeForces[2] = Math.max(brakeForces[2], maxBrake * 1.5);
    brakeForces[3] = Math.max(brakeForces[3], maxBrake * 1.5);
  }

  // --- Aerodynamics ---
  const speed = Math.hypot(state.vx, state.vy);
  const dragForce = 0.5 * PHYSICS_CONSTANTS.AIR_DENSITY *
    params.dragCoefficient * params.frontalArea * speed * speed;
    // Downforce is used in calculateLoads via params.downforceCoefficient
    // const downforce = 0.5 * PHYSICS_CONSTANTS.AIR_DENSITY *
    //   Math.abs(params.downforceCoefficient) * params.frontalArea * speed * speed;

    // --- Rolling resistance ---
  const rollingResistance = mass * g * 0.015; // Crr ≈ 0.015

  // --- Load calculation ---
  // Estimate accelerations for load transfer (use previous step)
  const loads = calculateLoads(params, state.prevAx, state.prevAy, speed);

  // --- Tire forces ---
  // Slip angles
  const lf = wheelbase * (1 - weightDistribution);
  const lr = wheelbase * weightDistribution;

  const frontSlipAngle = steerAngle - Math.atan2(state.vy + state.yawRate * lf, Math.max(0.1, Math.abs(state.vx)));
  const rearSlipAngle = -Math.atan2(state.vy - state.yawRate * lr, Math.max(0.1, Math.abs(state.vx)));

  // Slip ratios
    const slipRatios = calculateSlipRatios(state.wheelOmega, state.vx, state.yawRate);

  // Traction control
    if (params.tractionControl && throttle > 0) {
      const maxSlip = params.tcSlipThreshold;
      const avgDriveSlip = drivetrain === 'FWD' ? (slipRatios[0] + slipRatios[1]) / 2 :
                           drivetrain === 'RWD' ? (slipRatios[2] + slipRatios[3]) / 2 :
                           (slipRatios[0] + slipRatios[1] + slipRatios[2] + slipRatios[3]) / 4;
      if (avgDriveSlip > maxSlip) {
        // Reduce engine torque
        const reduction = Math.max(0.2, 1 - (avgDriveSlip - maxSlip) * 2);
        wheelTorques = wheelTorques.map(t => t * reduction);
      }
    }

    // Stability control
    if (params.stabilityControl) {
      const targetYawRate = state.vx * Math.tan(steerAngle) / wheelbase; // Simplified
      const yawError = state.yawRate - targetYawRate;
      if (Math.abs(yawError) > params.scYawRateThreshold) {
        // Apply corrective braking (simplified)
        if (yawError > 0) { // Oversteer - brake front outside
          brakeForces[1] += 2000;
        } else { // Understeer - brake rear inside
          brakeForces[2] += 1500;
        }
      }
    }

  // Calculate tire forces for each axle
  const frontLoad = loads.front;
  const rearLoad = loads.rear;

  // Front axle
  const frontFxRaw = tireForce(
    (slipRatios[0] + slipRatios[1]) / 2,
    frontLoad / 2,
    frictionCoeff * params.frontGripBias,
    corneringStiffness,
    false
  );
  const frontFyRaw = tireForce(
    frontSlipAngle,
    frontLoad / 2,
    frictionCoeff * params.frontGripBias,
    corneringStiffness,
    true
  );
  const frontMaxForce = frictionCoeff * params.frontGripBias * (frontLoad / 2);
  const frontCombined = combineForces(frontFxRaw, frontFyRaw, frontMaxForce);

  // Rear axle
  const rearFxRaw = tireForce(
    (slipRatios[2] + slipRatios[3]) / 2,
    rearLoad / 2,
    frictionCoeff * (1 - params.frontGripBias),
    corneringStiffness,
    false
  );
  const rearFyRaw = tireForce(
    rearSlipAngle,
    rearLoad / 2,
    frictionCoeff * (1 - params.frontGripBias),
    corneringStiffness,
    true
  );
  const rearMaxForce = frictionCoeff * (1 - params.frontGripBias) * (rearLoad / 2);
  const rearCombined = combineForces(rearFxRaw, rearFyRaw, rearMaxForce);

  // Total forces in body frame
  const fx = frontCombined.fx + rearCombined.fx - dragForce * Math.sign(state.vx) - rollingResistance * Math.sign(state.vx);
  const fy = frontCombined.fy + rearCombined.fy;
  const mz = frontCombined.fy * lf - rearCombined.fy * lr;

  // --- Integration (semi-implicit Euler) ---
  const ax = fx / mass;
  const ay = fy / mass;
  const yawAccel = mz / params.yawInertia;

  // Update velocities
  const newVx = state.vx + ax * dt;
  const newVy = state.vy + ay * dt;
  const newYawRate = state.yawRate + yawAccel * dt;

  // Update position
  const cosH = Math.cos(state.heading);
  const sinH = Math.sin(state.heading);
  const worldVx = newVx * cosH - newVy * sinH;
  const worldVy = newVx * sinH + newVy * cosH;
  const newX = state.x + worldVx * dt;
  const newY = state.y + worldVy * dt;
  const newHeading = state.heading + newYawRate * dt;

  // Update wheel speeds
  const newWheelOmega = [...state.wheelOmega];
  for (let i = 0; i < 4; i++) {
    const wheelTorque = wheelTorques[i] - brakeForces[i] * r;
    const wheelAlpha = wheelTorque / wheelInertia;
    newWheelOmega[i] = Math.max(0, state.wheelOmega[i] + wheelAlpha * dt);
  }

  // Gear shifting (automatic)
  let newGear = state.currentGear;
  if (params.transmissionMode === 'automatic' && state.currentGear > 0) {
    if (state.engineRpm > params.shiftUpRpm && state.currentGear < params.gearRatios.length) {
      newGear = state.currentGear + 1;
    } else if (state.engineRpm < params.shiftDownRpm && state.currentGear > 1) {
      newGear = state.currentGear - 1;
    }
  }

  // Manual shift
  if (params.transmissionMode === 'manual') {
    if (inputs.shiftUp && state.currentGear < params.gearRatios.length) {
      newGear = state.currentGear + 1;
    }
    if (inputs.shiftDown && state.currentGear > 1) {
      newGear = state.currentGear - 1;
    }
  }

  // Neutral at stop
  if (speed < 0.5 && state.currentGear === 1 && throttle === 0) {
    newGear = 0;
  }

  // --- Vehicle status ---
    // Grip utilization calculated but not used in PhysicsState (used in VehicleState instead)
    // const frontGripUtil = Math.hypot(frontCombined.fx, frontCombined.fy) / (frictionCoeff * params.frontGripBias * (frontLoad / 2) * 2);
    // const rearGripUtil = Math.hypot(rearCombined.fx, rearCombined.fy) / (frictionCoeff * (1 - params.frontGripBias) * (rearLoad / 2) * 2);

    // Status is computed but not used in PhysicsState (used in VehicleState instead)
    // let status: VehicleStatus = 'normal';
    // if (tcActive) status = 'traction-limited';
    // else if (scActive) status = 'stability-intervention';
    // else if (frontGripUtil > 0.9 && rearGripUtil < 0.7) status = 'understeer';
    // else if (rearGripUtil > 0.9 && frontGripUtil < 0.7) status = 'oversteer';
    // else if (Math.max(...slipRatios.map(Math.abs)) > 0.8 && brake > 0.5) status = 'wheel-lock';

    return {
      x: newX,
      y: newY,
      heading: newHeading,
      yawRate: newYawRate,
      vx: newVx,
      vy: newVy,
      wheelOmega: newWheelOmega,
      engineRpm: state.engineRpm,
      currentGear: newGear,
      clutchSlip: 0,
      prevAx: ax,
      prevAy: ay,
      prevYawAccel: yawAccel,
    };
}

/** Create initial physics state */
export function createInitialState(_params: VehicleParams): PhysicsState {
  return {
    x: 0,
    y: 0,
    heading: 0,
    yawRate: 0,
    vx: 0,
    vy: 0,
    wheelOmega: [0, 0, 0, 0],
    engineRpm: 0,
    currentGear: 1,
    clutchSlip: 0,
    prevAx: 0,
    prevAy: 0,
    prevYawAccel: 0,
  };
}

/** Convert physics state to vehicle state for UI */
export function physicsToVehicleState(
  physics: PhysicsState,
  params: VehicleParams,
  inputs: Inputs,
  _surfaceType: SurfaceType,
  status: VehicleStatus,
  tcActive: boolean,
  scActive: boolean
): VehicleState {
  const speed = Math.hypot(physics.vx, physics.vy);
  const loads = calculateLoads(params, physics.prevAx, physics.prevAy, speed);

  // Recalculate slip angles for display
  const lf = params.wheelbase * (1 - params.weightDistribution);
  const lr = params.wheelbase * params.weightDistribution;
  const frontSlipAngle = inputs.steer * params.maxSteerAngle - Math.atan2(physics.vy + physics.yawRate * lf, Math.max(0.1, Math.abs(physics.vx)));
  const rearSlipAngle = -Math.atan2(physics.vy - physics.yawRate * lr, Math.max(0.1, Math.abs(physics.vx)));

  // Slip ratios
    const slipRatios = calculateSlipRatios(physics.wheelOmega, physics.vx, physics.yawRate);

  // Grip utilization
      // const frictionCoeff = params.frictionCoefficient * (surfaceType === 'asphalt' ? 1.0 : surfaceType === 'low-grip' ? 0.6 : 0.5);
    // const frontMaxForce = frictionCoeff * params.frontGripBias * (loads.front / 2);
    // const rearMaxForce = frictionCoeff * (1 - params.frontGripBias) * (loads.rear / 2);

    // Estimate tire forces (simplified)
    const frontFy = params.corneringStiffness * frontSlipAngle;
    const rearFy = params.corneringStiffness * rearSlipAngle;

    return {
    x: physics.x,
    y: physics.y,
    heading: physics.heading,
    yawRate: physics.yawRate,
    vx: physics.vx,
    vy: physics.vy,
    wheelOmega: physics.wheelOmega,
    wheelSlip: slipRatios,
    frontSlipAngle,
    rearSlipAngle,
    frontLateralForce: frontFy,
    rearLateralForce: rearFy,
    frontLoad: loads.front,
    rearLoad: loads.rear,
    frontLeftLoad: loads.fl,
    frontRightLoad: loads.fr,
    rearLeftLoad: loads.rl,
    rearRightLoad: loads.rr,
    engineRpm: physics.engineRpm,
    currentGear: physics.currentGear,
    throttle: inputs.throttle,
    brake: inputs.brake,
    steeringInput: inputs.steer,
    handbrake: inputs.handbrake,
    speed,
    speedKph: speed * 3.6,
    longitudinalAccel: physics.prevAx,
    lateralAccel: physics.prevAy,
    longitudinalG: physics.prevAx / PHYSICS_CONSTANTS.GRAVITY,
    lateralG: physics.prevAy / PHYSICS_CONSTANTS.GRAVITY,
    status,
    tcActive,
    scActive,
  };
}

/** Validate vehicle parameters */
export function validateParams(params: Partial<VehicleParams>): VehicleParams {
  const validated = { ...params } as VehicleParams;

  // Clamp values to reasonable ranges
  validated.peakPower = Math.max(10, Math.min(1000, validated.peakPower || 200));
  validated.peakTorque = Math.max(50, Math.min(2000, validated.peakTorque || 400));
  validated.redlineRpm = Math.max(3000, Math.min(12000, validated.redlineRpm || 7000));
  validated.gearRatios = validated.gearRatios?.length ? validated.gearRatios.map(r => Math.max(0.1, Math.min(10, r))) : [3.5, 2.2, 1.5, 1.1, 0.9, 0.75];
  validated.finalDriveRatio = Math.max(1, Math.min(6, validated.finalDriveRatio || 3.7));
  validated.drivetrainEfficiency = Math.max(0.5, Math.min(1, validated.drivetrainEfficiency || 0.92));
  validated.mass = Math.max(500, Math.min(3000, validated.mass || 1450));
  validated.weightDistribution = Math.max(0.3, Math.min(0.7, validated.weightDistribution || 0.52));
  validated.wheelbase = Math.max(1.5, Math.min(4, validated.wheelbase || 2.7));
  validated.cgHeight = Math.max(0.2, Math.min(1.5, validated.cgHeight || 0.5));
  validated.yawInertia = validated.yawInertia || calculateYawInertia(validated);
  validated.frictionCoefficient = Math.max(0.3, Math.min(2.0, validated.frictionCoefficient || 1.05));
  validated.frontGripBias = Math.max(0.2, Math.min(0.8, validated.frontGripBias || 0.52));
  validated.corneringStiffness = Math.max(10000, Math.min(200000, validated.corneringStiffness || 70000));
  validated.dragCoefficient = Math.max(0.1, Math.min(1.5, validated.dragCoefficient || 0.32));
  validated.frontalArea = Math.max(1, Math.min(4, validated.frontalArea || 2.2));
  validated.downforceCoefficient = Math.max(-3, Math.min(0.5, validated.downforceCoefficient || -0.1));
  validated.aeroBalance = Math.max(0.2, Math.min(0.8, validated.aeroBalance || 0.5));
  validated.maxBrakeForce = Math.max(1000, Math.min(20000, validated.maxBrakeForce || 8000));
  validated.brakeBias = Math.max(0.3, Math.min(0.9, validated.brakeBias || 0.65));
  validated.maxSteerAngle = Math.max(0.2, Math.min(1.2, validated.maxSteerAngle || 0.6));
  validated.steerRate = Math.max(1, Math.min(10, validated.steerRate || 3.0));
  validated.shiftUpRpm = Math.max(2000, Math.min(validated.redlineRpm - 100, validated.shiftUpRpm || 6500));
  validated.shiftDownRpm = Math.max(1000, Math.min(validated.shiftUpRpm - 500, validated.shiftDownRpm || 3000));
  validated.tcSlipThreshold = Math.max(0.05, Math.min(0.5, validated.tcSlipThreshold || 0.15));
  validated.scYawRateThreshold = Math.max(0.2, Math.min(2.0, validated.scYawRateThreshold || 0.8));

  return validated;
}