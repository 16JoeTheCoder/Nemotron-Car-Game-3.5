import type { TestResult, VehicleState } from '../types';
import { PhysicsEngine } from './../physics/model';
import type { TrackGeometry } from './tracks';

export type TestId = 'A' | 'B' | 'C';
export type TestPhase = 'idle' | 'running' | 'finished';

export interface TestValues {
  [key: string]: number;
}

export interface TestStatus {
  id: TestId;
  phase: TestPhase;
  values: TestValues;
  message: string;
}

/**
 * Manages the three engineering challenges. The player drives the car; the
 * manager observes simulation state and records repeatable measurements.
 * All measurements derive from simulated state only.
 */
export class TestManager {
  private id: TestId | null = null;
  private phase: TestPhase = 'idle';
  private startTime = 0;
  private t = 0; // test elapsed time
  private values: TestValues = {};
  private message = '';
  private bestLap = 0;
  private lapStart = 0;
  private lapCount = 0;
  private cpIndex = 0; // next expected checkpoint order
  private offTrack = false;
  private offTrackIncidents = 0;
  private maxSpeed = 0;
  private maxAy = 0;
  private aySamples: number[] = [];
  private circleLaps = 0;
  private lastAngle = 0;

  // Results storage (persisted by the platform layer).
  private results: TestResult[] = [];

  getPhase(): TestPhase { return this.phase; }
  getId(): TestId | null { return this.id; }
  getMessage(): string { return this.message; }
  getValues(): TestValues { return { ...this.values }; }
  getResults(): TestResult[] { return [...this.results]; }

  start(id: TestId, now: number): void {
    this.id = id;
    this.phase = 'running';
    this.startTime = now;
    this.t = 0;
    this.values = {};
    this.message = this.initialMessage(id);
    this.maxSpeed = 0;
    this.maxAy = 0;
    this.aySamples = [];
    this.offTrack = false;
    this.offTrackIncidents = 0;
    this.circleLaps = 0;
    this.lastAngle = 0;
    if (id === 'C') {
      this.cpIndex = 1;
      this.lapCount = 0;
      this.lapStart = now;
      this.bestLap = this.bestLap || 0;
    }
  }

  private initialMessage(id: TestId): string {
    if (id === 'A') return 'Floor it. 0–100 km/h, then brake to a stop.';
    if (id === 'B') return 'Hold a steady circle on the skidpad.';
    return 'Follow the checkpoints in order. Shortcutting is not allowed.';
  }

  /** Reset the car to the track start state. */
  resetCar(eng: PhysicsEngine, startX: number, startY: number, startPsi: number): void {
    const st = eng.getState();
    st.x = startX;
    st.y = startY;
    st.psi = startPsi;
    st.vx = 0;
    st.vy = 0;
    st.r = 0;
    st.wheelOmega = 0;
    st.gear = 1;
  }

  /** Call every frame while a test is active. `eng` must already have been stepped. */
  update(
    eng: PhysicsEngine,
    now: number,
    geometry: TrackGeometry,
    offTrack: boolean,
  ): TestStatus | null {
    if (this.phase !== 'running' || !this.id) return null;
    const st = eng.getState();
    const speedKmh = Math.hypot(st.vx, st.vy) * 3.6;
    this.t = now - this.startTime;
    this.maxSpeed = Math.max(this.maxSpeed, speedKmh);
    this.maxAy = Math.max(this.maxAy, Math.abs(st.ay));
    this.aySamples.push(Math.abs(st.ay));
    if (this.aySamples.length > 200) this.aySamples.shift();

    if (offTrack && !this.offTrack) {
      this.offTrack = true;
      this.offTrackIncidents += 1;
    }
    if (!offTrack) this.offTrack = false;

    if (this.id === 'A') this.updateA(st);
    else if (this.id === 'B') this.updateB(st, geometry);
    else if (this.id === 'C') this.updateC(st, now, geometry);

    return this.status();
  }

  /* ---------------------------- Test A ---------------------------- */
  private updateA(st: VehicleState): void {
    const v = this.values;
    const speedKmh = Math.hypot(st.vx, st.vy) * 3.6;
    if (!v['t0_100'] && speedKmh >= 100) v['t0_100'] = this.t;
    if (!v['t0_200'] && speedKmh >= 200) v['t0_200'] = this.t;
    // 100-0 braking: arm once above 100 km/h, then integrate distance until stop.
    if (speedKmh > 100) {
      v['brakingArmed'] = 1;
      v['brakeStartX'] = st.x;
      v['brakeStartY'] = st.y;
      v['t100_0'] = undefined as unknown as number;
    }
    if (v['brakingArmed'] && speedKmh < 1 && v['t100_0'] === undefined) {
      v['t100_0'] = this.t;
      v['brakeDistM'] = Math.hypot(st.x - (v['brakeStartX'] || 0), st.y - (v['brakeStartY'] || 0));
    }
    v['maxSpeed'] = this.maxSpeed;
    if (v['t0_100'] && v['t100_0'] !== undefined) this.phase = 'finished';
  }

  /* ---------------------------- Test B ---------------------------- */
  private updateB(st: VehicleState, geometry: TrackGeometry): void {
    const v = this.values;
    // Track circle progress via heading angle around the skidpad center.
    const cx = geometry.start.x;
    const cy = geometry.start.y;
    const angle = Math.atan2(st.y - cy, st.x - cx);
    let dAngle = angle - this.lastAngle;
    while (dAngle > Math.PI) dAngle -= Math.PI * 2;
    while (dAngle < -Math.PI) dAngle += Math.PI * 2;
    this.lastAngle = angle;
    this.circleLaps += Math.abs(dAngle) / (Math.PI * 2);

    const speedKmh = Math.hypot(st.vx, st.vy) * 3.6;
    // Only count sustained cornering (reasonable speed, turning).
    if (speedKmh > 25) {
      v['maxAy'] = this.maxAy;
      v['avgAy'] = this.aySamples.reduce((a, b) => a + b, 0) / this.aySamples.length;
      v['corneringSpeed'] = speedKmh;
      v['laps'] = Math.floor(this.circleLaps);
    }
    if (this.circleLaps >= 1.5 && v['maxAy']) this.phase = 'finished';
  }

  /* ---------------------------- Test C ---------------------------- */
  private updateC(st: VehicleState, now: number, geometry: TrackGeometry): void {
    const v = this.values;
    const speedKmh = Math.hypot(st.vx, st.vy) * 3.6;
    v['avgSpeed'] = ((v['avgSpeed'] || 0) * (this.t > 0 ? this.t : 1) + speedKmh) / (this.t > 0 ? this.t : 1);
    // The above is a rough running average; recompute cleanly below.
    v['peakAy'] = this.maxAy;
    v['offTrackIncidents'] = this.offTrackIncidents;

    // Ordered checkpoint crossing.
    const cp = geometry.checkpoints.find((c) => c.order === this.cpIndex);
    if (cp) {
      const d = Math.hypot(st.x - cp.x, st.y - cp.y);
      if (d < cp.radius) {
        if (this.cpIndex === 1 && this.lapCount > 0) {
          // Completed a lap.
          const lapTime = (now - this.lapStart) / 1000;
          this.lapStart = now;
          if (!this.bestLap || lapTime < this.bestLap) this.bestLap = lapTime;
          v['bestLap'] = this.bestLap;
          v['lastLap'] = lapTime;
          this.lapCount += 1;
        } else if (this.cpIndex === 1) {
          this.lapStart = now;
          this.lapCount = 1;
        }
        this.cpIndex++;
        if (this.cpIndex > geometry.checkpoints.length) this.cpIndex = 1;
      }
    }
    v['lapCount'] = this.lapCount;
    if (this.lapCount >= 3) this.phase = 'finished';
  }

  private status(): TestStatus {
    return {
      id: this.id!,
      phase: this.phase,
      values: { ...this.values },
      message: this.message,
    };
  }

  /** Finalize and store a result when a test finishes. */
  finish(setupName: string, paramsHash: string): TestResult | null {
    if (this.phase !== 'finished' || !this.id) return null;
    const result: TestResult = {
      testId: this.id,
      setupName,
      paramsHash,
      values: { ...this.values },
      timestamp: Date.now(),
    };
    this.results.push(result);
    this.phase = 'idle';
    this.id = null;
    return result;
  }
}
