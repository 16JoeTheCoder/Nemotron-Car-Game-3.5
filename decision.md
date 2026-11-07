# Vehicle Dynamics Lab - Design Decisions

## Architecture Decisions

### 1. Module Structure
**Decision**: Separate modules for physics, rendering, tracks, UI, platform with strict TypeScript interfaces in `types.ts`.
**Reason**: Enables parallel development, clear ownership, and contract-first development. Each module can be tested independently.

### 2. Physics Timestep
**Decision**: Fixed 60 Hz physics timestep (16.67ms) with semi-implicit Euler integration, max 4 sub-steps per frame.
**Reason**: Deterministic simulation, stable at any render framerate, matches validation test requirement. Semi-implicit Euler is stable for stiff spring-damper systems like tire forces.

### 3. Bicycle Model vs Full 4-Wheel
**Decision**: Dynamic bicycle model (2 axles) rather than full 4-wheel independent simulation.
**Reason**: 
- 4 DOF (vx, vy, r, ψ) vs 14+ DOF for full vehicle
- Real-time performance on browser (60 FPS physics + 60 FPS render)
- Captures essential handling: understeer, oversteer, load transfer, combined slip
- Left/right asymmetry handled via load transfer approximation
- Full 4-wheel would require individual tire models, suspension kinematics, differential modeling

### 4. Tire Model
**Decision**: Simplified Pacejka-like model using `tanh` saturation: `F = μ·Fz·tanh(C·slip / (μ·Fz))`
**Reason**:
- Physically interpretable parameters (μ, C, Fz)
- Smooth saturation avoids numerical instability at limits
- Combined slip via friction circle (vector clamping)
- Load sensitivity via μ·Fz scaling
- Much faster than full Pacejka with magic formula

### 5. Engine Torque Curve
**Decision**: Piecewise curve - flat torque to peak power RPM, then power-limited hyperbolic drop.
**Reason**:
- Captures essential characteristic: constant torque → constant power
- Only 3 parameters needed (peak torque, peak power, redline)
- Realistic enough for gearing trade-offs
- Avoids complex torque map interpolation

### 6. Load Transfer
**Decision**: Quasi-static load transfer: longitudinal `m·ax·h/L`, lateral `m·ay·h/t` per axle.
**Reason**:
- No roll dynamics simulation needed
- Captures 90% of load transfer effect on grip
- CG height directly affects transfer (engineering trade-off)
- Aero downforce added to static load

### 7. Coordinate System
**Decision**: Body-fixed frame for velocities (vx forward, vy left), world frame for position. Yaw angle 0 = +X.
**Reason**: Standard vehicle dynamics convention. Simplifies tire slip angle calculation: `α = δ - atan2(vy ± r·l, vx)`.

### 8. Units
**Decision**: SI units internally (m, kg, s, N, rad). UI converts only at display boundary.
**Reason**: 
- Dimensional consistency in equations
- No unit conversion errors in physics
- Easy to validate (e.g., `F = m·a` in SI)
- `types.ts` exports `UNITS` helpers for UI

---

## Rendering Decisions

### 9. Canvas 2D vs WebGL/Three.js
**Decision**: HTML5 Canvas 2D API only.
**Reason**:
- No external dependencies (requirement)
- Sufficient for 2.5D top-down/isometric view
- Lower overhead than WebGL for this use case
- Easier debugging and profiling
- Works on all browsers without GPU acceleration quirks

### 10. Low-Poly Aesthetic
**Decision**: Faceted procedural geometry with flat shading, consistent light direction.
**Reason**:
- "Dynamic low-poly" visual identity per spec
- No external assets needed
- Fast to render (simple polygons)
- Intentional designed look, not "programmer art"
- Electric blue / amber / charcoal palette per spec

### 11. Camera
**Decision**: Smooth follow camera with look-ahead, speed-based zoom, subtle rotation from yaw rate, camera shake on events.
**Reason**:
- Sense of speed without motion blur
- Look-ahead helps anticipation
- Zoom shows more track at high speed
- Yaw rotation gives banking feel
- Shake on traction loss/impact

### 12. Skid Marks & Particles
**Decision**: Ring buffers (500 skid marks, 200 particles) with age-based fade.
**Reason**:
- Bounded memory (no leaks)
- Persistent visual feedback
- Performance predictable
- Age-based fade looks natural

---

## Track Design Decisions

### 13. Single Facility vs Multiple Tracks
**Decision**: One large test facility containing all test areas connected.
**Reason**:
- Player can switch tests without loading
- Free-roam exploration between tests
- Shared infrastructure (pits, grandstands)
- Realistic test facility layout

### 14. Centerline-Based Track
**Decision**: Track defined by centerline points + width, with procedural mesh generation.
**Reason**:
- Compact data representation
- Easy to add surfaces, curbs, lines procedurally
- Checkpoints placed along centerline
- Surface zones as geometric overlays

### 15. Checkpoint System
**Decision**: Ordered checkpoints with direction validation for circuit test.
**Reason**:
- Prevents shortcutting
- Enables lap timing
- Works for all three test types
- Simple to implement and validate

---

## UI/UX Decisions

### 16. Five-Tab Layout
**Decision**: Drive | Garage | Telemetry | Tests | Engineering
**Reason**:
- Separates driving from configuration
- Telemetry separate for analysis
- Tests as first-class feature
- Engineering for documentation/learning

### 17. Garage Organization
**Decision**: 7 collapsible categories with sliders/selects/checkboxes, live parameter values.
**Reason**:
- 30+ parameters need organization
- Categories match engineering domains
- Sliders for continuous, selects for discrete, checkboxes for boolean
- Live values show exact numbers

### 18. Presets
**Decision**: Three presets demonstrating real trade-offs: Balanced, Drift Missile (loose rear, high power, no aids), Grip Monster (high downforce, racing tires, drag penalty).
**Reason**:
- Shows physics trade-offs immediately
- Drift Missile: power > grip, rear bias, no TC/SC
- Grip Monster: downforce + racing tires → drag + mass penalty
- Balanced: good starting point

### 19. Telemetry Graphs
**Decision**: Fixed 300-sample ring buffer (5 sec at 60Hz), three graphs: speed, lateral G, steering.
**Reason**:
- Most important signals for driving analysis
- Ring buffer = bounded memory
- 5 seconds shows corner entry/exit
- Overlay current value indicator

### 20. Test Results
**Decision**: Persistent records with vehicle config snapshot, timestamp, all metrics.
**Reason**:
- Compare setups objectively
- Export/share results
- Personal progression
- Config snapshot enables reproduction

---

## Persistence Decisions

### 21. localStorage Only
**Decision**: No backend, no IndexedDB, just localStorage with JSON.
**Reason**:
- Requirement: no backend/database
- Sufficient for settings, setups, records (~100KB)
- Simple, synchronous, works offline
- Version field enables migration

### 22. Debounced Saves
**Decision**: 1-second debounce on parameter changes.
**Reason**:
- Avoids write on every physics frame
- localStorage is synchronous and blocking
- 1s delay imperceptible to user
- Force-save on page unload

### 23. Service Worker
**Decision**: Cache-first strategy with background update.
**Reason**:
- Offline capability per requirement
- Fast subsequent loads
- Automatic cache management
- No complex caching logic needed

---

## Validation Decisions

### 24. Deterministic Physics Tests
**Decision**: 10 unit tests verifying physical invariants, runnable via `npm run test:physics`.
**Reason**:
- Catches regressions in physics equations
- Documents expected behavior
- Runs in CI without browser
- Fast execution (<1s)

### 25. Test Coverage
**Decision**: Tests cover stationary stability, drag direction, mass/acceleration, braking, yaw symmetry, friction bounds, downforce effect, timestep consistency, extreme values, reset behavior.
**Reason**: These are the minimum invariants that must hold for any vehicle simulation to be physically credible.

---

## Performance Decisions

### 26. No Per-Frame Allocations in Hot Path
**Decision**: Reuse objects, avoid `new` in physics step, pre-allocate arrays.
**Reason**: GC pauses cause frame drops. Physics runs 60x/sec.

### 27. React Re-render Optimization
**Decision**: Game component holds physics state in refs, only UI state in React state. Canvas rendering outside React.
**Reason**: 
- Physics at 60Hz shouldn't trigger React renders
- UI updates at ~10-30Hz sufficient
- Separation of concerns

### 28. Ring Buffers Everywhere
**Decision**: Telemetry (300), skid marks (500), particles (200), records (50).
**Reason**: Bounded memory, predictable performance, no leaks.

---

## Known Trade-offs Accepted

1. **Bicycle model** - No left/right tire force difference → can't simulate split-μ braking or asymmetric aero perfectly
2. **Quasi-static load transfer** - No transient roll → slightly delayed load transfer in rapid transitions
3. **Simplified engine** - No torque dip at shift, no rev limiter behavior beyond fuel cut
4. **No suspension kinematics** - Camber/toe fixed → no camber gain in roll
5. **Open diff only** - AWD splits torque 50/50 front/rear, no center diff control
6. **No tire temperature** - Grip constant regardless of use
7. **No collision** - Car passes through barriers (test facility has runoff)
8. **No audio** - Silent operation

All documented in Engineering panel for transparency.