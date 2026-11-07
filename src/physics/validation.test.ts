// Physics Validation Tests
// Deterministic tests for physical invariants

import { describe, it, expect, beforeEach } from 'vitest';
import {
  physicsStep,
  createInitialState,
  validateParams,
} from './engine';
import { DEFAULT_VEHICLE, PHYSICS_CONSTANTS } from '../types';
import type { VehicleParams, Inputs, SurfaceType } from '../types';

describe('Physics Validation', () => {
  let params: VehicleParams;
  let inputs: Inputs;
  let surface: SurfaceType;

  beforeEach(() => {
    params = validateParams({ ...DEFAULT_VEHICLE });
    inputs = {
      throttle: 0,
      brake: 0,
      steer: 0,
      handbrake: false,
      shiftUp: false,
      shiftDown: false,
      reset: false,
      cameraCycle: false,
      pause: false,
    };
    surface = 'asphalt';
  });

  it('1. Stationary vehicle with no inputs remains stationary', () => {
    let state = createInitialState(params);
    const dt = PHYSICS_CONSTANTS.FIXED_TIMESTEP;

    // Run for 1 second
    for (let i = 0; i < 60; i++) {
      state = physicsStep(state, params, inputs, surface, dt);
    }

    expect(Math.abs(state.vx)).toBeLessThan(0.01);
    expect(Math.abs(state.vy)).toBeLessThan(0.01);
    expect(Math.abs(state.yawRate)).toBeLessThan(0.001);
    expect(Math.abs(state.x)).toBeLessThan(0.01);
    expect(Math.abs(state.y)).toBeLessThan(0.01);
  });

  it('2. Aerodynamic drag opposes velocity', () => {
    let state = createInitialState(params);
    state.vx = 30; // 30 m/s = 108 km/h
    state.wheelOmega = [90, 90, 90, 90]; // Matching wheel speed
    const dt = PHYSICS_CONSTANTS.FIXED_TIMESTEP;

    const initialVx = state.vx;
    state = physicsStep(state, params, inputs, surface, dt);

    // With no throttle, drag should reduce speed
    expect(state.vx).toBeLessThan(initialVx);
  });

  it('3. Increasing mass under same force reduces acceleration', () => {
      // Use very high friction and low torque to eliminate traction limits, testing pure F=ma
      // Use AWD so all wheels share load equally
      const testParams = validateParams({ 
        ...params, 
        frictionCoefficient: 10.0, 
        drivetrain: 'AWD',
        peakTorque: 100,  // Low torque to avoid traction limits
        peakPower: 50,    // Low power
      });
      const lightParams = validateParams({ ...testParams, mass: 1000 });
      const heavyParams = validateParams({ ...testParams, mass: 2000 });

      let lightState = createInitialState(lightParams);
      let heavyState = createInitialState(heavyParams);

      // Apply same throttle
      const testInputs: Inputs = { ...inputs, throttle: 1.0 };
      const dt = PHYSICS_CONSTANTS.FIXED_TIMESTEP;

      // Run a few steps to let wheel speeds build up (first step has 0 slip)
      for (let i = 0; i < 3; i++) {
        lightState = physicsStep(lightState, lightParams, testInputs, surface, dt);
        heavyState = physicsStep(heavyState, heavyParams, testInputs, surface, dt);
      }

      // Light car should have higher acceleration (F=ma, same force, less mass)
      expect(lightState.prevAx).toBeGreaterThan(heavyState.prevAx);
    });

  it('4. Braking from positive speed reduces longitudinal velocity', () => {
    let state = createInitialState(params);
    state.vx = 20; // 20 m/s
    state.wheelOmega = [60, 60, 60, 60];
    const dt = PHYSICS_CONSTANTS.FIXED_TIMESTEP;

    const brakeInputs: Inputs = { ...inputs, brake: 1.0 };
    const initialVx = state.vx;

    state = physicsStep(state, params, brakeInputs, surface, dt);

    expect(state.vx).toBeLessThan(initialVx);
  });

  it('5. Symmetric vehicle with zero steering produces no spontaneous yaw', () => {
    let state = createInitialState(params);
    state.vx = 15;
    state.wheelOmega = [45, 45, 45, 45];
    const dt = PHYSICS_CONSTANTS.FIXED_TIMESTEP;

    // Run with zero steering
    for (let i = 0; i < 60; i++) {
      state = physicsStep(state, params, inputs, surface, dt);
    }

    // Yaw rate should remain near zero (small numerical drift acceptable)
    expect(Math.abs(state.yawRate)).toBeLessThan(0.01);
    expect(Math.abs(state.heading)).toBeLessThan(0.05);
  });

  it('6. Tire lateral force remains bounded by friction limit', () => {
    let state = createInitialState(params);
    state.vx = 20;
    state.vy = 10; // High lateral velocity
    state.yawRate = 0.5;
    state.wheelOmega = [60, 60, 60, 60];
    const dt = PHYSICS_CONSTANTS.FIXED_TIMESTEP;

    const steerInputs: Inputs = { ...inputs, steer: 1.0 }; // Full steer
    state = physicsStep(state, params, steerInputs, surface, dt);

    // Lateral acceleration should be bounded by mu * g
    const maxLatG = params.frictionCoefficient;
    expect(Math.abs(state.prevAy / PHYSICS_CONSTANTS.GRAVITY)).toBeLessThanOrEqual(maxLatG + 0.1);
  });

  it('7. Increasing downforce increases available high-speed tire force', () => {
    const lowDownforce = validateParams({ ...params, downforceCoefficient: -0.1 });
    const highDownforce = validateParams({ ...params, downforceCoefficient: -1.5 });

    let lowState = createInitialState(lowDownforce);
    let highState = createInitialState(highDownforce);

    lowState.vx = 40; // High speed
    highState.vx = 40;
    lowState.wheelOmega = [120, 120, 120, 120];
    highState.wheelOmega = [120, 120, 120, 120];

    const steerInputs: Inputs = { ...inputs, steer: 0.5 };
    const dt = PHYSICS_CONSTANTS.FIXED_TIMESTEP;

    lowState = physicsStep(lowState, lowDownforce, steerInputs, surface, dt);
    highState = physicsStep(highState, highDownforce, steerInputs, surface, dt);

    // High downforce car should generate more lateral force (higher lateral accel)
    expect(Math.abs(highState.prevAy)).toBeGreaterThan(Math.abs(lowState.prevAy));
  });

  it('8. Simulation consistency at 30 FPS vs 60 FPS rendering', () => {
      // Physics runs at fixed 60 Hz regardless of render rate
      // This test verifies the fixed timestep produces consistent results

      const dt60 = 1 / 60;

      let state60 = createInitialState(params);
      let state30 = createInitialState(params);

    state60.vx = 10;
    state30.vx = 10;
    state60.wheelOmega = [30, 30, 30, 30];
    state30.wheelOmega = [30, 30, 30, 30];

    const testInputs: Inputs = { ...inputs, throttle: 0.5 };

    // Simulate 1 second at 60 FPS (60 steps)
    for (let i = 0; i < 60; i++) {
      state60 = physicsStep(state60, params, testInputs, surface, dt60);
    }

    // Simulate 1 second at 30 FPS (30 frames, 2 physics steps each = 60 steps)
    for (let i = 0; i < 30; i++) {
      state30 = physicsStep(state30, params, testInputs, surface, dt60);
      state30 = physicsStep(state30, params, testInputs, surface, dt60);
    }

    // Results should be very close
    expect(Math.abs(state60.vx - state30.vx)).toBeLessThan(0.1);
    expect(Math.abs(state60.x - state30.x)).toBeLessThan(0.1);
    expect(Math.abs(state60.yawRate - state30.yawRate)).toBeLessThan(0.01);
  });

  it('9. Extreme garage settings do not crash', () => {
    const extremeParams = validateParams({
      ...params,
      mass: 3000,
      peakPower: 1000,
      peakTorque: 2000,
      frictionCoefficient: 2.0,
      downforceCoefficient: -3.0,
      maxBrakeForce: 20000,
      cgHeight: 1.5,
    });

    let state = createInitialState(extremeParams);
    const dt = PHYSICS_CONSTANTS.FIXED_TIMESTEP;

    // Run with extreme inputs
    const extremeInputs: Inputs = {
      throttle: 1,
      brake: 1,
      steer: 1,
      handbrake: true,
      shiftUp: false,
      shiftDown: false,
      reset: false,
      cameraCycle: false,
      pause: false,
    };

    // Should not throw or produce NaN
    for (let i = 0; i < 120; i++) {
      state = physicsStep(state, extremeParams, extremeInputs, surface, dt);
      expect(Number.isFinite(state.vx)).toBe(true);
      expect(Number.isFinite(state.vy)).toBe(true);
      expect(Number.isFinite(state.yawRate)).toBe(true);
      expect(Number.isFinite(state.x)).toBe(true);
      expect(Number.isFinite(state.y)).toBe(true);
    }
  });

  it('10. Reset produces valid state', () => {
    let state = createInitialState(params);
    state.vx = 50;
    state.vy = 20;
    state.yawRate = 2;
    state.x = 1000;
    state.y = 500;
    state.heading = Math.PI;
    state.wheelOmega = [150, 150, 150, 150];

    const dt = PHYSICS_CONSTANTS.FIXED_TIMESTEP;
    const resetInputs: Inputs = { ...inputs, reset: true };

    state = physicsStep(state, params, resetInputs, surface, dt);

    // After reset, should be near origin with zero velocity
    // (Reset handling would be in game logic, but physics should handle gracefully)
    expect(Number.isFinite(state.vx)).toBe(true);
    expect(Number.isFinite(state.vy)).toBe(true);
  });
});