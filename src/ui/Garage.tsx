import { useState } from 'react';
import type { Drivetrain, GaragePreset, TireCompound, Transmission, VehicleParams } from '../types';

export interface GarageProps {
  params: VehicleParams;
  presets: GaragePreset[];
  onSetParams: (next: Partial<VehicleParams>) => void;
  onLoadPreset: (preset: GaragePreset) => void;
  onAddPreset: (preset: GaragePreset) => void;
  onRemovePreset: (name: string) => void;
}

export default function Garage({ params, presets, onSetParams, onLoadPreset, onAddPreset, onRemovePreset }: GarageProps) {
  const [newPresetName, setNewPresetName] = useState('');
  const [newPresetDesc, setNewPresetDesc] = useState('');

  const set = (key: keyof VehicleParams, value: number | string) => {
    onSetParams({ [key]: value } as Partial<VehicleParams>);
  };

  return (
    <div className="garage-panel">
      <h2>Garage</h2>
      <p>Tune real physics parameters. Changes apply immediately to the simulation.</p>

      <div className="garage-section">
        <h3>Presets</h3>
        <div className="preset-grid">
          {presets.map((p) => (
            <div key={p.name} className="preset-card">
              <div className="preset-name">{p.name}</div>
              <div className="preset-desc">{p.description}</div>
              <div className="preset-actions">
                <button className="btn" onClick={() => onLoadPreset(p)}>Load</button>
                <button className="btn btn-outline" onClick={() => onRemovePreset(p.name)}>Remove</button>
              </div>
            </div>
          ))}
        </div>
        <div className="save-preset">
          <input
            value={newPresetName}
            onChange={(e) => setNewPresetName(e.target.value)}
            placeholder="Preset name"
          />
          <input
            value={newPresetDesc}
            onChange={(e) => setNewPresetDesc(e.target.value)}
            placeholder="Description"
          />
          <button className="btn" onClick={() => {
            if (!newPresetName.trim()) return;
            onAddPreset({
              name: newPresetName.trim(),
              description: newPresetDesc.trim(),
              params: { ...params },
            });
            setNewPresetName('');
            setNewPresetDesc('');
          }}>
            Save Current as Preset
          </button>
        </div>
      </div>

      <div className="garage-section">
        <h3>Chassis</h3>
        <div className="slider-row">
          <label>Mass (kg)</label>
          <input
            type="range" min="800" max="2200" step="50"
            value={params.mass}
            onChange={(e) => set('mass', Number(e.target.value))}
          />
          <span>{params.mass}</span>
        </div>
        <div className="slider-row">
          <label>Weight dist. front (0&ndash;1)</label>
          <input
            type="range" min="0.4" max="0.7" step="0.01"
            value={params.weightDistributionFront}
            onChange={(e) => set('weightDistributionFront', Number(e.target.value))}
          />
          <span>{params.weightDistributionFront.toFixed(2)}</span>
        </div>
        <div className="slider-row">
          <label>Wheelbase (m)</label>
          <input
            type="range" min="2.2" max="3.4" step="0.1"
            value={params.wheelbase}
            onChange={(e) => set('wheelbase', Number(e.target.value))}
          />
          <span>{params.wheelbase.toFixed(1)}</span>
        </div>
        <div className="slider-row">
          <label>CoG height (m)</label>
          <input
            type="range" min="0.35" max="0.75" step="0.01"
            value={params.cogHeight}
            onChange={(e) => set('cogHeight', Number(e.target.value))}
          />
          <span>{params.cogHeight.toFixed(2)}</span>
        </div>
      </div>

      <div className="garage-section">
        <h3>Powertrain</h3>
        <div className="slider-row">
          <label>Peak power (kW)</label>
          <input
            type="range" min="80" max="400" step="10"
            value={params.peakPowerKw}
            onChange={(e) => set('peakPowerKw', Number(e.target.value))}
          />
          <span>{params.peakPowerKw}</span>
        </div>
        <div className="slider-row">
          <label>Peak torque (Nm)</label>
          <input
            type="range" min="150" max="600" step="10"
            value={params.peakTorqueNm}
            onChange={(e) => set('peakTorqueNm', Number(e.target.value))}
          />
          <span>{params.peakTorqueNm}</span>
        </div>
        <div className="slider-row">
          <label>Redline (RPM)</label>
          <input
            type="range" min="5000" max="9000" step="500"
            value={params.redlineRpm}
            onChange={(e) => set('redlineRpm', Number(e.target.value))}
          />
          <span>{params.redlineRpm}</span>
        </div>
        <div className="slider-row">
          <label>Final drive</label>
          <input
            type="range" min="2.5" max="5.0" step="0.1"
            value={params.finalDrive}
            onChange={(e) => set('finalDrive', Number(e.target.value))}
          />
          <span>{params.finalDrive.toFixed(1)}</span>
        </div>
        <div className="slider-row">
          <label>Drivetrain efficiency</label>
          <input
            type="range" min="0.7" max="0.98" step="0.01"
            value={params.drivetrainEfficiency}
            onChange={(e) => set('drivetrainEfficiency', Number(e.target.value))}
          />
          <span>{params.drivetrainEfficiency.toFixed(2)}</span>
        </div>
        <div className="slider-row">
          <label>Drivetrain</label>
          <select
            value={params.drivetrain}
            onChange={(e) => set('drivetrain', e.target.value as Drivetrain)}
          >
            <option value="FWD">FWD</option>
            <option value="RWD">RWD</option>
            <option value="AWD">AWD</option>
          </select>
        </div>
        <div className="slider-row">
          <label>Transmission</label>
          <select
            value={params.transmission}
            onChange={(e) => set('transmission', e.target.value as Transmission)}
          >
            <option value="auto">Automatic</option>
            <option value="manual">Manual</option>
          </select>
        </div>
      </div>

      <div className="garage-section">
        <h3>Tires &amp; Grip</h3>
        <div className="slider-row">
          <label>Compound</label>
          <select
            value={params.tireCompound}
            onChange={(e) => set('tireCompound', e.target.value as TireCompound)}
          >
            <option value="economy">Economy</option>
            <option value="touring">Touring</option>
            <option value="sport">Sport</option>
            <option value="racing">Racing</option>
          </select>
        </div>
        <div className="slider-row">
          <label>Friction coefficient (&mu;)</label>
          <input
            type="range" min="0.3" max="1.3" step="0.05"
            value={params.frictionCoefficient}
            onChange={(e) => set('frictionCoefficient', Number(e.target.value))}
          />
          <span>{params.frictionCoefficient.toFixed(2)}</span>
        </div>
        <div className="slider-row">
          <label>Cornering stiffness (N/rad)</label>
          <input
            type="range" min="25000" max="90000" step="1000"
            value={params.corneringStiffness}
            onChange={(e) => set('corneringStiffness', Number(e.target.value))}
          />
          <span>{params.corneringStiffness}</span>
        </div>
        <div className="slider-row">
          <label>Grip balance front (0&ndash;1)</label>
          <input
            type="range" min="0.3" max="0.7" step="0.01"
            value={params.gripBalanceFront}
            onChange={(e) => set('gripBalanceFront', Number(e.target.value))}
          />
          <span>{params.gripBalanceFront.toFixed(2)}</span>
        </div>
      </div>

      <div className="garage-section">
        <h3>Aerodynamics</h3>
        <div className="slider-row">
          <label>Drag coefficient (C<sub>d</sub>)</label>
          <input
            type="range" min="0.2" max="0.5" step="0.01"
            value={params.cd}
            onChange={(e) => set('cd', Number(e.target.value))}
          />
          <span>{params.cd.toFixed(2)}</span>
        </div>
        <div className="slider-row">
          <label>Frontal area (m&sup2;)</label>
          <input
            type="range" min="1.5" max="3.0" step="0.1"
            value={params.frontalArea}
            onChange={(e) => set('frontalArea', Number(e.target.value))}
          />
          <span>{params.frontalArea.toFixed(1)}</span>
        </div>
        <div className="slider-row">
          <label>Downforce coefficient</label>
          <input
            type="range" min="0" max="5.0" step="0.1"
            value={params.downforceCoefficient}
            onChange={(e) => set('downforceCoefficient', Number(e.target.value))}
          />
          <span>{params.downforceCoefficient.toFixed(1)}</span>
        </div>
        <div className="slider-row">
          <label>Aero balance front (0&ndash;1)</label>
          <input
            type="range" min="0.3" max="0.7" step="0.01"
            value={params.aeroBalanceFront}
            onChange={(e) => set('aeroBalanceFront', Number(e.target.value))}
          />
          <span>{params.aeroBalanceFront.toFixed(2)}</span>
        </div>
      </div>

      <div className="garage-section">
        <h3>Braking &amp; Steering</h3>
        <div className="slider-row">
          <label>Max brake force (N)</label>
          <input
            type="range" min="5000" max="14000" step="500"
            value={params.maxBrakeForce}
            onChange={(e) => set('maxBrakeForce', Number(e.target.value))}
          />
          <span>{params.maxBrakeForce}</span>
        </div>
        <div className="slider-row">
          <label>Brake bias front (0&ndash;1)</label>
          <input
            type="range" min="0.5" max="0.8" step="0.01"
            value={params.brakeBiasFront}
            onChange={(e) => set('brakeBiasFront', Number(e.target.value))}
          />
          <span>{params.brakeBiasFront.toFixed(2)}</span>
        </div>
        <div className="slider-row">
          <label>Max steer angle (rad)</label>
          <input
            type="range" min="0.4" max="1.0" step="0.05"
            value={params.maxSteerAngle}
            onChange={(e) => set('maxSteerAngle', Number(e.target.value))}
          />
          <span>{params.maxSteerAngle.toFixed(2)}</span>
        </div>
        <div className="slider-row">
          <label>Steer rate (rad/s)</label>
          <input
            type="range" min="1.0" max="5.0" step="0.1"
            value={params.steerRate}
            onChange={(e) => set('steerRate', Number(e.target.value))}
          />
          <span>{params.steerRate.toFixed(1)}</span>
        </div>
        <div className="slider-row">
          <label>Wheel radius (m)</label>
          <input
            type="range" min="0.28" max="0.40" step="0.01"
            value={params.wheelRadius}
            onChange={(e) => set('wheelRadius', Number(e.target.value))}
          />
          <span>{params.wheelRadius.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}
