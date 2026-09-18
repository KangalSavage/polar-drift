import { CONFIG } from './config.js';
import { Obstacle, Pickup, comboColor, getDifficulty, spawnObstacles, spawnPickup } from './entities.js';
import { Particles, FloatingTexts, ScreenShake, shadeColor } from './fx.js';

const STATE = {
  IDLE: 'idle',
  PLAYING: 'playing',
  PAUSED: 'paused',
  GAMEOVER: 'gameover',
};

export class Game {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} callbacks
   *   onScoreChange(score), onFlip(toRed), onGem(comboCount), onNearMiss(),
   *   onNewBestCrossed(), onShieldChange(active), onShieldBreak(),
   *   onGameOver(score, nearMissCount), onTutorialHint(show)
   */
  constructor(canvas, callbacks = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.callbacks = callbacks;

    this.state = STATE.IDLE;
    this.width = 0;
    this.height = 0;
    this.dpr = 1;

    this.trailAccent = CONFIG.THEMES[0].trailAccent;

    this.shaftLeft = 0;
    this.shaftRight = 0;
    this.ballScreenY = 0;

    this.ballX = 0;
    this.ballVX = 0;
    this.ballPolarity = 'red'; // 'red' | 'blue'
    this.trail = [];

    this.obstacles = [];
    this.pickups = [];
    this.spawnTimer = 0;
    this.spawnIndex = 0;
    this.ambientSpawnTimer = 0;
    this.tutorialGateActive = false;
    this.nearMissCount = 0;

    this.hasShield = false;
    this.comboCount = 0;
    this.lastGemAtMs = -Infinity;
    this.rawScore = 0;
    this.score = 0;
    this.bestScoreAtStart = 0;
    this.crossedBest = false;
    this.elapsedMs = 0;

    this.particles = new Particles();
    this.floatingTexts = new FloatingTexts();
    this.shake = new ScreenShake();
    this.hitStopMs = 0;
    this.gameOverFlashMs = 0;
    this.shieldFlashMs = 0;
    this.coreTime = 0;

    this._bgGradient = null;
    this.bgParticles = Array.from({ length: 22 }, () => ({
      nx: Math.random(),
      ny: Math.random(),
      r: 1 + Math.random() * 2,
      speed: 0.2 + Math.random() * 0.5,
      phase: Math.random() * Math.PI * 2,
    }));

    this.lastFrameTime = 0;
    this.rafId = null;

    this._resize = this._resize.bind(this);
    this._onPointerDown = this._onPointerDown.bind(this);
    this._loop = this._loop.bind(this);

    window.addEventListener('resize', this._resize);
    this._resize();

    canvas.addEventListener('pointerdown', this._onPointerDown);

    this.lastFrameTime = performance.now();
    this.rafId = requestAnimationFrame(this._loop);
  }

  _resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = window.innerWidth;
    this.height = window.innerHeight;

    this.canvas.width = this.width * this.dpr;
    this.canvas.height = this.height * this.dpr;
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    const shaftWidth = this.width * CONFIG.SHAFT_WIDTH_FRACTION;
    this.shaftLeft = (this.width - shaftWidth) / 2;
    this.shaftRight = this.shaftLeft + shaftWidth;
    this.ballScreenY = this.height * CONFIG.BALL_SCREEN_Y_FRACTION;

    if (!this.ballX) this.ballX = (this.shaftLeft + this.shaftRight) / 2;

    const bgGrad = this.ctx.createRadialGradient(
      this.width / 2, this.height * 0.3, 10,
      this.width / 2, this.height * 0.3, Math.max(this.width, this.height) * 0.85
    );
    bgGrad.addColorStop(0, '#0d1226');
    bgGrad.addColorStop(1, CONFIG.BG);
    this._bgGradient = bgGrad;
  }

  /** Cosmetic re-skin only - recolors the ball's trail accent, never the red/blue polarity colors. */
  setTheme(index) {
    const theme = CONFIG.THEMES[index];
    if (theme) this.trailAccent = theme.trailAccent;
  }

  startNewRun(bestScore = 0, showTutorial = false) {
    this.obstacles = [];
    this.pickups = [];
    this.trail = [];
    this.spawnTimer = 900;
    this.spawnIndex = 0;
    this.ballX = (this.shaftLeft + this.shaftRight) / 2;
    this.ballVX = 0;
    this.ballPolarity = 'red';
    this.hasShield = false;
    this.comboCount = 0;
    this.lastGemAtMs = -Infinity;
    this.rawScore = 0;
    this.score = 0;
    this.nearMissCount = 0;
    this.bestScoreAtStart = bestScore;
    this.crossedBest = false;
    this.elapsedMs = 0;
    this.hitStopMs = 0;
    this.gameOverFlashMs = 0;
    this.shieldFlashMs = 0;
    this.particles.clear();
    this.floatingTexts.clear();
    this.shake.trauma = 0;
    this.state = STATE.PLAYING;
    // Only the player's very first-ever run forces a full stop until they flip correctly -
    // returning players already know the rule, so their tutorial obstacle just plays out
    // like a (generous) normal one instead of blocking them every single run.
    this.tutorialGateActive = showTutorial;

    this._emitScore();
    if (this.callbacks.onShieldChange) this.callbacks.onShieldChange(false);
    if (showTutorial && this.callbacks.onTutorialHint) this.callbacks.onTutorialHint(true);
  }

  pause() {
    if (this.state !== STATE.PLAYING) return;
    this.state = STATE.PAUSED;
  }

  resume() {
    if (this.state !== STATE.PAUSED) return;
    this.state = STATE.PLAYING;
  }

  stop() {
    this.state = STATE.IDLE;
  }

  isPlaying() {
    return this.state === STATE.PLAYING;
  }

  /** Revive after a game-over (e.g. the player watched a rewarded ad) - clears the immediate
   * danger band so they aren't instantly re-killed by the same obstacle, no bonus score. */
  continueRun() {
    if (this.state !== STATE.GAMEOVER) return;
    const dangerBand = CONFIG.OBSTACLE_THICKNESS_PX * 1.6;
    this.obstacles = this.obstacles.filter((o) => Math.abs(o.y - this.ballScreenY) > dangerBand);
    this.ballVX = 0;
    this.ballX = (this.shaftLeft + this.shaftRight) / 2;
    this.hitStopMs = 0;
    this.gameOverFlashMs = 0;
    this.shake.trauma = 0;
    this.state = STATE.PLAYING;
  }

  _onPointerDown(e) {
    if (this.state !== STATE.PLAYING) return;
    e.preventDefault();
    this.ballPolarity = this.ballPolarity === 'red' ? 'blue' : 'red';
    if (this.callbacks.onTutorialHint) this.callbacks.onTutorialHint(false);
    if (this.callbacks.onFlip) this.callbacks.onFlip(this.ballPolarity === 'red');
  }

  _loop(now) {
    this.rafId = requestAnimationFrame(this._loop);
    const rawDt = Math.min((now - this.lastFrameTime) / 1000, 0.05);
    this.lastFrameTime = now;

    this.particles.update(rawDt);
    this.floatingTexts.update(rawDt);
    this.shake.update(rawDt);
    this.coreTime += rawDt;
    if (this.gameOverFlashMs > 0) this.gameOverFlashMs = Math.max(0, this.gameOverFlashMs - rawDt * 1000);
    if (this.shieldFlashMs > 0) this.shieldFlashMs = Math.max(0, this.shieldFlashMs - rawDt * 1000);

    if (this.state === STATE.PLAYING) {
      if (this.hitStopMs > 0) {
        this.hitStopMs -= rawDt * 1000;
      } else {
        this._update(rawDt);
      }
    } else if (this.state === STATE.IDLE) {
      this._updateAmbient(rawDt);
    }

    this._render();
  }

  _update(dt) {
    this.elapsedMs += dt * 1000;
    const { fallSpeed, spawnIntervalMs } = getDifficulty(this.elapsedMs);

    for (const o of this.obstacles) {
      if (o.isTutorialGate && this.tutorialGateActive) {
        const holdY = this.ballScreenY + o.thickness * 2;
        if (o.y <= holdY) {
          if (o.polarity === this.ballPolarity) {
            this.tutorialGateActive = false; // matched - release it and everything from now on
          } else {
            continue; // hold position right where it's clearly visible, waiting for the flip
          }
        }
      }
      o.y -= fallSpeed * dt;
    }
    for (const p of this.pickups) p.y -= fallSpeed * dt;

    this.spawnTimer -= dt * 1000;
    if (this.spawnTimer <= 0) {
      const spawnY = this.height + CONFIG.OBSTACLE_THICKNESS_PX;
      const shaftWidth = this.shaftRight - this.shaftLeft;
      const newObstacles = spawnObstacles(this.spawnIndex, spawnY, shaftWidth);
      this.obstacles.push(...newObstacles);
      if (this.spawnIndex > 0) {
        const pickup = spawnPickup(newObstacles, spawnY, this.shaftLeft, this.shaftRight);
        if (pickup) this.pickups.push(pickup);
      }
      this.spawnIndex += 1;
      this.spawnTimer = spawnIntervalMs * (0.9 + Math.random() * 0.2);
    }

    this.obstacles = this.obstacles.filter((o) => o.y > -CONFIG.OBSTACLE_THICKNESS_PX && o.alive);
    this.pickups = this.pickups.filter((p) => p.y > -40 && p.alive);

    this._updateBallPhysics(dt);
    this._checkDanger(); // only the real run can trigger game-over/shield - never the ambient preview
    if (this.state !== STATE.PLAYING) return; // game over mid-update

    this._checkScoringCrossings();
    this._checkPickups();

    this.trail.push({ x: this.ballX, y: this.ballScreenY, polarity: this.ballPolarity });
    if (this.trail.length > CONFIG.TRAIL_LENGTH) this.trail.shift();

    this.rawScore += dt * CONFIG.SCORE_PER_SECOND_SURVIVED;
    const newScore = Math.floor(this.rawScore);
    if (newScore !== this.score) {
      this.score = newScore;
      this._emitScore();
      this._checkNewBest();
    }
  }

  _updateBallPhysics(dt) {
    const centerX = (this.shaftLeft + this.shaftRight) / 2;
    let ax = (centerX - this.ballX) * CONFIG.CENTER_SPRING_K;

    for (const o of this.obstacles) {
      const dy = Math.abs(o.y - this.ballScreenY);
      if (dy >= CONFIG.MAGNET_RANGE_PX) continue;
      const proximity = 1 - dy / CONFIG.MAGNET_RANGE_PX;
      const edgeX = o.side === 'left' ? this.shaftLeft + o.depthPx : this.shaftRight - o.depthPx;
      const sameCharge = o.polarity === this.ballPolarity;
      const dir = o.side === 'left' ? 1 : -1; // "away from this wall" direction
      ax += dir * (sameCharge ? 1 : -1) * CONFIG.MAGNET_FORCE * proximity;

      // Same charge = solid wall: ease back to the boundary instead of snapping to it. The
      // magnet force above should already keep the ball clear of this in the vast majority
      // of cases - this is a safety net for the rare tight/fast case, so it needs to read as
      // a quick glide, not a teleport, when it does kick in.
      if (sameCharge) {
        const boundary = o.side === 'left' ? edgeX + CONFIG.BALL_RADIUS : edgeX - CONFIG.BALL_RADIUS;
        const violating = o.side === 'left' ? this.ballX < boundary : this.ballX > boundary;
        if (violating) {
          this.ballX += (boundary - this.ballX) * Math.min(1, CONFIG.WALL_CORRECTION_RATE * dt);
          if (o.side === 'left' && this.ballVX < 0) this.ballVX *= 0.3;
          if (o.side === 'right' && this.ballVX > 0) this.ballVX *= 0.3;
        }
      }
    }

    this.ballVX += ax * dt;
    this.ballVX *= Math.pow(CONFIG.HORIZONTAL_DAMPING, dt * 60);
    this.ballX += this.ballVX * dt;
    this.ballX = Math.max(this.shaftLeft + CONFIG.BALL_RADIUS, Math.min(this.shaftRight - CONFIG.BALL_RADIUS, this.ballX));
  }

  _checkDanger() {
    for (const o of this.obstacles) {
      if (Math.abs(o.y - this.ballScreenY) >= o.thickness / 2) {
        o.dangerHandled = false; // reset once clear of the physical band, in case it's ever revisited
        continue;
      }
      if (o.dangerHandled) continue;
      const edgeX = o.side === 'left' ? this.shaftLeft + o.depthPx : this.shaftRight - o.depthPx;
      const overlaps =
        o.side === 'left' ? this.ballX - CONFIG.BALL_RADIUS < edgeX : this.ballX + CONFIG.BALL_RADIUS > edgeX;
      if (!overlaps) continue;
      if (o.polarity === this.ballPolarity) continue; // same charge can't overlap - it's a wall

      o.dangerHandled = true;
      if (this.hasShield) this._consumeShield();
      else {
        this._triggerGameOver();
        return;
      }
    }
  }

  _checkScoringCrossings() {
    for (const o of this.obstacles) {
      if (o.scored || o.y > this.ballScreenY) continue;
      o.scored = true;
      const edgeX = o.side === 'left' ? this.shaftLeft + o.depthPx : this.shaftRight - o.depthPx;
      const margin = o.side === 'left' ? this.ballX - CONFIG.BALL_RADIUS - edgeX : edgeX - (this.ballX + CONFIG.BALL_RADIUS);
      if (margin >= 0 && margin < CONFIG.NEAR_MISS_MARGIN_PX) {
        this.nearMissCount += 1;
        this.rawScore += CONFIG.NEAR_MISS_BONUS;
        this.particles.spawnBurst(this.ballX, this.ballScreenY, this.trailAccent, 5);
        if (this.callbacks.onNearMiss) this.callbacks.onNearMiss();
      }
    }
  }

  /**
   * Pickups are collected the instant they cross the ball's fixed line, regardless of how
   * far off to the side they are - the player has no direct horizontal control (x is purely
   * a byproduct of polarity vs. nearby obstacles), so requiring actual proximity would make
   * collection mostly luck. The effects fire at the ball's own position, reading as "it flew
   * to you", not at wherever the pickup happened to be.
   */
  _checkPickups() {
    for (const p of this.pickups) {
      if (p.collected || p.y > this.ballScreenY) continue;
      p.collected = true;
      p.alive = false;
      if (p.type === 'shield') this._onShieldPickup(this.ballX, this.ballScreenY);
      else this._onGemPickup(this.ballX, this.ballScreenY);
    }
  }

  _onGemPickup(x, y) {
    if (this.elapsedMs - this.lastGemAtMs <= CONFIG.CHAIN_WINDOW_MS) this.comboCount += 1;
    else this.comboCount = 1;
    this.lastGemAtMs = this.elapsedMs;

    const points = CONFIG.GEM_SCORE * this.comboCount;
    this.rawScore += points;
    this.particles.spawnBurst(x, y, '#ffd23d', this.comboCount >= 3 ? 16 : 9);
    this.floatingTexts.spawn(x, y - 10, `+${points}`, {
      color: this.comboCount >= 2 ? comboColor(this.comboCount) : '#eafffe',
      size: 15 + Math.min(this.comboCount, 8),
    });
    if (this.comboCount >= 2) {
      this.floatingTexts.spawn(x, y - 30, `x${this.comboCount} COMBO`, {
        color: comboColor(this.comboCount),
        size: 16 + Math.min(this.comboCount, 8) * 1.6,
        life: 0.7,
        vy: -55,
      });
    }
    if (this.callbacks.onGem) this.callbacks.onGem(this.comboCount);
  }

  _onShieldPickup(x, y) {
    if (this.hasShield) {
      this.rawScore += CONFIG.SHIELD_BONUS_IF_ALREADY_ACTIVE;
      this.particles.spawnBurst(x, y, CONFIG.SHIELD_COLOR, 10);
      this.floatingTexts.spawn(x, y - 10, `+${CONFIG.SHIELD_BONUS_IF_ALREADY_ACTIVE}`, {
        color: CONFIG.SHIELD_COLOR,
        size: 16,
      });
      return;
    }
    this.hasShield = true;
    this.particles.spawnBurst(x, y, CONFIG.SHIELD_COLOR, 14);
    this.floatingTexts.spawn(x, y - 10, 'SHIELD', { color: CONFIG.SHIELD_COLOR, size: 15 });
    if (this.callbacks.onShieldChange) this.callbacks.onShieldChange(true);
  }

  _consumeShield() {
    this.hasShield = false;
    this.shieldFlashMs = 220;
    this.particles.spawnBurst(this.ballX, this.ballScreenY, CONFIG.SHIELD_COLOR, 22);
    this.floatingTexts.spawn(this.ballX, this.ballScreenY - 14, 'SAVED', {
      color: CONFIG.SHIELD_COLOR,
      size: 16,
      life: 0.7,
    });
    this.shake.trigger(0.35);
    this.hitStopMs = Math.max(this.hitStopMs, 60);
    if (this.callbacks.onShieldChange) this.callbacks.onShieldChange(false);
    if (this.callbacks.onShieldBreak) this.callbacks.onShieldBreak();
  }

  _checkNewBest() {
    if (this.crossedBest || this.bestScoreAtStart <= 0) return;
    if (this.score <= this.bestScoreAtStart) return;
    this.crossedBest = true;
    this.floatingTexts.spawn((this.shaftLeft + this.shaftRight) / 2, this.height * 0.16, 'NEW BEST!', {
      color: '#ffd23d',
      size: 24,
      life: 1.1,
      vy: -40,
    });
    this.shake.trigger(0.3);
    this.hitStopMs = Math.max(this.hitStopMs, 55);
    if (this.callbacks.onNewBestCrossed) this.callbacks.onNewBestCrossed();
  }

  _triggerGameOver() {
    this.state = STATE.GAMEOVER;
    this.shake.trigger(1);
    this.hitStopMs = 160;
    this.gameOverFlashMs = 280;
    const dangerColor = this.ballPolarity === 'red' ? CONFIG.RED : CONFIG.BLUE;
    this.particles.spawnBurst(this.ballX, this.ballScreenY, dangerColor, 28);
    if (this.callbacks.onGameOver) this.callbacks.onGameOver(this.score, this.nearMissCount);
  }

  _emitScore() {
    if (this.callbacks.onScoreChange) this.callbacks.onScoreChange(this.score);
  }

  // ---------------- ambient menu background ----------------
  // Runs the same obstacle field, but the ball auto-flips to always survive - a live,
  // hands-off preview of the game running behind the menu, same idea as the other games.

  _updateAmbient(dt) {
    const fallSpeed = CONFIG.FALL_SPEED_BASE * 0.8;
    for (const o of this.obstacles) o.y -= fallSpeed * dt;
    for (const p of this.pickups) p.y -= fallSpeed * dt;

    this.ambientSpawnTimer -= dt * 1000;
    if (this.ambientSpawnTimer <= 0) {
      const shaftWidth = this.shaftRight - this.shaftLeft;
      const side = Math.random() < 0.5 ? 'left' : 'right';
      const polarity = Math.random() < 0.5 ? 'red' : 'blue';
      const depthFrac = CONFIG.OBSTACLE_DEPTH_MIN_FRACTION + Math.random() * 0.15;
      this.obstacles.push(new Obstacle(side, polarity, depthFrac * shaftWidth, this.height + 100));
      this.ambientSpawnTimer = 1100 + Math.random() * 400;
    }
    this.obstacles = this.obstacles.filter((o) => o.y > -CONFIG.OBSTACLE_THICKNESS_PX);

    // Auto-pilot: match whichever nearby obstacle's polarity keeps the ball safest.
    const nearest = this.obstacles.find((o) => Math.abs(o.y - this.ballScreenY) < CONFIG.MAGNET_RANGE_PX);
    if (nearest) this.ballPolarity = nearest.polarity;

    this._updateBallPhysics(dt); // deliberately no _checkDanger() here - the ambient preview can never "die"

    this.trail.push({ x: this.ballX, y: this.ballScreenY, polarity: this.ballPolarity });
    if (this.trail.length > CONFIG.TRAIL_LENGTH) this.trail.shift();
  }

  // ---------------- rendering ----------------

  _render() {
    const { ctx } = this;
    ctx.fillStyle = this._bgGradient || CONFIG.BG;
    ctx.fillRect(0, 0, this.width, this.height);
    this._drawStars(ctx);

    ctx.save();
    const shakeOff = this.shake.getOffset();
    ctx.translate(shakeOff.x, shakeOff.y);

    this._drawShaft(ctx);
    this._drawObstacles(ctx);
    this._drawPickups(ctx);
    this._drawTrail(ctx);
    this._drawBall(ctx);
    this.particles.draw(ctx);
    this.floatingTexts.draw(ctx);

    ctx.restore();

    if (this.shieldFlashMs > 0) {
      const alpha = (this.shieldFlashMs / 220) * 0.3;
      ctx.fillStyle = `rgba(234, 255, 255, ${alpha})`;
      ctx.fillRect(0, 0, this.width, this.height);
    }
    if (this.gameOverFlashMs > 0) {
      const alpha = (this.gameOverFlashMs / 280) * 0.4;
      const color = this.ballPolarity === 'red' ? '255, 59, 92' : '45, 155, 255';
      ctx.fillStyle = `rgba(${color}, ${alpha})`;
      ctx.fillRect(0, 0, this.width, this.height);
    }
  }

  _drawStars(ctx) {
    ctx.save();
    for (const s of this.bgParticles) {
      const x = s.nx * this.width;
      const y = s.ny * this.height;
      const twinkle = 0.35 + 0.35 * Math.sin(this.coreTime * s.speed + s.phase);
      ctx.globalAlpha = Math.max(0, twinkle);
      ctx.beginPath();
      ctx.arc(x, y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  _drawShaft(ctx) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 2;
    ctx.setLineDash([2, 10]);
    ctx.beginPath();
    ctx.moveTo(this.shaftLeft, 0);
    ctx.lineTo(this.shaftLeft, this.height);
    ctx.moveTo(this.shaftRight, 0);
    ctx.lineTo(this.shaftRight, this.height);
    ctx.stroke();
    ctx.restore();
  }

  _drawObstacles(ctx) {
    for (const o of this.obstacles) {
      const top = o.y - o.thickness / 2;
      const color = o.polarity === 'red' ? CONFIG.RED : CONFIG.BLUE;
      const x = o.side === 'left' ? this.shaftLeft : this.shaftRight - o.depthPx;
      const w = o.depthPx;

      const grad = ctx.createLinearGradient(x, 0, x + w, 0);
      if (o.side === 'left') {
        grad.addColorStop(0, shadeColor(color, -0.2));
        grad.addColorStop(1, shadeColor(color, 0.25));
      } else {
        grad.addColorStop(0, shadeColor(color, 0.25));
        grad.addColorStop(1, shadeColor(color, -0.2));
      }

      ctx.save();
      ctx.shadowColor = color;
      ctx.shadowBlur = 18;
      ctx.fillStyle = grad;
      ctx.fillRect(x, top, w, o.thickness);
      ctx.shadowBlur = 0;

      const edgeX = o.side === 'left' ? x + w : x;
      const pulse = 0.6 + Math.sin(this.coreTime * 5) * 0.3;
      ctx.globalAlpha = pulse;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(edgeX, top);
      ctx.lineTo(edgeX, top + o.thickness);
      ctx.stroke();
      ctx.restore();
    }
  }

  _drawPickups(ctx) {
    for (const p of this.pickups) {
      if (p.collected) continue;
      if (p.type === 'shield') this._drawShieldIcon(ctx, p.x, p.y);
      else this._drawGem(ctx, p.x, p.y);
    }
  }

  _drawGem(ctx, x, y) {
    const pulse = 1 + Math.sin(this.coreTime * 4 + x) * 0.08;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.PI / 4);
    ctx.shadowColor = '#ffd23d';
    ctx.shadowBlur = 12;
    ctx.fillStyle = '#ffd23d';
    const s = 7 * pulse;
    ctx.fillRect(-s, -s, s * 2, s * 2);
    ctx.restore();
  }

  /** Hexagon icon - visually distinct from the diamond gem at a glance. */
  _drawShieldIcon(ctx, x, y) {
    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i - Math.PI / 2;
      const px = Math.cos(a) * 11;
      const py = Math.sin(a) * 11;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = CONFIG.SHIELD_COLOR;
    ctx.shadowColor = CONFIG.SHIELD_COLOR;
    ctx.shadowBlur = 14;
    ctx.fill();
    ctx.restore();
  }

  _drawTrail(ctx) {
    for (let i = 0; i < this.trail.length; i++) {
      const t = this.trail[i];
      const age = i / this.trail.length;
      const color = t.polarity === 'red' ? CONFIG.RED : CONFIG.BLUE;
      ctx.globalAlpha = age * 0.5;
      ctx.beginPath();
      ctx.arc(t.x, t.y, CONFIG.BALL_RADIUS * age * 0.75, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  _drawBall(ctx) {
    const color = this.ballPolarity === 'red' ? CONFIG.RED : CONFIG.BLUE;
    const pulse = 1 + Math.sin(this.coreTime * 6) * 0.06;
    const r = CONFIG.BALL_RADIUS * pulse;

    if (this.hasShield) {
      const shieldPulse = 1 + Math.sin(this.coreTime * 6) * 0.12;
      ctx.beginPath();
      ctx.arc(this.ballX, this.ballScreenY, (r + 7) * shieldPulse, 0, Math.PI * 2);
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = CONFIG.SHIELD_COLOR;
      ctx.shadowColor = CONFIG.SHIELD_COLOR;
      ctx.shadowBlur = 12;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    const grad = ctx.createRadialGradient(
      this.ballX - r * 0.35, this.ballScreenY - r * 0.4, r * 0.1,
      this.ballX, this.ballScreenY, r * 1.1
    );
    grad.addColorStop(0, shadeColor(color, 0.6));
    grad.addColorStop(0.55, color);
    grad.addColorStop(1, shadeColor(color, -0.3));

    ctx.save();
    ctx.beginPath();
    ctx.arc(this.ballX, this.ballScreenY, r, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.shadowColor = color;
    ctx.shadowBlur = 20;
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.ellipse(this.ballX - r * 0.3, this.ballScreenY - r * 0.35, r * 0.32, r * 0.2, -0.6, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.restore();

    // A slim accent ring in the current cosmetic theme color, so skins stay visible even
    // though the core polarity color itself never changes.
    ctx.save();
    ctx.globalAlpha = 0.8;
    ctx.lineWidth = 2;
    ctx.strokeStyle = this.trailAccent;
    ctx.beginPath();
    ctx.arc(this.ballX, this.ballScreenY, r + 3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}
