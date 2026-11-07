# Vehicle Dynamics Lab — Architecture Decisions

## Units
- SI units internally (m, kg, s, N, rad, rad/s). Conversion to km/h, °/s, % only at the UI boundary.

## Physics model
- Dynamic bicycle model: state (x, y, psi, vx, vy, r) plus driven-axle wheel angular velocity.
- Tire model: linear cornering stiffness (Fy = -C*alpha) saturated by friction circle (|F| <= mu*Fz). Combined slip reduces lateral capacity when longitudinal force is present.
- Longitudinal: engine torque vs RPM (flat torque to power peak, then constant power), gear ratios + final drive + efficiency, driven-wheel inertia for wheel spin, tractive force clamped to mu*Fz (traction-limited acceleration).
- Aerodynamic drag Fd = 0.5*rho*Cd*A*v^2 opposing velocity; downforce = downforceCoefficient*v^2 distributed by aero balance; added to normal load.
- Rolling resistance Crr*m*g opposing velocity.
- Longitudinal weight transfer: dFz = m*ax*h/wheelbase. Lateral load transfer approximated as a grip-reduction factor vs lateral acceleration.
- Yaw moment: Iz*rdot = a*Fyf - b*Fyr (lateral forces only; longitudinal yaw moment from track width omitted — defensible simplification, documented).
- Integration: semi-implicit Euler, fixed timestep 1/60 s, up to 4 sub-steps per frame with catch-up cap. Near-zero speed: speed floor (0.3 m/s) in slip-angle denominators; kinematic fallback below 0.15 m/s.
- Traction/stability control: traction control reduces throttle when driven-wheel slip is high; stability control applies corrective braking and throttle reduction when yaw rate deviates from desired.

## Rendering
- HTML5 Canvas 2D, fixed-size logical canvas scaled via CSS. Camera follows car with speed-based zoom and subtle shake. No external libraries.

## Persistence
- localStorage key 'vdl-saved-state-v1'. Written on setup change (debounced) and test completion, not per physics frame. Corrupted/out-of-range data validated and reset to defaults. JSON import/export with range validation.

## Deployment
- Vite build → dist/. Cloudflare Pages: build command `npm run build`, output directory `dist`. wrangler.toml included.
