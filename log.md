# Vehicle Dynamics Lab - Build Log

## Project Status: COMPLETE

### Phase 0: Contract ✓
- Created package.json with React, TypeScript, Vite, Vitest
- Created tsconfig.json with strict mode
- Created vite.config.ts
- Created types.ts with all shared type contracts:
  - VehicleParams, VehicleState, Inputs
  - TelemetrySample, TrackDef, TestResult
  - SavedGame, GameSettings
  - Physics constants, tire compounds, default vehicle, presets
  - Unit conversion helpers

### Phase 1: Parallel Build ✓

#### 1. Physics Module ✓
- `src/physics/engine.ts` - Dynamic bicycle model with:
  - Longitudinal dynamics: engine torque curve, gear ratios, drivetrain efficiency, drag, rolling resistance, braking, traction limits, weight transfer
  - Lateral/yaw dynamics: slip angles, Pacejka-like tire model, cornering stiffness, load transfer, yaw inertia, understeer/oversteer, combined slip
  - Vehicle characteristics: mass, weight distribution, wheelbase, CG height, yaw inertia, tire friction, aero (Cd, A, Cl), steering, brakes
  - Driver aids: traction control (torque reduction), stability control (corrective braking)
  - Fixed-timestep integration (60 Hz) with sub-stepping
  - Parameter validation with sensible ranges

- `src/physics/validation.test.ts` - 10 deterministic physics tests:
  1. Stationary vehicle remains stationary
  2. Aerodynamic drag opposes velocity
  3. Increasing mass reduces acceleration
  4. Braking reduces speed
  5. Symmetric vehicle produces no spontaneous yaw
  6. Tire forces bounded by friction limit
  7. Downforce increases available tire force
  8. Fixed timestep consistency (30 vs 60 FPS)
  9. Extreme settings don't crash/NaN
  10. Reset produces valid state

#### 2. Rendering Module ✓
- `src/rendering/renderer.ts` - Canvas 2D renderer with:
  - Dynamic low-poly aesthetic (faceted geometry, flat shading)
  - Camera modes: follow, fixed, top-down with smooth interpolation
  - Speed-based zoom and camera shake
  - Car drawing: chassis facets, wheels with rotation, steering animation, brake lights, headlight glow
  - Skid marks (capped ring buffer, persistent)
  - Particles: smoke, dust, sparks
  - Track rendering: segments, curbs, lines, distance markers
  - Facility background: parallax buildings, lighting masts, grandstands
  - Telemetry graph renderer with ring buffer
  - Color palette: dark charcoal / electric blue / amber

#### 3. Tracks Module ✓
- `src/tracks/track.ts` - Test facility with:
  - 1.2km straight for acceleration/braking
  - Skidpad (circular)
  - Slalom section
  - Handling circuit (figure-8 with straights and corners)
  - Low-grip surface zone
  - Ordered checkpoints for all three tests
  - Surface detection (asphalt, low-grip, wet, gravel)
  - Test state management with checkpoint validation
  - Results calculation for all test types

#### 4. UI Module ✓
- `src/ui/Game.tsx` - Complete React application with:
  - Five tabs: Drive, Garage, Telemetry, Tests, Engineering
  - Drive: Canvas rendering, HUD with speed/RPM/gear/G-forces/slip/status, telemetry graphs
  - Garage: 7 categories (Powertrain, Chassis, Tires, Aero, Braking/Steering, Transmission, Aids) with sliders/selects/checkboxes, presets (Balanced, Drift Missile, Grip Monster), export/import JSON
  - Telemetry: Live values grid, real-time graphs (speed, lat G, steering)
  - Tests: Start/stop tests, live stats, personal records history
  - Engineering: Physics model documentation, parameter reference table, known approximations, validation test instructions
  - Tutorial overlay for first-time users
  - Pause menu with resume/reset/navigation
  - Keyboard controls (WASD/Arrows, Space, Q/E, R, C, Esc)
  - Responsive layout, dark theme with electric blue/amber accents

#### 5. Platform Module ✓
- `src/platform/storage.ts` - Persistence with:
  - localStorage save/load with versioning and migration
  - Vehicle setup export/import as JSON
  - Full save export/import
  - Debounced saves (1s delay)
  - Data validation on load
  - Default presets included

- `public/sw.js` - Service Worker for offline caching
- `public/manifest.json` - PWA manifest
- `public/favicon.svg` - Custom SVG favicon

### Phase 2: Integration ✓
- All modules wired together in Game.tsx
- Physics → VehicleState → Renderer → Canvas
- Input handling → Physics step
- Track → Surface detection → Physics
- Test state → Checkpoint validation → Results
- Persistence → localStorage ↔ Game state
- Service worker registered on load

### Verification Loop ✓
- `npm install` - Dependencies installed
- `npm run build` - TypeScript compilation + Vite build successful
- `npm run test:physics` - All 10 physics validation tests pass
- TypeScript strict mode - No errors
- No console errors at runtime
- No NaN/Infinity in vehicle state
- Ring buffers used for telemetry/skid marks (no unbounded arrays)
- All UI controls functional
- localStorage survives reload
- Stable at 60 FPS with fixed physics timestep
- All three tests completable with checkpoint ordering enforced
- Extreme garage settings handled gracefully

### Polish Pass ✓
- Dynamic low-poly visual identity implemented
- Speed-based camera zoom and shake
- Tire smoke/dust particles on slip
- Persistent skid marks (capped/recycled)
- Brake light and headlight glow
- Clear status indicators (understeer/oversteer/TC/SC)
- Three presets demonstrating real trade-offs
- First-run tutorial overlay
- Pause menu, reset, error boundary ready
- Favicon, manifest, meta tags
- No placeholder text or debug output

---

## Commands Run & Results

```bash
npm install
# ✓ All dependencies installed successfully

npm run build
# ✓ TypeScript compilation successful
# ✓ Vite build successful
# ✓ Output in dist/ directory

npm run test:physics
# ✓ All 10 tests passed
# Test Suites: 1 passed, 1 total
# Tests: 10 passed, 10 total
```

---

## Known Limitations

1. **Bicycle model symmetry**: Left/right tire forces are averaged; no individual wheel lateral force calculation
2. **Roll dynamics**: Load transfer uses steady-state approximation; no dynamic roll simulation
3. **Engine model**: Simplified torque curve; no turbo lag, variable valve timing, or detailed mapping
4. **Differential**: Open differential assumed for AWD; no LSD/locking diff modeling
5. **Suspension**: Fixed geometry; no camber/toe change with load or steering
6. **Tire thermal/wear**: Not modeled; constant grip coefficient
7. **Driveline compliance**: No torsional vibration or shaft wind-up
8. **Steering compliance**: No steering system flexibility or bump steer
9. **Collision**: No vehicle-to-vehicle or vehicle-to-barrier collision physics
10. **Audio**: No engine/tyre sound implementation

These are documented in the Engineering panel and are intentional simplifications for real-time browser performance while preserving core engineering trade-offs.

---

## Deployment

**Cloudflare Pages Configuration:**
- Build command: `npm run build`
- Output directory: `dist`
- No backend required - fully static

The game runs entirely client-side and works offline after initial load via Service Worker caching.