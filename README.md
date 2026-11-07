# Vehicle Dynamics Lab

A browser-based vehicle engineering and driving game with realistic physics simulation. Drive a customizable car on a test facility, adjust mechanical and aerodynamic parameters, and discover the engineering trade-offs between acceleration, top speed, handling, braking, stability, and energy consumption.

## Features

- **Realistic Physics**: Dynamic bicycle model with longitudinal/lateral dynamics, load transfer, nonlinear tire saturation, aerodynamics, and drivetrain
- **Vehicle Engineering Garage**: 30+ adjustable parameters across 7 categories (Powertrain, Chassis, Tires, Aerodynamics, Braking/Steering, Transmission, Driver Aids)
- **Three Engineering Tests**: Acceleration/Braking, Skidpad, Handling Circuit with checkpoint validation
- **Live Telemetry**: Real-time graphs of speed, lateral G, steering input with ring buffer
- **Persistence**: localStorage for vehicle setups, presets, personal records, and settings
- **Offline Support**: Service Worker caching for offline play
- **Dynamic Low-Poly Visuals**: Faceted procedural geometry, flat shading, electric blue/amber/charcoal palette

## Quick Start

```bash
# Install dependencies
npm install

# Development server
npm run dev

# Production build
npm run build

# Run physics validation tests
npm run test:physics

# Preview production build
npm run preview
```

## Controls

| Key | Action |
|-----|--------|
| W / ↑ | Accelerate |
| S / ↓ | Brake / Reverse |
| A / ← | Steer Left |
| D / → | Steer Right |
| Space | Handbrake |
| Q | Shift Down |
| E | Shift Up |
| R | Reset Vehicle |
| C | Cycle Camera |
| Esc | Pause |

## Physics Model

The simulation uses a **planar dynamic bicycle model** with 4 degrees of freedom:
- Longitudinal velocity (vx)
- Lateral velocity (vy)
- Yaw rate (r)
- Heading (ψ)

### Key Equations

**Aerodynamic Drag**: `Fd = ½·ρ·Cd·A·v²`

**Downforce**: `Fz = ½·ρ·Cl·A·v²` (Cl negative)

**Yaw Acceleration**: `ṙ = Mz / Iz`

**Tire Forces** (simplified Pacejka):
- Lateral: `Fy = μ·Fz·tanh(C·α / (μ·Fz))`
- Longitudinal: `Fx = μ·Fz·tanh(C·κ / (μ·Fz))`
- Combined: `√(Fx² + Fy²) ≤ μ·Fz`

**Load Transfer**:
- Longitudinal: `ΔFz = m·ax·h / L`
- Lateral (per axle): `ΔFz = m·ay·h / t`

Integration: Semi-implicit Euler at fixed 60 Hz timestep.

## Vehicle Parameters

### Powertrain
- Peak Power (kW), Peak Torque (Nm), Redline (RPM)
- Gear Ratios (6-speed), Final Drive Ratio
- Drivetrain: FWD/RWD/AWD, Efficiency

### Chassis
- Mass (kg), Weight Distribution (% front)
- Wheelbase (m), CG Height (m)
- Yaw Inertia (calculated)

### Tires
- Compound: Economy/Touring/Sport/Racing
- Friction Coefficient, Front Grip Bias
- Cornering Stiffness (N/rad)

### Aerodynamics
- Drag Coefficient (Cd), Frontal Area (m²)
- Downforce Coefficient (Cl), Aero Balance (% front)

### Braking & Steering
- Max Brake Force (N), Brake Bias (% front)
- Max Steer Angle (rad), Steer Rate (rad/s)

### Transmission
- Automatic/Manual mode
- Shift Up/Down RPM

### Driver Aids
- Traction Control (torque reduction)
- Stability Control (corrective braking)
- Intervention thresholds

## Presets

1. **Balanced** - Good all-rounder for learning
2. **Drift Missile** - High power, loose rear, no aids - for drifting
3. **Grip Monster** - High downforce, racing tires, drag penalty - for circuit speed

## Test Facility

The facility includes:
- **1.2km Straight** - Acceleration and braking tests
- **Skidpad** - 30m radius circle for lateral grip
- **Slalom** - Cone weave for transient response
- **Handling Circuit** - Figure-8 with fast/slow corners
- **Low-Grip Zone** - Reduced friction section on straight

## Persistence

All data stored in `localStorage`:
- Current vehicle configuration
- Named custom presets
- Personal best records (with vehicle config snapshots)
- Game settings (units, camera, graphics, etc.)
- Export/import as JSON

## Deployment

### Cloudflare Pages

1. Connect repository to Cloudflare Pages
2. Build command: `npm run build`
3. Output directory: `dist`
4. No environment variables needed

The game is fully static - no backend, no server-side rendering, no API calls.

### Manual Deployment

```bash
npm run build
# Upload dist/ folder to any static host (Netlify, Vercel, GitHub Pages, etc.)
```

## Development

### Project Structure

```
src/
├── types.ts              # Shared type contracts (SI units)
├── main.tsx              # Entry point
├── physics/
│   ├── engine.ts         # Bicycle model, tire model, drivetrain
│   ├── validation.test.ts # Deterministic physics tests
│   └── index.ts
├── rendering/
│   ├── renderer.ts       # Canvas 2D, camera, car, track, particles
│   └── index.ts
├── tracks/
│   ├── track.ts          # Facility geometry, checkpoints, test logic
│   └── index.ts
├── ui/
│   ├── Game.tsx          # Main React component with all tabs
│   └── index.ts
└── platform/
    ├── storage.ts        # localStorage, import/export, service worker
    └── index.ts
public/
├── sw.js                 # Service Worker
├── manifest.json         # PWA manifest
└── favicon.svg
```

### Running Tests

```bash
npm run test:physics
```

Validates 10 physical invariants:
1. Stationary vehicle remains stationary
2. Drag opposes velocity
3. Mass reduces acceleration
4. Braking reduces speed
5. No spontaneous yaw
6. Tire forces bounded by friction
7. Downforce increases grip
8. Timestep consistency (30/60 FPS)
9. Extreme settings stable
10. Reset produces valid state

## Known Limitations

- Bicycle model (no individual left/right tire forces)
- Quasi-static load transfer (no dynamic roll)
- Simplified engine torque curve
- Open differential only (no LSD)
- Fixed suspension geometry
- No tire temperature/wear
- No collision physics
- No audio

See `decision.md` for full design rationale and `log.md` for build history.

## License

MIT License - Feel free to use for learning, modification, or commercial projects.