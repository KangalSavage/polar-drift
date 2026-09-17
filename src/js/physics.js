import { CONFIG } from './config.js';

let nextBallId = 1;

/** A single circle resting/falling inside the jar. `tier` indexes CONFIG.TIERS, unless `special`. */
export class Ball {
  constructor(x, y, tier, special = null) {
    this.id = nextBallId++;
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.tier = tier;
    this.special = special; // null | 'freeze'
    this.radius = special === 'freeze' ? CONFIG.FREEZE_BALL_RADIUS : CONFIG.TIERS[tier].radius;
    this.merging = false; // consumed this frame, about to be removed - skip it in further collision checks
    this.aboveLineMs = 0; // consecutive time spent resting above the overflow line
    this.settleVx = 0; // low-pass filtered speed, used to tell "resting" apart from "still falling/bouncing"
    this.settleVy = 0;
  }
}

/**
 * Minimal position-based physics for circles in a box with tiltable gravity. Not a general
 * physics engine - just enough to make dropped balls fall, bounce off walls/each other, and
 * settle into a stack, at the ball counts a merge game actually needs (well under a hundred).
 */
export class PhysicsWorld {
  constructor(bounds) {
    this.setBounds(bounds);
    this.balls = [];
    this.tiltAngle = 0;
    this.mergePairs = []; // [{a, b}] touching same-tier pairs found this step, for Game to resolve
  }

  setBounds({ left, right, top, bottom }) {
    this.left = left;
    this.right = right;
    this.top = top;
    this.bottom = bottom;
  }

  addBall(ball) {
    this.balls.push(ball);
    return ball;
  }

  removeBall(ball) {
    const i = this.balls.indexOf(ball);
    if (i !== -1) this.balls.splice(i, 1);
  }

  clear() {
    this.balls = [];
  }

  step(dt) {
    this.mergePairs = [];
    const gx = Math.sin(this.tiltAngle) * CONFIG.GRAVITY;
    const gy = Math.cos(this.tiltAngle) * CONFIG.GRAVITY;

    for (const b of this.balls) {
      if (b.merging) continue;
      b.vx += gx * dt;
      b.vy += gy * dt;
      b.vx *= CONFIG.DAMPING;
      b.vy *= CONFIG.DAMPING;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
    }

    for (let pass = 0; pass < CONFIG.SOLVER_ITERATIONS; pass++) {
      this._resolveWalls();
      this._resolveBallPairs(pass === CONFIG.SOLVER_ITERATIONS - 1);
    }

    for (const b of this.balls) {
      // Floor friction belongs here, applied once per frame - it used to live inside
      // _resolveWalls(), which runs once per solver pass (SOLVER_ITERATIONS times a frame),
      // so any ball resting on the floor had its horizontal speed crushed ~6x too hard. That
      // silently ate almost all of the tilt-induced sideways push before it could do anything.
      const onFloor = b.y + b.radius >= this.bottom - 0.5;
      if (onFloor) b.vx *= CONFIG.FLOOR_FRICTION;

      // Kill lingering micro-velocity so settled stacks stop buzzing instead of eternally
      // re-triggering tiny restitution bounces.
      if (Math.abs(b.vx) < CONFIG.VELOCITY_SLEEP_THRESHOLD) b.vx = 0;
      if (Math.abs(b.vy) < CONFIG.VELOCITY_SLEEP_THRESHOLD) b.vy = 0;
      // Simple low-pass so a single-frame bounce spike doesn't look "settled" or "still falling".
      b.settleVx += (b.vx - b.settleVx) * 0.3;
      b.settleVy += (b.vy - b.settleVy) * 0.3;
    }
  }

  _resolveWalls() {
    for (const b of this.balls) {
      if (b.merging) continue;
      if (b.x - b.radius < this.left) {
        b.x = this.left + b.radius;
        b.vx = Math.abs(b.vx) < CONFIG.BOUNCE_CUTOFF_SPEED ? 0 : Math.abs(b.vx) * CONFIG.WALL_RESTITUTION;
      } else if (b.x + b.radius > this.right) {
        b.x = this.right - b.radius;
        b.vx = Math.abs(b.vx) < CONFIG.BOUNCE_CUTOFF_SPEED ? 0 : -Math.abs(b.vx) * CONFIG.WALL_RESTITUTION;
      }
      if (b.y + b.radius > this.bottom) {
        b.y = this.bottom - b.radius;
        b.vy = Math.abs(b.vy) < CONFIG.BOUNCE_CUTOFF_SPEED ? 0 : -Math.abs(b.vy) * CONFIG.FLOOR_RESTITUTION;
      }
      if (b.y - b.radius < this.top) {
        b.y = this.top + b.radius;
        if (b.vy < 0) b.vy = 0;
      }
    }
  }

  /** @param {boolean} recordMerges only collect merge candidates on the solver's final pass, once positions have settled for this frame */
  _resolveBallPairs(recordMerges) {
    const balls = this.balls;
    for (let i = 0; i < balls.length; i++) {
      const a = balls[i];
      if (a.merging) continue;
      for (let j = i + 1; j < balls.length; j++) {
        const b = balls[j];
        if (b.merging) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy);
        const minDist = a.radius + b.radius;
        if (dist >= minDist) continue;

        const nx = dist > 0.0001 ? dx / dist : 1;
        const ny = dist > 0.0001 ? dy / dist : 0;
        const rawOverlap = minDist - dist;

        // Heavier balls push lighter ones more than they get pushed - radius^2 as a mass proxy.
        const massA = a.radius * a.radius;
        const massB = b.radius * b.radius;
        const totalMass = massA + massB;

        // Slop + partial correction + a hard per-pass cap: resolving 100% of overlap every
        // pass is what made tall stacks jitter (each pass' "fix" reopens a tiny overlap the
        // next pass over-corrects again), and a fresh pile of overlapping spawns could
        // otherwise fling balls apart at high speed in a single frame.
        const correctable = Math.max(0, rawOverlap - CONFIG.POSITION_SLOP);
        if (correctable > 0) {
          const correction = Math.min(correctable * CONFIG.POSITION_CORRECTION_PERCENT, CONFIG.MAX_CORRECTION_PER_PASS);
          const pushA = correction * (massB / totalMass);
          const pushB = correction * (massA / totalMass);
          a.x -= nx * pushA;
          a.y -= ny * pushA;
          b.x += nx * pushB;
          b.y += ny * pushB;
        }

        // Kill the closing velocity along the collision normal so stacks settle instead of jittering.
        const relVx = b.vx - a.vx;
        const relVy = b.vy - a.vy;
        const closingSpeed = relVx * nx + relVy * ny;
        if (closingSpeed < 0) {
          const impulse = -closingSpeed * 0.5;
          a.vx -= nx * impulse * (massB / totalMass);
          a.vy -= ny * impulse * (massB / totalMass);
          b.vx += nx * impulse * (massA / totalMass);
          b.vy += ny * impulse * (massA / totalMass);
        }

        if (recordMerges && a.special === null && b.special === null && a.tier === b.tier) {
          this.mergePairs.push({ a, b });
        } else if (recordMerges && (a.special === 'freeze') !== (b.special === 'freeze') && (a.special === 'freeze' || b.special === 'freeze')) {
          // exactly one of the pair is the freeze ball, the other is any normal ball - contact alone consumes it
          this.mergePairs.push({ a: a.special === 'freeze' ? a : b, b: a.special === 'freeze' ? b : a, isFreezePickup: true });
        }
      }
    }
  }
}
