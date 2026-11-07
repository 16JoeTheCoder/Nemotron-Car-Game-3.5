# Nemotron-Car-Game-3.5 — Vehicle Dynamics Lab

A browser-based vehicle engineering and driving simulation built with React, TypeScript, Vite, and HTML5 Canvas 2D. Features a dynamic bicycle-model physics simulation in SI units, a garage for tuning real vehicle parameters, a telemetry HUD, three test challenges, localStorage persistence, and a service worker for offline use.

## Stack

- React 19 + TypeScript + Vite
- HTML5 Canvas 2D rendering
- Bicycle-model physics (SI units: m, kg, s, N, rad)
- localStorage persistence with JSON import/export
- Service worker (offline caching)
- Deployable to Cloudflare Pages

## Getting Started

```bash
# Install dependencies
npm install

# Run dev server
npm run dev

# Typecheck
npm run typecheck

# Run physics validation tests
npm run test:physics

# Build for production
npm run build

# Preview production build
npm run preview
```

## Features

### Drive
- Test drive your vehicle on procedural tracks (speed strip, skidpad, slalom, handling circuit)
- WASD / arrow keys to drive, Space for handbrake, Q/E to shift, R to reset
- Real-time telemetry HUD with speed, RPM, gear, g-forces, slip angles, grip utilization
- Three test challenges:
  - **A: Acceleration & Braking** — 0–100 km/h time, 100–0 braking distance
  - **B: Skidpad** — maximum sustained lateral acceleration
  - **C: Handling Circuit** — best lap time over 3 laps with off-track incident counting

### Garage
- Tune real physics parameters: mass, weight distribution, wheelbase, CoG height, power, torque, gearing, drivetrain (FWD/RWD/AWD), tire compound, friction, aerodynamics, braking, steering
- Save/load/remove presets

### Telemetry
- Live telemetry grid with color-coded status (normal / understeer / oversteer / traction limited / wheel lock)
- Speed history graph (ring buffer of 300 samples)

### Tests
- Challenge descriptions and results table
- Results saved with setup hash for comparison

### Engineering
- Physics model documentation, unit conventions, test descriptions, persistence and deployment info

## Physics Model

- **Bicycle model** with longitudinal/lateral motion, yaw rate, and driven-axle wheel inertia
- **Tire model**: linear cornering stiffness saturated by friction circle; combined slip reduces lateral capacity
- **Engine**: flat peak torque to 50% redline, then constant power
- **Drivetrain**: FWD/RWD/AWD with traction-dependent force distribution
- **Integration**: semi-implicit Euler, fixed 1/60s timestep, max 4 substeps per frame
- All SI units internally; km/h, °/s, % only at the UI boundary

## Persistence

- State saved to `localStorage` under key `vehicle-dynamics-lab:v1`
- Debounced saves (800ms) on state change
- JSON export/import for backup and sharing

## Deployment

### Cloudflare Pages

```bash
# Install wrangler
npm install -g wrangler

# Build and deploy
npm run build
wrangler pages deploy dist
```

Or connect your GitHub repo to Cloudflare Pages for automatic deploys.

### Other static hosts

The `dist/` folder is a static site — deploy to any static hosting (Netlify, Vercel, GitHub Pages, etc.).

## Project Structure

```
src/
  physics/       — Bicycle model + validation tests
  tracks/        — Track geometry + test mode manager
  rendering/     — Camera + Canvas 2D renderer
  ui/            — React components (App, Drive, Garage, Telemetry, Tests, Engineering)
  platform/      — localStorage persistence layer
  main.tsx       — Entry point + service worker registration
public/
  sw.js          — Service worker for offline caching
  favicon.svg    — App favicon
```

## License

MIT
