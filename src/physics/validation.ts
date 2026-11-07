import { PhysicsEngine, defaultParams, FIXED_DT } from './model';
import type { Inputs, VehicleParams } from '../types';

let passes = 0;
let failures = 0;

function assert(cond: boolean, name: string, detail = ''): void {
  if (cond) {
    passes += 1;
    console.log(`PASS - ${name}`);
  } else {
    failures += 1;
    console.log(`FAIL - ${name} ${detail}`);
  }
}

function inputs(throttle = 0, brake = 0, steer = 0): Inputs {
  return { throttle, brake, steer, handbrake: false, shiftUp: false, shiftDown: false, reset: false };
}

function cloneParams(overrides: Partial<VehicleParams>): VehicleParams {
  return { ...defaultParams, ...overrides };
}

// ---- Test 1: stationary vehicle with no inputs remains stationary ----
{
  const eng = new PhysicsEngine();
  for (let i = 0; i < 600; i++) eng.step(inputs(), FIXED_DT);
  const s2 = eng.getState();
  assert(
    Math.abs(s2.vx) < 0.01 && Math.abs(s2.vy) < 0.01 && Math.abs(s2.r) < 0.01 &&
      Math.abs(s2.x) < 0.01 && Math.abs(s2.y) < 0.01,
    '1. Stationary vehicle remains stationary',
    `vx=${s2.vx.toFixed(4)} vy=${s2.vy.toFixed(4)} r=${s2.r.toFixed(6)}`,
  );
}

// ---- Test 2: aerodynamic drag opposes velocity ----
{
  const eng = new PhysicsEngine(cloneParams({ transmission: 'auto' }));
  // Accelerate to speed, then cut throttle and brake; drag must slow the car.
  for (let i = 0; i < 300; i++) eng.step(inputs(1, 0, 0), FIXED_DT);
  const vBefore = eng.getState().vx;
  for (let i = 0; i < 200; i++) eng.step(inputs(0, 0, 0), FIXED_DT);
  const vAfter = eng.getState().vx;
  assert(vAfter < vBefore && vBefore > 10, '2. Drag opposes forward velocity', `vx ${vBefore.toFixed(2)} -> ${vAfter.toFixed(2)}`);

  // Lateral: give sideways velocity, no forces; drag should reduce |vy|.
  const eng2 = new PhysicsEngine();
  eng2.setParams({ mass: 1400 });
  // Inject lateral velocity directly by stepping with a steer impulse then zeroing.
  for (let i = 0; i < 20; i++) eng2.step(inputs(0, 0, 1), FIXED_DT);
  const vyBefore = Math.abs(eng2.getState().vy);
  for (let i = 0; i < 100; i++) eng2.step(inputs(0, 0, 0), FIXED_DT);
  const vyAfter = Math.abs(eng2.getState().vy);
  assert(vyAfter < vyBefore || vyBefore < 0.05, '2. Drag opposes lateral velocity', `vy ${vyBefore.toFixed(3)} -> ${vyAfter.toFixed(3)}`);
}

// ---- Test 3: increasing mass under same fixed net force reduces acceleration ----
{
  // Coast from high speed: drag is the same force on both; heavier mass decelerates less.
  const run = (mass: number): number => {
    const eng = new PhysicsEngine(cloneParams({ mass, transmission: 'auto' }));
    for (let i = 0; i < 400; i++) eng.step(inputs(1, 0, 0), FIXED_DT); // reach speed
    const vStart = eng.getState().vx;
    for (let i = 0; i < 150; i++) eng.step(inputs(0, 0, 0), FIXED_DT); // coast
    return eng.getState().vx - vStart; // negative delta
  };
  const dLight = run(1000);
  const dHeavy = run(2000);
  // Heavier car loses less speed (smaller deceleration magnitude) under same drag.
  assert(dHeavy > dLight, '3. More mass reduces deceleration under same drag force', `light=${dLight.toFixed(3)} heavy=${dHeavy.toFixed(3)}`);
}

// ---- Test 4: braking from positive speed reduces longitudinal velocity ----
{
  const eng = new PhysicsEngine(cloneParams({ transmission: 'auto' }));
  for (let i = 0; i < 300; i++) eng.step(inputs(1, 0, 0), FIXED_DT);
  const vBefore = eng.getState().vx;
  for (let i = 0; i < 100; i++) eng.step(inputs(0, 1, 0), FIXED_DT);
  const vAfter = eng.getState().vx;
  assert(vAfter < vBefore && vBefore > 5, '4. Braking reduces longitudinal velocity', `vx ${vBefore.toFixed(2)} -> ${vAfter.toFixed(2)}`);
}

// ---- Test 5: symmetric vehicle, zero steering, balanced forces -> no spontaneous yaw ----
{
  const eng = new PhysicsEngine(cloneParams({ weightDistributionFront: 0.5 }));
  let maxR = 0;
  for (let i = 0; i < 600; i++) {
    eng.step(inputs(0.3, 0, 0), FIXED_DT);
    maxR = Math.max(maxR, Math.abs(eng.getState().r));
  }
  assert(maxR < 0.02, '5. No spontaneous yaw with zero steering', `max |r| = ${maxR.toFixed(6)}`);
}

// ---- Test 6: tire lateral force bounded by friction limit ----
{
  const eng = new PhysicsEngine(cloneParams({ tireCompound: 'racing' }));
  // Reach speed, then apply a large step steer to saturate lateral tires.
  for (let i = 0; i < 300; i++) eng.step(inputs(0.4, 0, 0), FIXED_DT);
  let maxFyfRatio = 0;
  let maxFyrRatio = 0;
  for (let i = 0; i < 120; i++) {
    eng.step(inputs(0.2, 0, 1), FIXED_DT);
    const { Fyf, Fyr, mu, Fzf, Fzr } = eng.getInternals();
    maxFyfRatio = Math.max(maxFyfRatio, Math.abs(Fyf) / Math.max(1, mu * Fzf));
    maxFyrRatio = Math.max(maxFyrRatio, Math.abs(Fyr) / Math.max(1, mu * Fzr));
  }
  assert(maxFyfRatio <= 1.0 + 1e-3 && maxFyrRatio <= 1.0 + 1e-3, '6. Tire lateral force bounded by friction limit', `Fyf ratio=${maxFyfRatio.toFixed(3)} Fyr ratio=${maxFyrRatio.toFixed(3)}`);
}

// ---- Test 7: increasing downforce increases available high-speed tire force ----
{
  const frictionLimit = (downforce: number): number => {
    const eng = new PhysicsEngine(cloneParams({ downforceCoefficient: downforce, transmission: 'auto' }));
    // Accelerate straight to high speed, then hold steady speed (light throttle).
    for (let i = 0; i < 450; i++) eng.step(inputs(1, 0, 0), FIXED_DT);
    for (let i = 0; i < 60; i++) eng.step(inputs(0.15, 0, 0), FIXED_DT);
    const { mu, Fzf, Fzr } = eng.getInternals();
    return mu * (Fzf + Fzr); // total available tire force (friction circle radius)
  };
  const limitLow = frictionLimit(0);
  const limitHigh = frictionLimit(3.0);
  assert(limitHigh > limitLow * 1.15, '7. More downforce increases available high-speed tire force', `limit(0)=${limitLow.toFixed(1)} N limit(3)=${limitHigh.toFixed(1)} N`);
}

// ---- Test 8: same fixed timestep -> consistent results at 30 and 60 FPS rendering ----
{
  const run = (renderDt: number): number => {
    const eng = new PhysicsEngine(cloneParams({ transmission: 'auto' }));
    const total = 4.0;
    let t = 0;
    let steer = 0;
    while (t < total) {
      if (t > 1 && t < 2) steer = 0.5;
      eng.step(inputs(1, 0, steer), renderDt);
      t += renderDt;
    }
    return eng.getState().vx;
  };
  const v60 = run(1 / 60);
  const v30 = run(1 / 30);
  const relDiff = Math.abs(v60 - v30) / Math.max(0.01, Math.abs(v60));
  assert(relDiff < 0.08, '8. Results consistent at 30 vs 60 FPS (fixed timestep)', `v60=${v60.toFixed(3)} v30=${v30.toFixed(3)} relDiff=${(relDiff * 100).toFixed(1)}%`);
}

console.log(`\n${passes} passed, ${failures} failed out of ${passes + failures}`);
if (failures > 0) {
  throw new Error(`${failures} test(s) failed`);
}
