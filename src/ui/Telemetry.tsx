import { useEffect, useRef, useState } from 'react';
import type { TelemetrySample } from '../types';

const HISTORY = 300; // samples to keep for the graph

export interface TelemetryProps {
  sample: TelemetrySample | null;
}

export default function Telemetry({ sample }: TelemetryProps) {
  const [history, setHistory] = useState<TelemetrySample[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Append each new sample to the ring buffer.
  useEffect(() => {
    if (!sample) return;
    setHistory((prev) => {
      const next = [...prev, sample];
      return next.slice(-HISTORY);
    });
  }, [sample]);

  // Draw the telemetry graph.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || history.length < 2) return;
    const ctx = canvas.getContext('2d')!;
    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);

    const pad = 30;
    const plotW = width - pad * 2;
    const plotH = height - pad * 2;

    // Find min/max speed for scaling.
    const speeds = history.map((s) => s.speedKmh);
    const minS = Math.min(...speeds);
    const maxS = Math.max(...speeds);
    const range = maxS - minS || 1;

    ctx.strokeStyle = '#e5e4e7';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad, height / 2);
    ctx.lineTo(width - pad, height / 2);
    ctx.stroke();

    ctx.strokeStyle = '#00d4ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    history.forEach((s, i) => {
      const x = pad + (i / (history.length - 1)) * plotW;
      const y = height / 2 - ((s.speedKmh - minS) / range - 0.5) * plotH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Axis labels.
    ctx.fillStyle = '#6b6375';
    ctx.font = '11px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`${maxS.toFixed(0)} km/h`, pad, pad - 4);
    ctx.fillText(`${minS.toFixed(0)} km/h`, pad, height - pad + 14);
    ctx.textAlign = 'right';
    ctx.fillText('t', width - pad, pad - 4);
  }, [history]);

  if (!sample) {
    return (
      <div className="telemetry-panel">
        <h2>Telemetry</h2>
        <p>No data yet. Drive the car to see live telemetry.</p>
      </div>
    );
  }

  return (
    <div className="telemetry-panel">
      <h2>Telemetry</h2>
      <div className="telemetry-grid">
        <div className="tel-cell">
          <div className="tel-label">Speed</div>
          <div className="tel-value">{sample.speedKmh.toFixed(1)} km/h</div>
        </div>
        <div className="tel-cell">
          <div className="tel-label">RPM</div>
          <div className="tel-value">{Math.round(sample.rpm)}</div>
        </div>
        <div className="tel-cell">
          <div className="tel-label">Gear</div>
          <div className="tel-value">{sample.gear}</div>
        </div>
        <div className="tel-cell">
          <div className="tel-label">Throttle</div>
          <div className="tel-value">{(sample.throttle * 100).toFixed(0)}%</div>
        </div>
        <div className="tel-cell">
          <div className="tel-label">Brake</div>
          <div className="tel-value">{(sample.brake * 100).toFixed(0)}%</div>
        </div>
        <div className="tel-cell">
          <div className="tel-label">Steer</div>
          <div className="tel-value">{(sample.steer * 100).toFixed(0)}%</div>
        </div>
        <div className="tel-cell">
          <div className="tel-label">a<sub>x</sub> (g)</div>
          <div className="tel-value">{sample.axG.toFixed(2)}</div>
        </div>
        <div className="tel-cell">
          <div className="tel-label">a<sub>y</sub> (g)</div>
          <div className="tel-value">{sample.ayG.toFixed(2)}</div>
        </div>
        <div className="tel-cell">
          <div className="tel-label">Yaw rate (°/s)</div>
          <div className="tel-value">{sample.yawRateDeg.toFixed(0)}</div>
        </div>
        <div className="tel-cell">
          <div className="tel-label">αF (°)</div>
          <div className="tel-value">{sample.alphaF.toFixed(1)}</div>
        </div>
        <div className="tel-cell">
          <div className="tel-label">αR (°)</div>
          <div className="tel-value">{sample.alphaR.toFixed(1)}</div>
        </div>
        <div className="tel-cell">
          <div className="tel-label">Grip util.</div>
          <div className="tel-value">{sample.gripUtil.toFixed(2)}</div>
        </div>
        <div className="tel-cell">
          <div className="tel-label">Power (kW)</div>
          <div className="tel-value">{sample.powerKw.toFixed(0)}</div>
        </div>
        <div className="tel-cell">
          <div className="tel-label">Surface</div>
          <div className="tel-value">{sample.surface}</div>
        </div>
        <div className="tel-cell">
          <div className="tel-label">Status</div>
          <div className={`tel-value status-${sample.status}`}>{sample.status}</div>
        </div>
      </div>
      <div className="tel-graph-wrap">
        <canvas ref={canvasRef} className="tel-graph" width="600" height="200" />
      </div>
    </div>
  );
}
