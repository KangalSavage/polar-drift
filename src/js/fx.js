// "Juice" layer: particle bursts, floating combo/score text, and screen shake.
// Purely cosmetic and fully decoupled from gameplay state - safe to skip/clear
// at any time without affecting scoring or physics.

export class Particles {
  constructor() {
    this.items = [];
  }

  spawnBurst(x, y, color, count = 10) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 90 + Math.random() * 230;
      this.items.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0,
        maxLife: 0.35 + Math.random() * 0.3,
        radius: 1.5 + Math.random() * 2.5,
        color,
      });
    }
  }

  update(dt) {
    for (const p of this.items) {
      p.life += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.91;
      p.vy *= 0.91;
    }
    this.items = this.items.filter((p) => p.life < p.maxLife);
  }

  draw(ctx) {
    for (const p of this.items) {
      const t = 1 - p.life / p.maxLife;
      ctx.globalAlpha = Math.max(0, t);
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.1, p.radius * t), 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 8;
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  }

  clear() {
    this.items = [];
  }
}

export class FloatingTexts {
  constructor() {
    this.items = [];
  }

  spawn(x, y, text, { color = '#eafffe', size = 18, life = 0.8, vy = -75 } = {}) {
    this.items.push({ x, y, text, color, size, life: 0, maxLife: life, vy });
  }

  update(dt) {
    for (const it of this.items) {
      it.life += dt;
      it.y += it.vy * dt;
      it.vy *= 0.96;
    }
    this.items = this.items.filter((it) => it.life < it.maxLife);
  }

  draw(ctx) {
    for (const it of this.items) {
      const t = it.life / it.maxLife;
      const alpha = t < 0.75 ? 1 : 1 - (t - 0.75) / 0.25;
      const popScale = t < 0.15 ? 0.6 + (t / 0.15) * 0.4 : 1;

      ctx.save();
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.translate(it.x, it.y);
      ctx.scale(popScale, popScale);
      ctx.font = `800 ${it.size}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = it.color;
      ctx.shadowColor = it.color;
      ctx.shadowBlur = 10;
      ctx.fillText(it.text, 0, 0);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  }

  clear() {
    this.items = [];
  }
}

/** Mixes a #rrggbb color toward white (amt > 0) or black (amt < 0) by |amt| (0..1). Used to fake a glossy sphere gradient from one base hex per tier. */
export function shadeColor(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const t = Math.max(-1, Math.min(1, amt));
  const target = t >= 0 ? 255 : 0;
  const mix = (c) => Math.round(c + (target - c) * Math.abs(t));
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

export class ScreenShake {
  constructor() {
    this.trauma = 0;
  }

  /** amount in [0,1] - stacks, clamped to 1 */
  trigger(amount) {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  update(dt) {
    this.trauma = Math.max(0, this.trauma - dt * 2.4);
  }

  getOffset(maxOffsetPx = 16) {
    if (this.trauma <= 0) return { x: 0, y: 0 };
    const s = this.trauma * this.trauma;
    return {
      x: (Math.random() * 2 - 1) * maxOffsetPx * s,
      y: (Math.random() * 2 - 1) * maxOffsetPx * s,
    };
  }
}
