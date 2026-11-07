export default function Engineering() {
  return (
    <div className="engineering-panel">
      <h2>Engineering</h2>
      <p>Vehicle Dynamics Lab simulates a car with a dynamic bicycle model in SI units.</p>

      <div className="eng-section">
        <h3>Physics Model</h3>
        <ul>
          <li><strong>States:</strong> x, y, heading (&psi;), longitudinal velocity (v<sub>x</sub>), lateral velocity (v<sub>y</sub>), yaw rate (r), driven wheel angular velocity (&omega;).</li>
          <li><strong>Tires:</strong> Linear cornering stiffness saturated by a friction circle (|F| &le; &mu;&middot;F<sub>z</sub>). Combined slip reduces lateral capacity when longitudinal force is present.</li>
          <li><strong>Powertrain:</strong> Engine torque curve (flat peak torque to 50% redline, then constant power), gear ratios, final drive, drivetrain efficiency, FWD/RWD/AWD traction split.</li>
          <li><strong>Forces:</strong> Aerodynamic drag (F<sub>d</sub> = &frac12;&rho;C<sub>d</sub>A v<sup>2</sup>), rolling resistance, downforce, longitudinal/lateral weight transfer.</li>
          <li><strong>Integration:</strong> Semi-implicit Euler, fixed 1/60 s timestep, max 4 sub-steps per frame.</li>
        </ul>
      </div>

      <div className="eng-section">
        <h3>Units</h3>
        <ul>
          <li>Internal: SI (m, kg, s, N, rad, rad/s, Pa).</li>
          <li>UI: km/h, °/s, %, g-forces.</li>
          <li>Gravity: 9.81 m/s&sup2;. Air density: 1.225 kg/m&sup3;.</li>
        </ul>
      </div>

      <div className="eng-section">
        <h3>Tests</h3>
        <ul>
          <li><strong>A &ndash; Acceleration &amp; Braking:</strong> 0&ndash;100 km/h time, 100&ndash;0 braking time and distance.</li>
          <li><strong>B &ndash; Skidpad:</strong> Maximum sustained lateral acceleration on a steady circle.</li>
          <li><strong>C &ndash; Handling Circuit:</strong> Best lap time over 3 laps following ordered checkpoints; off-track incidents counted.</li>
        </ul>
      </div>

      <div className="eng-section">
        <h3>Persistence</h3>
        <ul>
          <li>Setup, presets, results, and settings are saved to localStorage (debounced 800 ms).</li>
          <li>Export/Import your save as JSON.</li>
          <li>Results are tagged with a hash of the key physics parameters for comparison.</li>
        </ul>
      </div>

      <div className="eng-section">
        <h3>Deployment</h3>
        <ul>
          <li>Built with React + TypeScript + Vite.</li>
          <li>HTML5 Canvas 2D rendering.</li>
          <li>Configured for Cloudflare Pages (wrangler.toml).</li>
        </ul>
      </div>
    </div>
  );
}
