import type { TestResult, VehicleParams } from '../types';

export interface TestsProps {
  params: VehicleParams;
  results: TestResult[];
  onClear: () => void;
}

const TEST_DESC: Record<string, { title: string; desc: string }> = {
  A: {
    title: 'Acceleration & Braking',
    desc: 'Floor it to 100 km/h, then brake to a complete stop. Measures 0&ndash;100 km/h time and 100&ndash;0 braking distance.',
  },
  B: {
    title: 'Skidpad',
    desc: 'Hold a steady circle on the skidpad. Measures maximum sustained lateral acceleration.',
  },
  C: {
    title: 'Handling Circuit',
    desc: 'Follow the checkpoints in order for 3 laps. Measures best lap time and off-track incidents.',
  },
};

export default function Tests({ params, results, onClear }: TestsProps) {
  return (
    <div className="tests-panel">
      <h2>Tests</h2>
      <p>Complete the engineering challenges. Results are saved with your current setup hash.</p>

      <div className="test-challenges">
        {['A', 'B', 'C'].map((id) => {
          const d = TEST_DESC[id];
          return (
            <div key={id} className="challenge-card">
              <div className="challenge-id">{id}</div>
              <div className="challenge-title">{d.title}</div>
              <div className="challenge-desc">{d.desc}</div>
              <div className="challenge-hint">
                <strong>Setup:</strong> {params.drivetrain} &middot; {params.tireCompound} &middot; &mu; {params.frictionCoefficient.toFixed(2)}
              </div>
            </div>
          );
        })}
      </div>

      <div className="tests-results">
        <h3>Results</h3>
        <div className="results-actions">
          <button className="btn btn-outline" onClick={onClear}>
            Clear Results
          </button>
        </div>
        {results.length === 0 ? (
          <p>No results yet. Complete a test in the Drive tab.</p>
        ) : (
          <table className="results-table">
            <thead>
              <tr>
                <th>Test</th>
                <th>Setup</th>
                <th>Key Values</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.timestamp}>
                  <td>{r.testId}</td>
                  <td>{r.setupName}</td>
                  <td>{formatValues(r.values)}</td>
                  <td>{new Date(r.timestamp).toLocaleTimeString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function formatValues(values: Record<string, number>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(values)) {
    if (k.startsWith('t') || k.startsWith('brakeDist') || k.startsWith('bestLap') || k.startsWith('lastLap')) {
      parts.push(`${k}: ${v.toFixed(2)}s`);
    } else if (k.startsWith('maxAy') || k.startsWith('avgAy') || k.startsWith('peakAy')) {
      parts.push(`${k}: ${v.toFixed(2)}g`);
    } else if (k === 'laps' || k === 'lapCount' || k === 'offTrackIncidents') {
      parts.push(`${k}: ${Math.round(v)}`);
    } else {
      parts.push(`${k}: ${v.toFixed(2)}`);
    }
  }
  return parts.slice(0, 4).join(' &middot; ');
}
