import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppSettings, TelemetrySample, TestResult, VehicleParams } from '../types';
import { PhysicsEngine, FIXED_DT } from '../physics/model';
import { buildGeometry, allTracks } from '../tracks/tracks';
import type { TrackGeometry } from '../tracks/tracks';
import { TestManager, type TestId } from '../tracks/testModes';
import { Renderer } from '../rendering/renderer';
import { Camera } from '../rendering/camera';
import { G } from '../physics/model';

const TRACK_IDS: string[] = Object.keys(allTracks);

export interface DriveProps {
  params: VehicleParams;
  settings: AppSettings;
  onTelemetry: (sample: TelemetrySample) => void;
  onSetParams: (next: Partial<VehicleParams>) => void;
  onTestFinished: (result: TestResult) => void;
}

export default function Drive({ params, settings, onTelemetry, onTestFinished }: DriveProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [trackId, setTrackId] = useState<string>('speed-strip');
  const [isPaused, setIsPaused] = useState(false);
  const [testId, setTestId] = useState<TestId | null>(null);
  const [testMessage, setTestMessage] = useState<string>('');
  const [testValues, setTestValues] = useState<Record<string, number>>({});

  // Refs for mutable simulation state (avoid re-creating on every render).
  const engRef = useRef<PhysicsEngine | null>(null);
  const rendRef = useRef<Renderer | null>(null);
  const camRef = useRef<Camera | null>(null);
  const testRef = useRef<TestManager | null>(null);
  const geomRef = useRef<TrackGeometry | null>(null);
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const accDtRef = useRef(0);

  // Input state.
  const keysRef = useRef<{ [key: string]: boolean }>({});
  const shiftUpRef = useRef(false);
  const shiftDownRef = useRef(false);
  const resetRef = useRef(false);

  // Initialize physics engine when params change.
  useEffect(() => {
    engRef.current = new PhysicsEngine(params);
    const track = allTracks[trackId];
    geomRef.current = buildGeometry(
      track.segments,
      track.surfaceZones,
      track.checkpoints,
      track.cones,
      track.start,
    );
    // Place car at track start.
    engRef.current.setParams(params);
    engRef.current.getState().x = track.start.x;
    engRef.current.getState().y = track.start.y;
    engRef.current.getState().psi = track.start.psi;
    engRef.current.getState().vx = 0;
    engRef.current.getState().vy = 0;
    engRef.current.getState().r = 0;
    engRef.current.getState().wheelOmega = 0;
    engRef.current.getState().gear = 1;
  }, [params, trackId]);

  // Initialize renderer + camera on mount.
  useEffect(() => {
    if (!canvasRef.current) return;
    rendRef.current = new Renderer();
    camRef.current = new Camera();
    testRef.current = new TestManager();
  }, []);

  // Keyboard listeners.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      keysRef.current[e.code] = true;
      if (e.code === 'KeyQ') shiftUpRef.current = true;
      if (e.code === 'KeyE') shiftDownRef.current = true;
      if (e.code === 'KeyR') resetRef.current = true;
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keysRef.current[e.code] = false;
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  // Build inputs from keyboard state.
  const getInputs = useCallback((): Parameters<PhysicsEngine['step']>[0] => {
    const throttle = keysRef.current['KeyW'] || keysRef.current['ArrowUp'] ? 1 : 0;
    const brake = keysRef.current['KeyS'] || keysRef.current['ArrowDown'] ? 1 : 0;
    let steer = 0;
    if (keysRef.current['KeyA'] || keysRef.current['ArrowLeft']) steer -= 1;
    if (keysRef.current['KeyD'] || keysRef.current['ArrowRight']) steer += 1;
    return {
      throttle,
      brake,
      steer: clamp(steer, -1, 1),
      handbrake: keysRef.current['Space'] || false,
      shiftUp: shiftUpRef.current,
      shiftDown: shiftDownRef.current,
      reset: resetRef.current,
    };
  }, []);

  // Consume edge-triggered inputs.
  const consumeEdges = useCallback(() => {
    shiftUpRef.current = false;
    shiftDownRef.current = false;
    resetRef.current = false;
  }, []);

  // Off-track detection: distance from centerline > half track width.
  const isOffTrack = useCallback((x: number, y: number): boolean => {
    const geom = geomRef.current;
    if (!geom) return false;
    // Find nearest centerline sample by projecting onto segments.
    let bestD = Infinity;
    const pts = geom.centerline;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const abx = b.x - a.x;
      const aby = b.y - a.y;
      const apx = x - a.x;
      const apy = y - a.y;
      const t = clamp((apx * abx + apy * aby) / (abx * abx + aby * aby || 1), 0, 1);
      const qx = a.x + abx * t;
      const qy = a.y + aby * t;
      const d = Math.hypot(x - qx, y - qy);
      bestD = Math.min(bestD, d);
    }
    return bestD > 7.5; // half track width + margin
  }, []);

  // Start / reset a test.
  const startTest = useCallback((id: TestId | null) => {
    setTestId(id);
    if (!id || !engRef.current || !geomRef.current) {
      setTestMessage('');
      setTestValues({});
      return;
    }
    const track = allTracks[trackId];
    testRef.current!.resetCar(engRef.current, track.start.x, track.start.y, track.start.psi);
    testRef.current!.start(id, performance.now());
    setTestMessage(testRef.current!.getMessage());
    setTestValues(testRef.current!.getValues());
  }, [trackId]);

  const resetCar = useCallback(() => {
    if (!engRef.current || !geomRef.current) return;
    const track = allTracks[trackId];
    testRef.current!.resetCar(engRef.current, track.start.x, track.start.y, track.start.psi);
    if (testId) {
      testRef.current!.start(testId, performance.now());
      setTestMessage(testRef.current!.getMessage());
      setTestValues(testRef.current!.getValues());
    }
  }, [trackId, testId]);

  // Main game loop.
  const loop = useCallback((now: number) => {
    if (isPaused) {
      lastTimeRef.current = now;
      rafRef.current = requestAnimationFrame(loop);
      return;
    }
    const prev = lastTimeRef.current || now;
    const dt = Math.min((now - prev) / 1000, 0.1); // cap dt
    lastTimeRef.current = now;

    const eng = engRef.current;
    const rend = rendRef.current;
    const cam = camRef.current;
    const test = testRef.current;
    const geom = geomRef.current;
    if (!eng || !rend || !cam || !test || !geom) {
      rafRef.current = requestAnimationFrame(loop);
      return;
    }

    // Fixed-timestep physics integration.
    accDtRef.current += dt;
    let steps = 0;
    while (accDtRef.current >= FIXED_DT && steps < 8) {
      const inputs = getInputs();
      eng.step(inputs, FIXED_DT);
      if (inputs.reset) {
        const track = allTracks[trackId];
        const st = eng.getState();
        st.x = track.start.x;
        st.y = track.start.y;
        st.psi = track.start.psi;
        st.vx = 0;
        st.vy = 0;
        st.r = 0;
        st.wheelOmega = 0;
        st.gear = 1;
        if (testId) {
          test.resetCar(eng, track.start.x, track.start.y, track.start.psi);
          test.start(testId, performance.now());
          setTestMessage(test.getMessage());
          setTestValues(test.getValues());
        }
      }
      accDtRef.current -= FIXED_DT;
      steps += 1;
    }
    consumeEdges();

    const st = eng.getState();
    const internals = eng.getInternals();

    // Update camera.
    const speed = Math.hypot(st.vx, st.vy);
    if (settings.cameraMode === 'follow') {
      cam.follow(st.x, st.y, st.psi, speed, dt);
    } else if (settings.cameraMode === 'cinematic') {
      cam.cinematic(st.x, st.y, st.psi, dt);
    }

    // Update test manager.
    const offTrack = isOffTrack(st.x, st.y);
    const status = test.update(eng, now, geom, offTrack);
    if (status) {
      setTestMessage(status.message);
      setTestValues(status.values);
      if (status.phase === 'finished') {
        const result = test.finish('user-setup', paramsHash(params));
        if (result) {
          onTestFinished(result);
        }
      }
    }

    // Telemetry sample.
    const sample = eng.telemetrySample(now / 1000);
    onTelemetry(sample);

    // Render.
    const ctx = canvasRef.current!.getContext('2d')!;
    const { width, height } = canvasRef.current!;
    rend.render(ctx, {
      camera: cam,
      state: st,
      internals,
      geometry: geom,
      surface: st.surface,
      width,
      height,
    });

    rafRef.current = requestAnimationFrame(loop);
  }, [
    isPaused, getInputs, consumeEdges, trackId, testId, settings.cameraMode,
    isOffTrack, onTelemetry, params,
  ]);

  // Start the loop on mount.
  useEffect(() => {
    lastTimeRef.current = performance.now();
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [loop]);

  const st = engRef.current?.getState();
  const speedKmh = st ? Math.hypot(st.vx, st.vy) * 3.6 : 0;

  return (
    <div className="drive-panel">
      <div className="drive-toolbar">
        <label>
          Track:
          <select value={trackId} onChange={(e) => setTrackId(e.target.value as string)}>
            {TRACK_IDS.map((id) => (
              <option key={id} value={id}>
                {allTracks[id].name}
              </option>
            ))}
          </select>
        </label>
        <button className="btn" onClick={() => setIsPaused((p) => !p)}>
          {isPaused ? 'Resume' : 'Pause'}
        </button>
        <button className="btn" onClick={resetCar}>
          Reset Car
        </button>
        <div className="test-selector">
          <label>Test:</label>
          <button
            className={testId === 'A' ? 'active' : ''}
            onClick={() => startTest('A')}
          >
            A: Accel/Brake
          </button>
          <button
            className={testId === 'B' ? 'active' : ''}
            onClick={() => startTest('B')}
          >
            B: Skidpad
          </button>
          <button
            className={testId === 'C' ? 'active' : ''}
            onClick={() => startTest('C')}
          >
            C: Circuit
          </button>
          {testId && (
            <button className="btn btn-outline" onClick={() => startTest(null)}>
              Clear
            </button>
          )}
        </div>
        <div className="test-status">
          {testId && (
            <>
              <span className={`test-phase ${testId}`}>{testId}</span>
              <span>{testMessage}</span>
            </>
          )}
        </div>
      </div>

      <div className="drive-canvas-wrap">
        <canvas ref={canvasRef} className="drive-canvas" />
        <div className="drive-overlay">
          <HUD
            state={st ?? undefined}
            internals={engRef.current ? engRef.current.getInternals() : null}
            speedKmh={speedKmh}
            testId={testId}
            testValues={testValues}
          />
        </div>
      </div>

      <div className="drive-hints">
        <kbd>W</kbd><kbd>S</kbd><kbd>A</kbd><kbd>D</kbd> drive &middot;
        <kbd>Space</kbd> handbrake &middot;
        <kbd>Q</kbd><kbd>E</kbd> shift &middot;
        <kbd>R</kbd> reset
      </div>
    </div>
  );
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function paramsHash(params: VehicleParams): string {
  // Simple hash of key params for result dedup/comparison.
  const key = `${params.mass}|${params.drivetrain}|${params.tireCompound}|${params.frictionCoefficient}|${params.corneringStiffness}|${params.peakPowerKw}|${params.peakTorqueNm}`;
  let h = 0;
  for (let i = 0; i < key.length; i++) {
    h = ((h << 5) - h + key.charCodeAt(i)) | 0;
  }
  return h.toString(16);
}

function HUD({
  state,
  internals,
  speedKmh,
  testId,
  testValues,
}: {
  state?: ReturnType<PhysicsEngine['getState']>;
  internals: ReturnType<PhysicsEngine['getInternals']> | null;
  speedKmh: number;
  testId: TestId | null;
  testValues: Record<string, number>;
}) {
  if (!state || !internals) return null;
  const rpm = state.rpm;
  const gear = state.gear;
  const axG = state.ax / G;
  const ayG = state.ay / G;
  const surface = state.surface;
  const status = internals.status;

  return (
    <div className="hud">
      <div className="hud-speed">
        <div className="big">{speedKmh.toFixed(0)}</div>
        <div className="unit">km/h</div>
      </div>
      <div className="hud-grid">
        <div className="hud-cell">
          <div className="hud-label">RPM</div>
          <div className="hud-value">{Math.round(rpm)}</div>
        </div>
        <div className="hud-cell">
          <div className="hud-label">Gear</div>
          <div className="hud-value">{gear}</div>
        </div>
        <div className="hud-cell">
          <div className="hud-label">a<sub>x</sub> (g)</div>
          <div className="hud-value">{axG.toFixed(2)}</div>
        </div>
        <div className="hud-cell">
          <div className="hud-label">a<sub>y</sub> (g)</div>
          <div className="hud-value">{ayG.toFixed(2)}</div>
        </div>
        <div className="hud-cell">
          <div className="hud-label">Yaw (°/s)</div>
          <div className="hud-value">{((state.r * 180) / Math.PI).toFixed(0)}</div>
        </div>
        <div className="hud-cell">
          <div className="hud-label">αF (°)</div>
          <div className="hud-value">{internals.alphaF.toFixed(1)}</div>
        </div>
        <div className="hud-cell">
          <div className="hud-label">αR (°)</div>
          <div className="hud-value">{internals.alphaR.toFixed(1)}</div>
        </div>
        <div className="hud-cell">
          <div className="hud-label">Grip</div>
          <div className="hud-value">{internals.gripUtil.toFixed(2)}</div>
        </div>
        <div className="hud-cell">
          <div className="hud-label">Surface</div>
          <div className="hud-value">{surface}</div>
        </div>
        <div className="hud-cell">
          <div className="hud-label">Status</div>
          <div className={`hud-value status-${status}`}>{status}</div>
        </div>
      </div>
      {testId && (
        <div className="hud-test">
          <div className="hud-label">Test {testId}</div>
          {testId === 'A' && (
            <div>
              <div>0&ndash;100 km/h: {testValues.t0_100 ? testValues.t0_100.toFixed(2) + 's' : '—'}</div>
              <div>100&ndash;0: {testValues.t100_0 ? testValues.t100_0.toFixed(2) + 's' : '—'}</div>
              <div>Brake dist: {(testValues.brakeDistM ?? 0).toFixed(1)} m</div>
            </div>
          )}
          {testId === 'B' && (
            <div>
              <div>Max a<sub>y</sub>: {testValues.maxAy ? testValues.maxAy.toFixed(2) + ' g' : '—'}</div>
              <div>Avg a<sub>y</sub>: {testValues.avgAy ? testValues.avgAy.toFixed(2) + ' g' : '—'}</div>
              <div>Laps: {testValues.laps ?? 0}</div>
            </div>
          )}
          {testId === 'C' && (
            <div>
              <div>Best lap: {testValues.bestLap ? testValues.bestLap.toFixed(2) + 's' : '—'}</div>
              <div>Laps: {testValues.lapCount ?? 0}</div>
              <div>Off-track: {testValues.offTrackIncidents ?? 0}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
