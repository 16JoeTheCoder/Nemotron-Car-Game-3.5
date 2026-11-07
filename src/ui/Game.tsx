// Main Game Component
// React shell with Canvas rendering and UI panels

import React, { useEffect, useRef, useState } from 'react';
import { createRenderer, drawTelemetryGraph } from '../rendering';
import { createTestFacility, getSurfaceAt, createTestState, updateTestState, startTest, stopTest, type TestState } from '../tracks';
import { loadGame, debouncedSave, registerServiceWorker, exportVehicle, importVehicle, DEFAULT_SETTINGS } from '../platform';
import { physicsStep, createInitialState, physicsToVehicleState, validateParams, type PhysicsState } from '../physics';
import { VehicleParams, Inputs, VehicleState, TelemetrySample, TestResult, GameSettings, DEFAULT_VEHICLE, PRESETS, PHYSICS_CONSTANTS } from '../types';

// Param definition type for garage UI
type ParamDef = 
  | { key: string; label: string; type: 'select'; options: readonly string[] }
  | { key: string; label: string; type: 'boolean' }
  | { key: string; label: string; type?: 'range'; min: number; max: number; step: number };

// Ring buffer for telemetry
class RingBuffer<T> {
  private buffer: T[];
  private index = 0;
  private full = false;

  constructor(private capacity: number) {
    this.buffer = new Array(capacity);
  }

  push(item: T) {
    this.buffer[this.index] = item;
    this.index = (this.index + 1) % this.capacity;
    if (this.index === 0) this.full = true;
  }

  toArray(): T[] {
    if (!this.full) return this.buffer.slice(0, this.index);
    return [...this.buffer.slice(this.index), ...this.buffer.slice(0, this.index)];
  }

  clear() {
    this.index = 0;
    this.full = false;
  }
}

const TELEMETRY_CAPACITY = 300; // 5 seconds at 60Hz

// Input handling
function useInput(): Inputs {
  const [inputs, setInputs] = useState<Inputs>({
    throttle: 0, brake: 0, steer: 0, handbrake: false,
    shiftUp: false, shiftDown: false, reset: false,
    cameraCycle: false, pause: false,
  });

  useEffect(() => {
    const keyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
        setInputs((prev: Inputs) => {
        const next = { ...prev };
        switch (e.code) {
          case 'KeyW': case 'ArrowUp': next.throttle = 1; break;
          case 'KeyS': case 'ArrowDown': next.brake = 1; break;
          case 'KeyA': case 'ArrowLeft': next.steer = -1; break;
          case 'KeyD': case 'ArrowRight': next.steer = 1; break;
          case 'Space': next.handbrake = true; break;
          case 'KeyQ': next.shiftDown = true; break;
          case 'KeyE': next.shiftUp = true; break;
          case 'KeyR': next.reset = true; break;
          case 'KeyC': next.cameraCycle = true; break;
          case 'Escape': next.pause = true; break;
        }
        return next;
      });
    };

    const keyUp = (e: KeyboardEvent) => {
          setInputs((prev: Inputs) => {
        const next = { ...prev };
        switch (e.code) {
          case 'KeyW': case 'ArrowUp': next.throttle = 0; break;
          case 'KeyS': case 'ArrowDown': next.brake = 0; break;
          case 'KeyA': case 'ArrowLeft':
          case 'KeyD': case 'ArrowRight': next.steer = 0; break;
          case 'Space': next.handbrake = false; break;
          case 'KeyQ': next.shiftDown = false; break;
          case 'KeyE': next.shiftUp = false; break;
          case 'KeyR': next.reset = false; break;
          case 'KeyC': next.cameraCycle = false; break;
          case 'Escape': next.pause = false; break;
        }
        return next;
      });
    };

    window.addEventListener('keydown', keyDown);
    window.addEventListener('keyup', keyUp);
    return () => {
      window.removeEventListener('keydown', keyDown);
      window.removeEventListener('keyup', keyUp);
    };
  }, []);

  return inputs;
}

// Main Game Component
export function Game() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const telemetryCanvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<'loading' | 'ready' | 'paused'>('loading');
  const [activeTab, setActiveTab] = useState<'drive' | 'garage' | 'telemetry' | 'tests' | 'engineering'>('drive');
  const [settings, setSettings] = useState<GameSettings>(DEFAULT_SETTINGS);
  const [vehicleParams, setVehicleParams] = useState<VehicleParams>(DEFAULT_VEHICLE);
  const [presets, setPresets] = useState(PRESETS.map((p: typeof PRESETS[0]) => ({ name: p.name, params: validateParams(p.params) })));
  const [records, setRecords] = useState<TestResult[]>([]);
  const [testState, setTestState] = useState<TestState>(createTestState());
  const [showTutorial, setShowTutorial] = useState(true);
  const [tutorialStep, setTutorialStep] = useState(0);

  // Physics state
  const physicsRef = useRef<PhysicsState | null>(null);
  const vehicleRef = useRef<VehicleState | null>(null);
  const trackRef = useRef(createTestFacility());
  const rendererRef = useRef<ReturnType<typeof createRenderer> | null>(null);
  const telemetryBufferRef = useRef(new RingBuffer<TelemetrySample>(TELEMETRY_CAPACITY));
  const lastTimeRef = useRef(0);
  const accumRef = useRef(0);
  const animationRef = useRef<number>();

  // Inputs
  const inputs = useInput();

  // Initialize
  useEffect(() => {
    if (!canvasRef.current) return;

    // Load saved game
    const saved = loadGame();
    if (saved) {
      setVehicleParams(saved.currentVehicle);
      setPresets(saved.presets);
      setRecords(saved.records);
      setSettings(saved.settings);
    }

    // Create renderer
    const canvas = canvasRef.current!;
    const pixelRatio = Math.min(window.devicePixelRatio, 2);
    rendererRef.current = createRenderer({
      canvas,
      width: canvas.clientWidth,
      height: canvas.clientHeight,
      pixelRatio,
    });

    // Initialize physics
    const params = validateParams(vehicleParams);
    physicsRef.current = createInitialState(params);

    // Register service worker
    registerServiceWorker();

    setGameState('ready');
  }, []);

  // Handle resize
  useEffect(() => {
    const handleResize = () => {
      if (canvasRef.current && rendererRef.current) {
        const canvas = canvasRef.current;
        const pixelRatio = Math.min(window.devicePixelRatio, 2);
        rendererRef.current.resize(canvas.clientWidth, canvas.clientHeight, pixelRatio);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Game loop
  useEffect(() => {
    if (gameState !== 'ready') return;

    const loop = (time: number) => {
      const dt = (time - lastTimeRef.current) / 1000;
      lastTimeRef.current = time;

      // Fixed timestep physics
      accumRef.current += dt;
      const fixedDt = PHYSICS_CONSTANTS.FIXED_TIMESTEP;
      const maxSubsteps = PHYSICS_CONSTANTS.MAX_SUBSTEPS;
      let substeps = 0;

      while (accumRef.current >= fixedDt && substeps < maxSubsteps) {
        if (physicsRef.current && !inputs.pause) {
          const params = validateParams(vehicleParams);
          const surface = getSurfaceAt(physicsRef.current.x, physicsRef.current.y, trackRef.current);

          // Handle reset
          let currentInputs = inputs;
          if (inputs.reset) {
            physicsRef.current = createInitialState(params);
            currentInputs = { ...inputs, reset: false };
          }

          physicsRef.current = physicsStep(physicsRef.current, params, currentInputs, surface, fixedDt);

                    // Convert to vehicle state
                    vehicleRef.current = physicsToVehicleState(
            physicsRef.current,
            params,
            currentInputs,
            surface,
            'normal', // Will be updated
            false,
            false
          );

          // Update test state
          setTestState(prev => updateTestState(prev, vehicleRef.current!, trackRef.current, fixedDt));

          // Record telemetry
          if (vehicleRef.current) {
            telemetryBufferRef.current.push({
              timestamp: time,
              speedKph: vehicleRef.current.speedKph,
              rpm: vehicleRef.current.engineRpm,
              gear: vehicleRef.current.currentGear,
              throttle: vehicleRef.current.throttle,
              brake: vehicleRef.current.brake,
                        steerAngle: vehicleRef.current.steeringInput * params.maxSteerAngle * 180 / Math.PI,
              longitudinalG: vehicleRef.current.longitudinalG,
              lateralG: vehicleRef.current.lateralG,
              yawRate: vehicleRef.current.yawRate * 180 / Math.PI,
              frontSlipAngle: vehicleRef.current.frontSlipAngle * 180 / Math.PI,
              rearSlipAngle: vehicleRef.current.rearSlipAngle * 180 / Math.PI,
              frontGripUtil: 0, // Simplified
              rearGripUtil: 0,
              powerOutput: 0,
              surfaceType: surface,
            });
          }
        }
        accumRef.current -= fixedDt;
        substeps++;
      }

      // Render
      if (rendererRef.current && vehicleRef.current) {
        rendererRef.current.render(vehicleRef.current, trackRef.current, dt);
      }

      // Draw telemetry graph
      if (telemetryCanvasRef.current && settings.showTelemetry) {
        const ctx = telemetryCanvasRef.current.getContext('2d')!;
        const samples = telemetryBufferRef.current.toArray();
        const width = telemetryCanvasRef.current.width;
        const height = telemetryCanvasRef.current.height;
        ctx.clearRect(0, 0, width, height);

        // Speed graph
        drawTelemetryGraph(ctx, samples, 0, 0, width, height / 3, 'speedKph', '#00ccff', 'Speed', 0, 300);
        // Lateral G
        drawTelemetryGraph(ctx, samples, 0, height / 3, width, height / 3, 'lateralG', '#ffaa00', 'Lat G', -2, 2);
        // Steering
        drawTelemetryGraph(ctx, samples, 0, 2 * height / 3, width, height / 3, 'steerAngle', '#33cc33', 'Steer', -40, 40);
      }

      animationRef.current = requestAnimationFrame(loop);
    };

    lastTimeRef.current = performance.now();
    animationRef.current = requestAnimationFrame(loop);

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [gameState, vehicleParams, inputs]);

  // Auto-save
  useEffect(() => {
    if (gameState !== 'ready') return;
    const gameData = {
      version: 1,
      currentVehicle: vehicleParams,
      presets,
      records,
      settings,
    };
    debouncedSave(gameData);
  }, [vehicleParams, presets, records, settings, gameState]);

  // Handle test start/stop
  const handleStartTest = (mode: TestState['mode']) => {
    setTestState(startTest(testState, mode));
  };

  const handleStopTest = () => {
    const result = stopTest(testState, vehicleParams);
    if (result) {
      setRecords(prev => [...prev, result].slice(-50));
      setTestState(createTestState());
    }
  };

  // Handle preset selection
  const handleSelectPreset = (preset: { name: string; params: VehicleParams }) => {
    setVehicleParams(validateParams(preset.params));
  };

  // Handle parameter change
  const handleParamChange = (key: keyof VehicleParams, value: number | string | boolean) => {
      setVehicleParams((prev: VehicleParams) => validateParams({ ...prev, [key]: value }));
        };

        // Export/Import
        const handleExport = () => {
    const json = exportVehicle(vehicleParams);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vehicle-setup-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const json = event.target?.result as string;
      const params = importVehicle(json);
      if (params) setVehicleParams(params);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Tutorial steps
  const tutorialSteps = [
    'Welcome to Vehicle Dynamics Lab! Use WASD/Arrows to drive, Space for handbrake, Q/E to shift.',
    'Adjust your vehicle in the Garage tab. Changes affect the physics simulation directly.',
    'Run tests in the Tests tab: Acceleration, Skidpad, and Circuit. Compare results!',
    'View live telemetry in the Telemetry tab. Understand your car\'s behavior.',
    'Learn the physics in the Engineering tab. All parameters use SI units internally.',
  ];

  if (gameState === 'loading') {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.loadingSpinner}></div>
        <p style={styles.loadingText}>Vehicle Dynamics Lab</p>
        <p style={styles.loadingSubtext}>Initializing physics engine...</p>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <header style={styles.header}>
        <h1 style={styles.title}>Vehicle Dynamics Lab</h1>
        <div style={styles.tabBar}>
          {(['drive', 'garage', 'telemetry', 'tests', 'engineering'] as const).map(tab => (
            <button
              key={tab}
              style={{ ...styles.tabButton, ...(activeTab === tab ? styles.tabButtonActive : {}) }}
              onClick={() => setActiveTab(tab)}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      </header>

      {/* Main Content */}
      <main style={styles.main}>
        {/* Drive Tab - Game Canvas */}
        {activeTab === 'drive' && (
          <div style={styles.driveContainer}>
            <canvas
              ref={canvasRef}
              style={styles.canvas}
              tabIndex={0}
            />
            {settings.showHud && vehicleRef.current && <HUD vehicle={vehicleRef.current} settings={settings} />}
            {settings.showTelemetry && (
              <canvas
                ref={telemetryCanvasRef}
                style={styles.telemetryCanvas}
                width={300}
                height={200}
              />
            )}
          </div>
        )}

        {/* Garage Tab */}
        {activeTab === 'garage' && (
          <Garage
            vehicleParams={vehicleParams}
            onParamChange={handleParamChange}
            presets={presets}
            onSelectPreset={handleSelectPreset}
            onExport={handleExport}
            onImport={handleImport}
          />
        )}

        {/* Telemetry Tab */}
        {activeTab === 'telemetry' && (
                  <TelemetryPanel
                    vehicle={vehicleRef.current}
                  />
                )}

                {/* Tests Tab */}
                {activeTab === 'tests' && (
                  <TestsPanel
                    testState={testState}
                    records={records}
                    onStartTest={handleStartTest}
                    onStopTest={handleStopTest}
                  />
                )}

        {/* Engineering Tab */}
        {activeTab === 'engineering' && (
          <EngineeringPanel />
        )}
      </main>

      {/* Tutorial Overlay */}
      {showTutorial && (
        <div style={styles.tutorialOverlay}>
          <div style={styles.tutorialBox}>
            <h3 style={styles.tutorialTitle}>Tutorial</h3>
            <p style={styles.tutorialText}>{tutorialSteps[tutorialStep]}</p>
            <div style={styles.tutorialNav}>
              <button
                style={styles.tutorialButton}
                onClick={() => setTutorialStep(Math.max(0, tutorialStep - 1))}
                disabled={tutorialStep === 0}
              >
                Previous
              </button>
              <span style={styles.tutorialStep}>{tutorialStep + 1} / {tutorialSteps.length}</span>
              <button
                style={styles.tutorialButton}
                onClick={() => {
                  if (tutorialStep < tutorialSteps.length - 1) {
                    setTutorialStep(tutorialStep + 1);
                  } else {
                    setShowTutorial(false);
                    localStorage.setItem('vdl-tutorial-done', 'true');
                  }
                }}
              >
                {tutorialStep === tutorialSteps.length - 1 ? 'Get Started' : 'Next'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pause Menu */}
      {gameState === 'paused' && (
        <div style={styles.pauseOverlay}>
          <div style={styles.pauseBox}>
            <h2 style={styles.pauseTitle}>Paused</h2>
            <button style={styles.pauseButton} onClick={() => setGameState('ready')}>Resume</button>
            <button style={styles.pauseButton} onClick={() => {
              if (physicsRef.current) {
                physicsRef.current = createInitialState(validateParams(vehicleParams));
              }
              setGameState('ready');
            }}>Reset Vehicle</button>
            <button style={styles.pauseButton} onClick={() => setActiveTab('garage')}>Garage</button>
            <button style={styles.pauseButton} onClick={() => setActiveTab('tests')}>Tests</button>
          </div>
        </div>
      )}
    </div>
  );
}

// HUD Component
function HUD({ vehicle, settings }: { vehicle: VehicleState; settings: GameSettings }) {
  const speedUnit = settings.units === 'imperial' ? 'mph' : 'km/h';
  const speed = settings.units === 'imperial' ? vehicle.speedKph * 0.621371 : vehicle.speedKph;

  return (
    <div style={styles.hud}>
      <div style={styles.hudRow}>
        <div style={styles.hudItem}>
          <div style={styles.hudValue}>{Math.round(speed)}</div>
          <div style={styles.hudLabel}>{speedUnit}</div>
        </div>
        <div style={styles.hudItem}>
          <div style={styles.hudValue}>{Math.round(vehicle.engineRpm)}</div>
          <div style={styles.hudLabel}>RPM</div>
        </div>
        <div style={styles.hudItem}>
          <div style={styles.hudValue}>{vehicle.currentGear === 0 ? 'N' : vehicle.currentGear}</div>
          <div style={styles.hudLabel}>GEAR</div>
        </div>
      </div>

      <div style={styles.hudRow}>
        <div style={styles.hudItem}>
          <div style={styles.hudValue}>{vehicle.longitudinalG.toFixed(2)}</div>
          <div style={styles.hudLabel}>LONG G</div>
        </div>
        <div style={styles.hudItem}>
          <div style={styles.hudValue}>{vehicle.lateralG.toFixed(2)}</div>
          <div style={styles.hudLabel}>LAT G</div>
        </div>
        <div style={styles.hudItem}>
          <div style={styles.hudValue}>{(vehicle.yawRate * 180 / Math.PI).toFixed(1)}</div>
          <div style={styles.hudLabel}>YAW °/s</div>
        </div>
      </div>

      <div style={styles.hudRow}>
        <div style={styles.hudItem}>
          <div style={styles.hudValue}>{(vehicle.frontSlipAngle * 180 / Math.PI).toFixed(1)}</div>
          <div style={styles.hudLabel}>F SLIP °</div>
        </div>
        <div style={styles.hudItem}>
          <div style={styles.hudValue}>{(vehicle.rearSlipAngle * 180 / Math.PI).toFixed(1)}</div>
          <div style={styles.hudLabel}>R SLIP °</div>
        </div>
        <div style={styles.hudItem}>
          <div style={styles.hudValue}>{vehicle.status.toUpperCase()}</div>
          <div style={styles.hudLabel}>STATUS</div>
        </div>
      </div>

      {/* Input indicators */}
      <div style={styles.inputIndicators}>
        <div style={{ ...styles.inputBar, width: `${vehicle.throttle * 100}%`, background: vehicle.throttle > 0 ? '#33cc33' : '#333' }} />
        <div style={{ ...styles.inputBar, width: `${vehicle.brake * 100}%`, background: vehicle.brake > 0 ? '#cc3333' : '#333' }} />
        <div style={{ ...styles.inputBar, width: `${((vehicle.steeringInput + 1) / 2) * 100}%`, background: '#00ccff' }} />
      </div>

      {/* Driver aids */}
      <div style={styles.aids}>
        {vehicle.tcActive && <span style={{ ...styles.aidBadge, background: '#00ccff' }}>TC</span>}
        {vehicle.scActive && <span style={{ ...styles.aidBadge, background: '#ffaa00' }}>SC</span>}
      </div>
    </div>
  );
}

// Garage Component
function Garage({
  vehicleParams,
  onParamChange,
  presets,
  onSelectPreset,
  onExport,
  onImport,
}: {
  vehicleParams: VehicleParams;
  onParamChange: (key: keyof VehicleParams, value: number | string | boolean) => void;
  presets: { name: string; params: VehicleParams }[];
  onSelectPreset: (preset: { name: string; params: VehicleParams }) => void;
  onExport: () => void;
  onImport: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
    const categories: { key: string; label: string; params: ParamDef[] }[] = [
    { key: 'powertrain', label: 'Powertrain', params: [
      { key: 'peakPower', label: 'Peak Power (kW)', min: 50, max: 1000, step: 10 },
      { key: 'peakTorque', label: 'Peak Torque (Nm)', min: 100, max: 2000, step: 10 },
      { key: 'redlineRpm', label: 'Redline (RPM)', min: 3000, max: 12000, step: 100 },
      { key: 'finalDriveRatio', label: 'Final Drive', min: 2, max: 6, step: 0.1 },
      { key: 'drivetrain', label: 'Drivetrain', type: 'select', options: ['FWD', 'RWD', 'AWD'] as const },
      { key: 'drivetrainEfficiency', label: 'Drivetrain Efficiency', min: 0.7, max: 1, step: 0.01 },
    ]},
    { key: 'chassis', label: 'Chassis', params: [
      { key: 'mass', label: 'Mass (kg)', min: 500, max: 3000, step: 10 },
      { key: 'weightDistribution', label: 'Front Weight %', min: 0.3, max: 0.7, step: 0.01 },
      { key: 'wheelbase', label: 'Wheelbase (m)', min: 1.5, max: 4, step: 0.05 },
      { key: 'cgHeight', label: 'CG Height (m)', min: 0.2, max: 1.5, step: 0.01 },
    ]},
    { key: 'tires', label: 'Tires', params: [
      { key: 'tireCompound', label: 'Compound', type: 'select', options: ['economy', 'touring', 'sport', 'racing'] as const },
      { key: 'frictionCoefficient', label: 'Friction Coeff.', min: 0.3, max: 2, step: 0.05 },
      { key: 'frontGripBias', label: 'Front Grip Bias', min: 0.2, max: 0.8, step: 0.01 },
      { key: 'corneringStiffness', label: 'Cornering Stiffness', min: 10000, max: 200000, step: 1000 },
    ]},
    { key: 'aero', label: 'Aerodynamics', params: [
      { key: 'dragCoefficient', label: 'Drag Coeff (Cd)', min: 0.1, max: 1.5, step: 0.01 },
      { key: 'frontalArea', label: 'Frontal Area (m²)', min: 1, max: 4, step: 0.05 },
      { key: 'downforceCoefficient', label: 'Downforce Coeff', min: -3, max: 0.5, step: 0.05 },
      { key: 'aeroBalance', label: 'Aero Balance (Front %)', min: 0.2, max: 0.8, step: 0.01 },
    ]},
    { key: 'braking', label: 'Braking & Steering', params: [
      { key: 'maxBrakeForce', label: 'Max Brake Force (N)', min: 2000, max: 20000, step: 500 },
      { key: 'brakeBias', label: 'Brake Bias (Front %)', min: 0.3, max: 0.9, step: 0.01 },
      { key: 'maxSteerAngle', label: 'Max Steer Angle (rad)', min: 0.2, max: 1.2, step: 0.05 },
      { key: 'steerRate', label: 'Steer Rate (rad/s)', min: 1, max: 10, step: 0.5 },
    ]},
    { key: 'transmission', label: 'Transmission', params: [
      { key: 'transmissionMode', label: 'Mode', type: 'select', options: ['automatic', 'manual'] as const },
      { key: 'shiftUpRpm', label: 'Shift Up RPM', min: 2000, max: 10000, step: 100 },
      { key: 'shiftDownRpm', label: 'Shift Down RPM', min: 1000, max: 8000, step: 100 },
    ]},
    { key: 'aids', label: 'Driver Aids', params: [
      { key: 'tractionControl', label: 'Traction Control', type: 'boolean' },
      { key: 'stabilityControl', label: 'Stability Control', type: 'boolean' },
      { key: 'tcSlipThreshold', label: 'TC Slip Threshold', min: 0.05, max: 0.5, step: 0.01 },
      { key: 'scYawRateThreshold', label: 'SC Yaw Rate Threshold', min: 0.2, max: 2, step: 0.1 },
    ]},
  ];

  return (
    <div style={styles.garage}>
      <div style={styles.garageHeader}>
        <h2 style={styles.garageTitle}>Vehicle Configuration</h2>
        <div style={styles.garageActions}>
          <button style={styles.button} onClick={onExport}>Export Setup</button>
          <input type="file" accept=".json" onChange={onImport} style={styles.fileInput} />
          <label style={styles.button}>Import Setup</label>
        </div>
      </div>

      <div style={styles.presets}>
        <h3 style={styles.sectionTitle}>Presets</h3>
        <div style={styles.presetList}>
          {presets.map(preset => (
            <button
              key={preset.name}
              style={{ ...styles.presetButton, ...(JSON.stringify(preset.params) === JSON.stringify(vehicleParams) ? styles.presetButtonActive : {}) }}
              onClick={() => onSelectPreset(preset)}
            >
              {preset.name}
            </button>
          ))}
        </div>
      </div>

      <div style={styles.categories}>
        {categories.map(cat => (
                  <details key={cat.key} style={styles.category} open>
            <summary style={styles.categorySummary}>{cat.label}</summary>
            <div style={styles.paramGrid}>
              {cat.params.map(param => (
                <div key={param.key} style={styles.paramRow}>
                  <label style={styles.paramLabel}>{param.label}</label>
                  {param.type === 'select' ? (
                    <select
                      style={styles.paramSelect}
                                        value={vehicleParams[param.key as keyof VehicleParams] as string}
                      onChange={e => onParamChange(param.key as keyof VehicleParams, e.target.value)}
                    >
                                          {(param.options || []).map((opt: string) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  ) : param.type === 'boolean' ? (
                    <label style={styles.checkboxLabel}>
                      <input
                        type="checkbox"
                        checked={vehicleParams[param.key as keyof VehicleParams] as boolean}
                        onChange={e => onParamChange(param.key as keyof VehicleParams, e.target.checked)}
                        style={styles.checkbox}
                      />
                      <span>Enabled</span>
                    </label>
                  ) : (
                    <input
                      type="range"
                      style={styles.paramSlider}
                      min={param.min}
                      max={param.max}
                      step={param.step}
                      value={vehicleParams[param.key as keyof VehicleParams] as number}
                      onChange={e => onParamChange(param.key as keyof VehicleParams, parseFloat(e.target.value))}
                    />
                  )}
                  <span style={styles.paramValue}>
                    {typeof vehicleParams[param.key as keyof VehicleParams] === 'boolean'
                      ? (vehicleParams[param.key as keyof VehicleParams] ? 'ON' : 'OFF')
                      : typeof vehicleParams[param.key as keyof VehicleParams] === 'string'
                      ? vehicleParams[param.key as keyof VehicleParams]
                                        : (vehicleParams[param.key as keyof VehicleParams] as number).toFixed((param.type === 'range' && param.step < 1) ? 2 : 0)}
                  </span>
                </div>
              ))}
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}

// Telemetry Panel
function TelemetryPanel({ vehicle }: { vehicle: VehicleState | null }) {
  return (
    <div style={styles.panel}>
      <h2 style={styles.panelTitle}>Live Telemetry</h2>
      {vehicle && (
        <div style={styles.telemetryGrid}>
          <TelemetryCard label="Speed" value={`${vehicle.speedKph.toFixed(1)} km/h`} color="#00ccff" />
          <TelemetryCard label="RPM" value={`${Math.round(vehicle.engineRpm)}`} color="#ffaa00" />
          <TelemetryCard label="Gear" value={vehicle.currentGear === 0 ? 'N' : String(vehicle.currentGear)} color="#33cc33" />
          <TelemetryCard label="Throttle" value={`${(vehicle.throttle * 100).toFixed(0)}%`} color="#33cc33" />
          <TelemetryCard label="Brake" value={`${(vehicle.brake * 100).toFixed(0)}%`} color="#cc3333" />
          <TelemetryCard label="Steering" value={`${(vehicle.steeringInput * 100).toFixed(0)}%`} color="#00ccff" />
          <TelemetryCard label="Long G" value={vehicle.longitudinalG.toFixed(2)} color="#ffaa00" />
          <TelemetryCard label="Lat G" value={vehicle.lateralG.toFixed(2)} color="#ffaa00" />
          <TelemetryCard label="Yaw Rate" value={`${(vehicle.yawRate * 180 / Math.PI).toFixed(1)} °/s`} color="#cc3333" />
          <TelemetryCard label="Front Slip" value={`${(vehicle.frontSlipAngle * 180 / Math.PI).toFixed(1)}°`} color="#cc3333" />
          <TelemetryCard label="Rear Slip" value={`${(vehicle.rearSlipAngle * 180 / Math.PI).toFixed(1)}°`} color="#cc3333" />
          <TelemetryCard label="Status" value={vehicle.status} color={vehicle.status === 'normal' ? '#33cc33' : '#ffaa00'} />
        </div>
      )}
      <div style={styles.graphContainer}>
        <canvas width={600} height={300} style={styles.graphCanvas}></canvas>
      </div>
    </div>
  );
}

function TelemetryCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={styles.telemetryCard}>
      <div style={{ ...styles.telemetryLabel, color }}>{label}</div>
      <div style={{ ...styles.telemetryValue, color }}>{value}</div>
    </div>
  );
}

// Tests Panel
function TestsPanel({
  testState,
  records,
    onStartTest,
    onStopTest,
  }: {
    testState: TestState;
    records: TestResult[];
    onStartTest: (mode: TestState['mode']) => void;
    onStopTest: () => void;
  }) {
  const tests = [
    { id: 'acceleration', name: 'Acceleration & Braking', description: '0-100 km/h, 0-200 km/h, 100-0 braking, top speed' },
    { id: 'skidpad', name: 'Skidpad', description: 'Maximum sustained lateral acceleration, steady-state cornering' },
    { id: 'circuit', name: 'Handling Circuit', description: 'Lap time, consistency, off-track excursions' },
  ];

  return (
    <div style={styles.panel}>
      <h2 style={styles.panelTitle}>Engineering Tests</h2>

      <div style={styles.testList}>
        {tests.map(test => (
          <div key={test.id} style={styles.testCard}>
            <div>
              <h3 style={styles.testName}>{test.name}</h3>
              <p style={styles.testDesc}>{test.description}</p>
            </div>
            {testState.active && testState.mode === test.id ? (
              <button style={{ ...styles.button, ...styles.buttonDanger }} onClick={onStopTest}>
                Stop Test
              </button>
            ) : (
              <button style={styles.button} onClick={() => onStartTest(test.id as TestState['mode'])} disabled={testState.active}>
                Start Test
              </button>
            )}
          </div>
        ))}
      </div>

      {testState.active && (
        <div style={styles.activeTest}>
          <h3 style={styles.activeTestTitle}>Test in Progress: {tests.find(t => t.id === testState.mode)?.name}</h3>
          <div style={styles.activeTestStats}>
            <div>Time: {(performance.now() / 1000 - testState.startTime).toFixed(2)}s</div>
            <div>Checkpoints: {testState.checkpointsHit.length}</div>
            <div>Max Speed: {testState.maxSpeed.toFixed(1)} km/h</div>
            <div>Max Lat G: {testState.maxLateralG.toFixed(2)}</div>
            <div>Off-track: {testState.offTrackCount}</div>
          </div>
        </div>
      )}

      <h3 style={styles.sectionTitle}>Personal Records</h3>
      <div style={styles.recordsList}>
        {records.slice(-10).reverse().map((record, i) => (
          <div key={i} style={styles.recordItem}>
            <span>{record.testId.toUpperCase()}</span>
            <span>{new Date(record.timestamp).toLocaleDateString()}</span>
            {record.time0to100 && <span>0-100: {record.time0to100.toFixed(2)}s</span>}
            {record.maxLateralG && <span>Max Lat G: {record.maxLateralG.toFixed(2)}</span>}
            {record.bestLapTime && <span>Best Lap: {record.bestLapTime.toFixed(2)}s</span>}
          </div>
        ))}
        {records.length === 0 && <p style={styles.emptyRecords}>No records yet. Run a test to set a time!</p>}
      </div>
    </div>
  );
}

// Engineering Panel
function EngineeringPanel() {
  return (
    <div style={styles.panel}>
      <h2 style={styles.panelTitle}>Engineering Reference</h2>

      <details style={styles.engineeringSection} open>
        <summary style={styles.engineeringSummary}>Physics Model</summary>
        <div style={styles.engineeringContent}>
          <h4>Dynamic Bicycle Model</h4>
          <p>The simulation uses a planar dynamic bicycle model with 4 degrees of freedom:</p>
          <ul>
            <li>Longitudinal velocity (vx)</li>
            <li>Lateral velocity (vy)</li>
            <li>Yaw rate (r)</li>
            <li>Heading (ψ)</li>
          </ul>
          <p>State is integrated using semi-implicit Euler at a fixed 60 Hz timestep.</p>

          <h4>Tire Model</h4>
          <p>Nonlinear saturating tire forces using a simplified Pacejka-like formulation:</p>
          <ul>
            <li>Fy = μ·Fz·tanh(C·α / (μ·Fz)) for lateral forces</li>
            <li>Fx = μ·Fz·tanh(C·κ / (μ·Fz)) for longitudinal forces</li>
            <li>Combined slip via friction circle: √(Fx² + Fy²) ≤ μ·Fz</li>
            <li>Load-dependent grip with configurable sensitivity</li>
          </ul>

          <h4>Load Transfer</h4>
          <ul>
            <li>Longitudinal: ΔFz = m·ax·h / L</li>
            <li>Lateral: ΔFz = m·ay·h / t (per axle)</li>
            <li>Aerodynamic downforce distributed by aero balance</li>
          </ul>

          <h4>Drivetrain</h4>
          <ul>
            <li>Engine torque curve: flat torque to peak power RPM, then power-limited</li>
            <li>Gear ratios × final drive × efficiency</li>
            <li>FWD/RWD/AWD torque distribution</li>
            <li>Automatic and manual shifting</li>
          </ul>

          <h4>Aerodynamics</h4>
          <ul>
            <li>Drag: Fd = ½·ρ·Cd·A·v²</li>
            <li>Downforce: Fz = ½·ρ·Cl·A·v² (Cl negative)</li>
            <li>Configurable front/rear aero balance</li>
          </ul>
        </div>
      </details>

      <details style={styles.engineeringSection}>
        <summary style={styles.engineeringSummary}>Parameter Reference</summary>
        <div style={styles.engineeringContent}>
          <table style={styles.paramTable}>
            <thead>
              <tr><th>Parameter</th><th>Unit</th><th>Typical Range</th><th>Effect</th></tr>
            </thead>
            <tbody>
              <tr><td>Peak Power</td><td>kW</td><td>50-1000</td><td>Maximum engine power output</td></tr>
              <tr><td>Peak Torque</td><td>Nm</td><td>100-2000</td><td>Maximum engine torque</td></tr>
              <tr><td>Mass</td><td>kg</td><td>500-3000</td><td>Inertia, load transfer, braking</td></tr>
              <tr><td>Weight Distribution</td><td>%</td><td>30-70% front</td><td>Static load split, handling balance</td></tr>
              <tr><td>CG Height</td><td>m</td><td>0.2-1.5</td><td>Load transfer magnitude</td></tr>
              <tr><td>Friction Coefficient</td><td>-</td><td>0.3-2.0</td><td>Tire-road grip limit</td></tr>
              <tr><td>Downforce Coeff</td><td>-</td><td>-3 to 0.5</td><td>High-speed grip vs drag trade-off</td></tr>
              <tr><td>Drag Coefficient</td><td>-</td><td>0.1-1.5</td><td>Top speed, high-speed stability</td></tr>
              <tr><td>Brake Bias</td><td>%</td><td>30-90% front</td><td>Braking stability vs stopping distance</td></tr>
            </tbody>
          </table>
        </div>
      </details>

      <details style={styles.engineeringSection}>
        <summary style={styles.engineeringSummary}>Known Approximations</summary>
        <div style={styles.engineeringContent}>
          <ul>
            <li>Bicycle model assumes symmetric left/right tires (no individual wheel lateral forces)</li>
            <li>Roll dynamics not explicitly modeled; load transfer uses steady-state approximation</li>
            <li>Engine torque curve is simplified (no turbo lag, no detailed mapping)</li>
            <li>Differential not modeled (open diff assumed for AWD)</li>
            <li>Suspension kinematics not simulated (fixed camber/toe)</li>
            <li>Tire temperature and wear not modeled</li>
            <li>No driveline compliance or torsional vibration</li>
            <li>Steering system compliance not modeled</li>
          </ul>
          <p>These simplifications keep the simulation real-time on browser hardware while preserving the key engineering trade-offs.</p>
        </div>
      </details>

      <details style={styles.engineeringSection}>
        <summary style={styles.engineeringSummary}>Validation Tests</summary>
        <div style={styles.engineeringContent}>
          <p>Run <code>npm run test:physics</code> to execute deterministic physics validation:</p>
          <ol>
            <li>Stationary vehicle remains stationary</li>
            <li>Drag opposes velocity</li>
            <li>Mass reduces acceleration under same force</li>
            <li>Braking reduces speed</li>
            <li>Symmetric vehicle produces no spontaneous yaw</li>
            <li>Tire forces bounded by friction limit</li>
            <li>Downforce increases available tire force</li>
            <li>Fixed timestep consistency at 30/60 FPS</li>
          </ol>
        </div>
      </details>
    </div>
  );
}

// Styles
const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    background: '#0d0d1a',
    color: '#fff',
    fontFamily: '"JetBrains Mono", "Fira Code", monospace',
    overflow: 'hidden',
  },
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
    gap: '16px',
  },
  loadingSpinner: {
    width: '48px',
    height: '48px',
    border: '3px solid #1a1a3e',
    borderTopColor: '#00ccff',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  loadingText: { fontSize: '24px', fontWeight: 'bold', color: '#00ccff' },
  loadingSubtext: { color: '#888' },
  header: {
    padding: '12px 24px',
    background: 'rgba(15, 15, 30, 0.95)',
    borderBottom: '1px solid #1a1a3e',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  title: { margin: 0, fontSize: '20px', color: '#00ccff', letterSpacing: '2px' },
  tabBar: { display: 'flex', gap: '4px' },
  tabButton: {
    padding: '8px 16px',
    background: 'transparent',
    border: '1px solid #1a1a3e',
    borderRadius: '4px',
    color: '#888',
    fontSize: '12px',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  tabButtonActive: {
    background: '#00ccff',
    borderColor: '#00ccff',
    color: '#0d0d1a',
    fontWeight: 'bold',
  },
  main: { flex: 1, display: 'flex', overflow: 'hidden' },
  driveContainer: { flex: 1, position: 'relative' },
  canvas: { width: '100%', height: '100%', display: 'block' },
  telemetryCanvas: {
    position: 'absolute',
    bottom: '120px',
    right: '20px',
    background: 'rgba(10, 10, 20, 0.8)',
    border: '1px solid #1a1a3e',
    borderRadius: '4px',
  },
  hud: {
    position: 'absolute',
    bottom: '20px',
    left: '20px',
    background: 'rgba(10, 10, 20, 0.9)',
    border: '1px solid #1a1a3e',
    borderRadius: '8px',
    padding: '16px',
    minWidth: '280px',
  },
  hudRow: { display: 'flex', gap: '24px', marginBottom: '12px' },
  hudItem: { textAlign: 'center', minWidth: '70px' },
  hudValue: { fontSize: '24px', fontWeight: 'bold', color: '#00ccff' },
  hudLabel: { fontSize: '10px', color: '#888', textTransform: 'uppercase', letterSpacing: '1px' },
  inputIndicators: { display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #1a1a3e' },
  inputBar: { height: '6px', background: '#333', borderRadius: '3px', transition: 'width 0.1s' },
  aids: { display: 'flex', gap: '8px', marginTop: '12px' },
  aidBadge: { padding: '2px 8px', fontSize: '10px', fontWeight: 'bold', borderRadius: '3px', color: '#0d0d1a' },
  garage: { flex: 1, padding: '24px', overflow: 'auto', background: '#0d0d1a' },
  garageHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' },
  garageTitle: { margin: 0, color: '#00ccff' },
  garageActions: { display: 'flex', gap: '12px', alignItems: 'center' },
  presets: { marginBottom: '24px' },
  sectionTitle: { color: '#ffaa00', fontSize: '14px', marginBottom: '12px' },
  presetList: { display: 'flex', gap: '8px', flexWrap: 'wrap' },
  presetButton: {
    padding: '8px 16px',
    background: '#1a1a3e',
    border: '1px solid #2a2a4e',
    borderRadius: '4px',
    color: '#fff',
    fontSize: '12px',
    cursor: 'pointer',
  },
  presetButtonActive: { background: '#00ccff', borderColor: '#00ccff', color: '#0d0d1a', fontWeight: 'bold' },
  categories: { display: 'flex', flexDirection: 'column', gap: '16px' },
  category: { background: '#151525', border: '1px solid #1a1a3e', borderRadius: '8px', overflow: 'hidden' },
  categorySummary: { padding: '12px 16px', background: '#1a1a3e', cursor: 'pointer', color: '#ffaa00', fontWeight: 'bold' },
  paramGrid: { padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' },
  paramRow: { display: 'flex', alignItems: 'center', gap: '12px' },
  paramLabel: { width: '200px', fontSize: '13px', color: '#ccc' },
  paramSlider: { flex: 1, maxWidth: '300px', accentColor: '#00ccff' },
  paramSelect: { padding: '4px 8px', background: '#0d0d1a', border: '1px solid #2a2a4e', borderRadius: '4px', color: '#fff', fontSize: '13px' },
  paramValue: { width: '80px', textAlign: 'right', fontFamily: 'monospace', color: '#00ccff', fontSize: '13px' },
  checkboxLabel: { display: 'flex', alignItems: 'center', gap: '8px', color: '#ccc' },
  checkbox: { accentColor: '#00ccff' },
  button: {
    padding: '8px 16px',
    background: '#1a1a3e',
    border: '1px solid #2a2a4e',
    borderRadius: '4px',
    color: '#fff',
    fontSize: '13px',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  buttonDanger: { background: '#cc3333', borderColor: '#cc3333' },
  fileInput: { display: 'none' },
  panel: { flex: 1, padding: '24px', overflow: 'auto', background: '#0d0d1a' },
  panelTitle: { color: '#00ccff', marginBottom: '24px' },
  telemetryGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '12px', marginBottom: '24px' },
  telemetryCard: { background: '#151525', border: '1px solid #1a1a3e', borderRadius: '8px', padding: '16px', textAlign: 'center' },
  telemetryLabel: { fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' },
  telemetryValue: { fontSize: '18px', fontWeight: 'bold' },
  graphContainer: { background: '#151525', border: '1px solid #1a1a3e', borderRadius: '8px', padding: '16px' },
  graphCanvas: { width: '100%', height: '300px' },
  testList: { display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' },
  testCard: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#151525', border: '1px solid #1a1a3e', borderRadius: '8px', padding: '16px' },
  testName: { margin: '0 0 4px', color: '#00ccff' },
  testDesc: { margin: 0, fontSize: '12px', color: '#888' },
  activeTest: { background: '#1a1a3e', border: '1px solid #00ccff', borderRadius: '8px', padding: '16px', marginBottom: '24px' },
  activeTestTitle: { margin: '0 0 12px', color: '#00ccff' },
  activeTestStats: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '8px', fontSize: '13px' },
  recordsList: { display: 'flex', flexDirection: 'column', gap: '8px' },
  recordItem: { display: 'flex', gap: '16px', padding: '12px', background: '#151525', border: '1px solid #1a1a3e', borderRadius: '4px', fontSize: '13px' },
  emptyRecords: { color: '#888', textAlign: 'center', padding: '24px' },
  engineeringSection: { background: '#151525', border: '1px solid #1a1a3e', borderRadius: '8px', marginBottom: '16px', overflow: 'hidden' },
  engineeringSummary: { padding: '16px', background: '#1a1a3e', cursor: 'pointer', color: '#ffaa00', fontWeight: 'bold', fontSize: '14px' },
  engineeringContent: { padding: '16px', color: '#ccc', lineHeight: '1.7' },
  paramTable: { width: '100%', borderCollapse: 'collapse', fontSize: '13px' },
  paramTableTh: { textAlign: 'left', padding: '8px', borderBottom: '1px solid #2a2a4e', color: '#ffaa00' },
  paramTableTd: { padding: '8px', borderBottom: '1px solid #1a1a3e' },
  tutorialOverlay: { position: 'fixed', inset: 0, background: 'rgba(0, 0, 0, 0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  tutorialBox: { background: '#151525', border: '1px solid #2a2a4e', borderRadius: '12px', padding: '32px', maxWidth: '500px', textAlign: 'center' },
  tutorialTitle: { margin: '0 0 16px', color: '#00ccff' },
  tutorialText: { margin: '0 0 24px', lineHeight: '1.6', color: '#ccc' },
  tutorialNav: { display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '16px' },
  tutorialButton: { padding: '8px 24px', background: '#1a1a3e', border: '1px solid #2a2a4e', borderRadius: '4px', color: '#fff', cursor: 'pointer' },
  tutorialStep: { color: '#888', fontSize: '13px' },
  pauseOverlay: { position: 'fixed', inset: 0, background: 'rgba(0, 0, 0, 0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  pauseBox: { background: '#151525', border: '1px solid #2a2a4e', borderRadius: '12px', padding: '32px', textAlign: 'center', minWidth: '280px' },
  pauseTitle: { margin: '0 0 24px', color: '#00ccff' },
  pauseButton: { display: 'block', width: '100%', marginBottom: '12px', padding: '12px', background: '#1a1a3e', border: '1px solid #2a2a4e', borderRadius: '4px', color: '#fff', fontSize: '14px', cursor: 'pointer' },
};

export default Game;