export type CameraMode = 'follow' | 'fixed' | 'cinematic';

export interface CameraState {
  mode: CameraMode;
  x: number; // world x of camera center
  y: number; // world y of camera center
  zoom: number;
  shake: number;
}

/**
 * Smoothly-following camera with speed-based zoom and optional shake.
 * All world units (meters).
 */
export class Camera {
  public state: CameraState = {
    mode: 'follow',
    x: 0,
    y: 0,
    zoom: 1.2,
    shake: 0,
  };

  private readonly smooth = 6; // lerp sharpness per second

  follow(
    targetX: number,
    targetY: number,
    targetPsi: number,
    speed: number,
    dt: number,
  ): void {
    const lookAhead = 6 + speed * 0.04;
    const offsetX = -Math.cos(targetPsi) * (11 + lookAhead);
    const offsetY = -Math.sin(targetPsi) * (11 + lookAhead);
    const tx = targetX + offsetX;
    const ty = targetY + offsetY;
    const alpha = 1 - Math.exp(-this.smooth * dt);
    this.state.x += (tx - this.state.x) * alpha;
    this.state.y += (ty - this.state.y) * alpha;
    // Zoom in slightly with speed, bounded.
    const targetZoom = 1.1 + Math.min(speed / 180, 0.9);
    this.state.zoom += (targetZoom - this.state.zoom) * alpha;
    this.updateShake();
  }

  fixed(x: number, y: number, zoom: number): void {
    this.state.mode = 'fixed';
    this.state.x = x;
    this.state.y = y;
    this.state.zoom = zoom;
    this.state.shake = 0;
  }

  cinematic(targetX: number, targetY: number, targetPsi: number, dt: number): void {
    const offsetX = -Math.cos(targetPsi) * 22;
    const offsetY = -Math.sin(targetPsi) * 22;
    const tx = targetX + offsetX;
    const ty = targetY + offsetY;
    const alpha = 1 - Math.exp(-3 * dt);
    this.state.x += (tx - this.state.x) * alpha;
    this.state.y += (ty - this.state.y) * alpha;
    this.state.zoom += (1.4 - this.state.zoom) * alpha;
    this.updateShake();
  }

  shake(amount: number): void {
    this.state.shake = Math.max(this.state.shake, amount);
  }

  private updateShake(): void {
    if (this.state.shake > 0.005) {
      this.state.x += (Math.random() - 0.5) * this.state.shake;
      this.state.y += (Math.random() - 0.5) * this.state.shake;
      this.state.shake *= 0.85;
      if (this.state.shake < 0.005) this.state.shake = 0;
    }
  }

  worldToScreen(wx: number, wy: number): { x: number; y: number } {
    return {
      x: (wx - this.state.x) * this.state.zoom,
      y: (wy - this.state.y) * this.state.zoom,
    };
  }

  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    return {
      x: sx / this.state.zoom + this.state.x,
      y: sy / this.state.zoom + this.state.y,
    };
  }
}
