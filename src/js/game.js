import { CONFIG } from './config.js';
import { PhysicsWorld, Ball } from './physics.js';
import { pickSpawnTier, comboColor, itemVisual } from './entities.js';
import { Particles, FloatingTexts, ScreenShake, shadeColor } from './fx.js';

const STATE = {
  IDLE: 'idle',
  PLAYING: 'playing',
  PAUSED: 'paused',
  GAMEOVER: 'gameover',
};

const RESTING_SPEED_PX_S = 14; // below this, a ball counts as "settled" for overflow purposes

export class Game {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} callbacks
   *   onScoreChange(score), onMerge(chainCount, tier), onNewBestCrossed(),
   *   onFreezeChange(active), onFreezeSave(), onGameOver(score),
   *   onQueueChange(nextItem), onTutorialHint(show), onDrop()
   */
  constructor(canvas, callbacks = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.callbacks = callbacks;

    this.state = STATE.IDLE;
    this.width = 0;
    this.height = 0;
    this.dpr = 1;

    this.theme = CONFIG.THEMES[0].colors;
    this.world = new PhysicsWorld({ left: 0, right: 0, top: 0, bottom: 0 });

    this.jarLeft = 0;
    this.jarRight = 0;
    this.jarTop = 0;
    this.jarBottom = 0;
    this.overflowLineY = 0;

    this.queue = ['freeze']; // placeholder until first startNewRun(); never actually drawn in idle state
    this.previewX = 0;
    this.pointerActive = false;
    this.dropCooldownMs = 0;

    this.leftHeld = false;
    this.rightHeld = false;

    this.score = 0;
    this.hasFreeze = false;
    this.comboCount = 0;
    this.lastMergeAtMs = -Infinity;
    this.elapsedSincePlayMs = 0;
    this.highestTierReached = 0;
    this.bestScoreAtStart = 0;
    this.crossedBest = false;

    this.particles = new Particles();
    this.floatingTexts = new FloatingTexts();
    this.shake = new ScreenShake();
    this.hitStopMs = 0;
    this.gameOverFlashMs = 0;
    this.coreTime = 0;

    this.ambientSpawnTimer = 0;

    this._bgGradient = null;
    // Slow-drifting soft glow dots behind the jar, purely atmospheric - fixed random layout
    // so it doesn't need to be regenerated, just re-projected onto whatever the canvas size is.
    this.bgParticles = Array.from({ length: 16 }, () => ({
      nx: Math.random(),
      ny: Math.random(),
      r: 26 + Math.random() * 50,
      speed: 0.15 + Math.random() * 0.3,
      phase: Math.random() * Math.PI * 2,
    }));

    this.lastFrameTime = 0;
    this.rafId = null;

    this._resize = this._resize.bind(this);
    this._onPointerDown = this._onPointerDown.bind(this);
    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerUp = this._onPointerUp.bind(this);
    this._loop = this._loop.bind(this);

    window.addEventListener('resize', this._resize);
    this._resize();

    canvas.addEventListener('pointerdown', this._onPointerDown);
    canvas.addEventListener('pointermove', this._onPointerMove);
    window.addEventListener('pointerup', this._onPointerUp);
    window.addEventListener('pointercancel', this._onPointerUp);

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

    const jarWidth = this.width * CONFIG.JAR_WIDTH_FRACTION;
    const jarHeight = this.height * CONFIG.JAR_HEIGHT_FRACTION;
    this.jarLeft = (this.width - jarWidth) / 2;
    this.jarRight = this.jarLeft + jarWidth;
    this.jarTop = this.height * 0.16;
    this.jarBottom = this.jarTop + jarHeight;
    this.overflowLineY = this.jarTop + jarHeight * CONFIG.OVERFLOW_LINE_FRACTION;

    const wall = CONFIG.JAR_WALL_THICKNESS;
    this.world.setBounds({
      left: this.jarLeft + wall,
      right: this.jarRight - wall,
      top: this.jarTop,
      bottom: this.jarBottom - wall,
    });

    if (!this.previewX) this.previewX = (this.jarLeft + this.jarRight) / 2;

    const bgGrad = this.ctx.createRadialGradient(
      this.width / 2, this.height * 0.32, 10,
      this.width / 2, this.height * 0.32, Math.max(this.width, this.height) * 0.85
    );
    bgGrad.addColorStop(0, '#121d38');
    bgGrad.addColorStop(1, CONFIG.BG);
    this._bgGradient = bgGrad;
  }

  /** Cosmetic re-skin only - recolors the jar, never the balls (tier colors stay constant so values stay readable). */
  setTheme(index) {
    const theme = CONFIG.THEMES[index];
    if (theme) this.theme = theme.colors;
  }

  setTiltHeld(side, held) {
    if (side === 'left') this.leftHeld = held;
    else this.rightHeld = held;
  }

  _nextQueueItem() {
    if (Math.random() < CONFIG.FREEZE_BALL_CHANCE) return 'freeze';
    return pickSpawnTier(this.highestTierReached);
  }

  startNewRun(bestScore = 0, showTutorial = false) {
    this.world.clear();
    this.score = 0;
    this.hasFreeze = false;
    this.comboCount = 0;
    this.lastMergeAtMs = -Infinity;
    this.elapsedSincePlayMs = 0;
    this.highestTierReached = 0;
    this.bestScoreAtStart = bestScore;
    this.crossedBest = false;
    this.hitStopMs = 0;
    this.gameOverFlashMs = 0;
    this.particles.clear();
    this.floatingTexts.clear();
    this.shake.trauma = 0;
    this.world.tiltAngle = 0;
    this.leftHeld = false;
    this.rightHeld = false;
    this.dropCooldownMs = 0;
    this.previewX = (this.jarLeft + this.jarRight) / 2;

    this.queue = [this._nextQueueItem(), this._nextQueueItem()];
    this.state = STATE.PLAYING;

    this._emitScore();
    if (this.callbacks.onQueueChange) this.callbacks.onQueueChange(this.queue[1]);
    if (this.callbacks.onFreezeChange) this.callbacks.onFreezeChange(false);
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

  /** Revive after a game-over (e.g. the player watched a rewarded ad) - clears breathing room, no bonus score. */
  continueRun() {
    if (this.state !== STATE.GAMEOVER) return;
    this._clearTopBalls(CONFIG.CONTINUE_CLEAR_BALL_COUNT);
    this.hitStopMs = 0;
    this.gameOverFlashMs = 0;
    this.shake.trauma = 0;
    this.state = STATE.PLAYING;
  }

  _onPointerDown(e) {
    if (this.state !== STATE.PLAYING) return;
    e.preventDefault();
    this.pointerActive = true;
    this._updatePreviewX(e.clientX);
  }

  _onPointerMove(e) {
    if (!this.pointerActive) return;
    this._updatePreviewX(e.clientX);
  }

  _onPointerUp() {
    if (!this.pointerActive) return;
    this.pointerActive = false;
    this._tryDrop();
  }

  _updatePreviewX(clientX) {
    const visual = itemVisual(this.queue[0]);
    this.previewX = Math.max(this.world.left + visual.radius, Math.min(this.world.right - visual.radius, clientX));
  }

  _tryDrop() {
    if (this.state !== STATE.PLAYING || this.dropCooldownMs > 0) return;
    this.dropCooldownMs = CONFIG.DROP_COOLDOWN_MS;

    const item = this.queue[0];
    this.queue[0] = this.queue[1];
    this.queue[1] = this._nextQueueItem();

    const visual = itemVisual(item);
    const x = Math.max(this.world.left + visual.radius, Math.min(this.world.right - visual.radius, this.previewX));
    const y = this._findSafeSpawnY(x, visual.radius);
    const ball = item === 'freeze' ? new Ball(x, y, 0, 'freeze') : new Ball(x, y, item);
    this.world.addBall(ball);

    if (this.callbacks.onQueueChange) this.callbacks.onQueueChange(this.queue[1]);
    if (this.callbacks.onTutorialHint) this.callbacks.onTutorialHint(false);
    if (this.callbacks.onDrop) this.callbacks.onDrop();
  }

  /**
   * The default drop point, unless something is already sitting there - in which case rapid
   * back-to-back drops would otherwise spawn a ball already overlapping the last one, which
   * the solver then resolves as an instant same-frame merge before either ball has actually
   * fallen. Instead, start the new ball just above whatever's in its way, so it always drops
   * into the jar rather than appearing to vanish mid-air.
   */
  _findSafeSpawnY(x, radius) {
    const baseY = this.jarTop + (this.jarBottom - this.jarTop) * CONFIG.BALL_SPAWN_Y_FRACTION;
    let spawnY = baseY;
    for (const b of this.world.balls) {
      if (b.merging) continue;
      const dx = Math.abs(b.x - x);
      const combined = b.radius + radius + 3;
      if (dx >= combined) continue;
      const clearance = Math.sqrt(Math.max(combined * combined - dx * dx, 0));
      const neededY = b.y - clearance;
      if (neededY < spawnY) spawnY = neededY;
    }
    return spawnY;
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
    if (this.dropCooldownMs > 0) this.dropCooldownMs = Math.max(0, this.dropCooldownMs - rawDt * 1000);

    const tiltDir = (this.rightHeld ? 1 : 0) - (this.leftHeld ? 1 : 0);
    const targetAngle = tiltDir * CONFIG.TILT_MAX_ANGLE;
    this.world.tiltAngle += (targetAngle - this.world.tiltAngle) * Math.min(1, CONFIG.TILT_EASE_RATE * rawDt);

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
    this.elapsedSincePlayMs += dt * 1000;
    this.world.step(dt);
    this._resolveMerges();
    this._checkOverflow(dt);
  }

  _resolveMerges() {
    for (const pair of this.world.mergePairs) {
      if (pair.a.merging || pair.b.merging) continue;
      if (pair.isFreezePickup) this._resolveFreezePickup(pair.a, pair.b);
      else this._resolveMerge(pair.a, pair.b);
    }
    if (this.world.mergePairs.length > 0) {
      this.world.balls = this.world.balls.filter((b) => !b.merging);
    }
  }

  _resolveMerge(a, b) {
    a.merging = true;
    b.merging = true;
    const tier = a.tier;
    const midX = (a.x + b.x) / 2;
    const midY = (a.y + b.y) / 2;

    if (this.elapsedSincePlayMs - this.lastMergeAtMs <= CONFIG.CHAIN_WINDOW_MS) this.comboCount += 1;
    else this.comboCount = 1;
    this.lastMergeAtMs = this.elapsedSincePlayMs;

    const isMaxTier = tier >= CONFIG.TIERS.length - 1;
    if (isMaxTier) {
      // Jackpot: two max-tier orbs meet. Both are consumed for a big score burst instead of
      // producing a tier that doesn't exist - keeps the physics well-defined at the ceiling.
      const points = CONFIG.TIERS[tier].value * 2 * this.comboCount;
      this.score += points;
      this.particles.spawnBurst(midX, midY, CONFIG.TIERS[tier].color, 30);
      this.floatingTexts.spawn(midX, midY - 12, `+${points}`, { color: '#ffd23d', size: 24, life: 1 });
      this.shake.trigger(0.5);
      this.hitStopMs = Math.max(this.hitStopMs, 70);
    } else {
      const newTier = tier + 1;
      const newBall = new Ball(midX, midY, newTier);
      newBall.vy = -60; // small pop so it doesn't instantly re-collide with the frame it was born on
      this.world.addBall(newBall);
      this.highestTierReached = Math.max(this.highestTierReached, newTier);

      const points = CONFIG.TIERS[newTier].value * this.comboCount;
      this.score += points;
      this.particles.spawnBurst(midX, midY, CONFIG.TIERS[newTier].color, this.comboCount >= 3 ? 16 : 9);
      this.floatingTexts.spawn(midX, midY - 10, `+${points}`, {
        color: this.comboCount >= 2 ? comboColor(this.comboCount) : '#eafffe',
        size: 15 + Math.min(this.comboCount, 8),
      });
      if (this.comboCount >= 2) {
        this.floatingTexts.spawn(midX, midY - 30, `x${this.comboCount} CHAIN`, {
          color: comboColor(this.comboCount),
          size: 16 + Math.min(this.comboCount, 8) * 1.6,
          life: 0.7,
          vy: -55,
        });
      }
      if (this.comboCount >= 5) {
        this.hitStopMs = Math.max(this.hitStopMs, 55);
        this.shake.trigger(0.3);
      } else if (this.comboCount >= 3) {
        this.hitStopMs = Math.max(this.hitStopMs, 35);
        this.shake.trigger(0.16);
      }
    }

    this._emitScore();
    this._checkNewBest();
    if (this.callbacks.onMerge) this.callbacks.onMerge(this.comboCount, tier);
  }

  _resolveFreezePickup(freezeBall) {
    freezeBall.merging = true;
    const { x, y } = freezeBall;
    if (this.hasFreeze) {
      this.score += CONFIG.FREEZE_BONUS_IF_ALREADY_ACTIVE;
      this.particles.spawnBurst(x, y, CONFIG.FREEZE_COLOR, 10);
      this.floatingTexts.spawn(x, y - 10, `+${CONFIG.FREEZE_BONUS_IF_ALREADY_ACTIVE}`, {
        color: CONFIG.FREEZE_COLOR,
        size: 16,
      });
    } else {
      this.hasFreeze = true;
      this.particles.spawnBurst(x, y, CONFIG.FREEZE_COLOR, 14);
      this.floatingTexts.spawn(x, y - 10, 'FREEZE', { color: CONFIG.FREEZE_COLOR, size: 15 });
      if (this.callbacks.onFreezeChange) this.callbacks.onFreezeChange(true);
    }
    this._emitScore();
  }

  _checkOverflow(dt) {
    let overflowing = false;
    for (const b of this.world.balls) {
      if (b.merging) continue;
      const speed = Math.hypot(b.settleVx, b.settleVy);
      const pokesAboveLine = b.y - b.radius < this.overflowLineY;
      if (pokesAboveLine && speed < RESTING_SPEED_PX_S) {
        b.aboveLineMs += dt * 1000;
        if (b.aboveLineMs >= CONFIG.OVERFLOW_GRACE_MS) overflowing = true;
      } else {
        b.aboveLineMs = 0;
      }
    }
    if (!overflowing) return;
    if (this.hasFreeze) this._consumeFreeze();
    else this._triggerGameOver();
  }

  /** Removes the topmost `count` balls (by position, not value) with no score change - shared by the freeze save and the ad-continue. */
  _clearTopBalls(count) {
    const sorted = this.world.balls.slice().sort((p, q) => p.y - q.y);
    const toRemove = sorted.slice(0, Math.min(count, sorted.length));
    for (const b of toRemove) this.world.removeBall(b);
    for (const b of this.world.balls) b.aboveLineMs = 0;
  }

  _consumeFreeze() {
    this.hasFreeze = false;
    this._clearTopBalls(CONFIG.FREEZE_CLEAR_BALL_COUNT);
    const cx = (this.jarLeft + this.jarRight) / 2;
    this.particles.spawnBurst(cx, this.overflowLineY, CONFIG.FREEZE_COLOR, 22);
    this.floatingTexts.spawn(cx, this.overflowLineY - 14, 'SAVED', { color: CONFIG.FREEZE_COLOR, size: 18, life: 0.8 });
    this.shake.trigger(0.4);
    this.hitStopMs = Math.max(this.hitStopMs, 70);
    if (this.callbacks.onFreezeChange) this.callbacks.onFreezeChange(false);
    if (this.callbacks.onFreezeSave) this.callbacks.onFreezeSave();
  }

  _checkNewBest() {
    if (this.crossedBest || this.bestScoreAtStart <= 0) return;
    if (this.score <= this.bestScoreAtStart) return;
    this.crossedBest = true;
    const cx = (this.jarLeft + this.jarRight) / 2;
    this.floatingTexts.spawn(cx, this.jarTop - 20, 'NEW BEST!', {
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
    const cx = (this.jarLeft + this.jarRight) / 2;
    this.shake.trigger(1);
    this.hitStopMs = 160;
    this.gameOverFlashMs = 280;
    this.particles.spawnBurst(cx, this.overflowLineY, '#ff3b5c', 26);
    if (this.callbacks.onGameOver) this.callbacks.onGameOver(this.score);
  }

  _emitScore() {
    if (this.callbacks.onScoreChange) this.callbacks.onScoreChange(this.score);
  }

  // ---------------- ambient menu background ----------------
  // Reuses the exact same jar + physics (purely decorative - no overflow, no score) so the
  // menu shows a live preview of what's about to be played, same idea as Orbit Dash's idle mode.

  _updateAmbient(dt) {
    this.world.tiltAngle = Math.sin(this.coreTime * 0.5) * CONFIG.TILT_MAX_ANGLE * 0.6;
    this.ambientSpawnTimer -= dt * 1000;
    if (this.ambientSpawnTimer <= 0 && this.world.balls.length < 16) {
      const tier = Math.floor(Math.random() * 3);
      const x = this.world.left + Math.random() * (this.world.right - this.world.left);
      this.world.addBall(new Ball(x, this.jarTop + 10, tier));
      this.ambientSpawnTimer = 500 + Math.random() * 400;
    }
    this.world.step(dt);
    // Ambient merges still look satisfying but never touch score/freeze state.
    for (const pair of this.world.mergePairs) {
      if (pair.isFreezePickup || pair.a.merging || pair.b.merging) continue;
      pair.a.merging = true;
      pair.b.merging = true;
      const tier = pair.a.tier;
      if (tier < CONFIG.TIERS.length - 1) {
        const mid = { x: (pair.a.x + pair.b.x) / 2, y: (pair.a.y + pair.b.y) / 2 };
        this.world.addBall(new Ball(mid.x, mid.y, tier + 1));
      }
    }
    this.world.balls = this.world.balls.filter((b) => !b.merging && b.y < this.jarBottom + 40);
  }

  // ---------------- rendering ----------------

  _render() {
    const { ctx } = this;
    ctx.fillStyle = this._bgGradient || CONFIG.BG;
    ctx.fillRect(0, 0, this.width, this.height);
    this._drawBackgroundAmbient(ctx);

    ctx.save();
    const shakeOff = this.shake.getOffset();
    ctx.translate(shakeOff.x, shakeOff.y);

    this._drawJarShadow(ctx);
    this._drawJar(ctx);
    this._drawBalls(ctx);
    if (this.state === STATE.PLAYING) this._drawPreview(ctx);
    this.particles.draw(ctx);
    this.floatingTexts.draw(ctx);

    ctx.restore();

    if (this.gameOverFlashMs > 0) {
      const alpha = (this.gameOverFlashMs / 280) * 0.4;
      ctx.fillStyle = `rgba(255, 59, 92, ${alpha})`;
      ctx.fillRect(0, 0, this.width, this.height);
    }
  }

  /** Soft drifting glow dots behind everything - cheap atmosphere, re-tinted per jar theme. */
  _drawBackgroundAmbient(ctx) {
    ctx.save();
    for (const p of this.bgParticles) {
      const x = p.nx * this.width;
      const driftY = (p.ny * this.height + this.coreTime * p.speed * 14) % (this.height + p.r * 2);
      const y = driftY - p.r;
      const alpha = 0.06 + 0.03 * Math.sin(this.coreTime * 0.5 + p.phase);
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.beginPath();
      ctx.arc(x, y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = this.theme.jarGlow;
      ctx.shadowColor = this.theme.jarGlow;
      ctx.shadowBlur = 50;
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  _jarRadius() {
    return 22;
  }

  /** Traces the jar's outline - open top, rounded bottom corners - shared by the fill and stroke passes. */
  _jarOutlinePath(ctx) {
    const r = this._jarRadius();
    const { jarLeft: l, jarRight: rr, jarTop: t, jarBottom: b } = this;
    ctx.beginPath();
    ctx.moveTo(l, t - 6);
    ctx.lineTo(l, b - r);
    ctx.quadraticCurveTo(l, b, l + r, b);
    ctx.lineTo(rr - r, b);
    ctx.quadraticCurveTo(rr, b, rr, b - r);
    ctx.lineTo(rr, t - 6);
  }

  _drawJarShadow(ctx) {
    const cx = (this.jarLeft + this.jarRight) / 2;
    const jarWidth = this.jarRight - this.jarLeft;
    ctx.save();
    const grad = ctx.createRadialGradient(cx, this.jarBottom + 8, 4, cx, this.jarBottom + 8, jarWidth * 0.6);
    grad.addColorStop(0, 'rgba(0, 0, 0, 0.4)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(cx, this.jarBottom + 8, jarWidth * 0.6, 16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  _drawJar(ctx) {
    ctx.save();

    // Glass fill - just enough tint to read as a vessel, not so much it competes with the balls.
    const fillGrad = ctx.createLinearGradient(0, this.jarTop, 0, this.jarBottom);
    fillGrad.addColorStop(0, 'rgba(255, 255, 255, 0.07)');
    fillGrad.addColorStop(1, 'rgba(255, 255, 255, 0.015)');
    this._jarOutlinePath(ctx);
    ctx.fillStyle = fillGrad;
    ctx.fill();

    // Wall stroke - bright glass rim fading toward the base, with an ambient glow behind it.
    const wallGrad = ctx.createLinearGradient(0, this.jarTop, 0, this.jarBottom);
    wallGrad.addColorStop(0, 'rgba(255, 255, 255, 0.7)');
    wallGrad.addColorStop(0.15, this.theme.jarWall);
    wallGrad.addColorStop(1, 'rgba(255, 255, 255, 0.15)');
    ctx.lineJoin = 'round';
    ctx.lineWidth = CONFIG.JAR_WALL_THICKNESS;
    ctx.shadowColor = this.theme.jarGlow;
    ctx.shadowBlur = 22;
    this._jarOutlinePath(ctx);
    ctx.strokeStyle = wallGrad;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Two short vertical glints near the top edges - the classic "glass highlight" cue.
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(this.jarLeft + 5, this.jarTop + 2);
    ctx.lineTo(this.jarLeft + 5, this.jarTop + 46);
    ctx.moveTo(this.jarRight - 5, this.jarTop + 2);
    ctx.lineTo(this.jarRight - 5, this.jarTop + 46);
    ctx.stroke();
    ctx.restore();

    if (this.state === STATE.PLAYING) this._drawOverflowLine(ctx);
  }

  _drawOverflowLine(ctx) {
    const pulse = 0.45 + Math.sin(this.coreTime * 4) * 0.25;
    ctx.save();
    const grad = ctx.createLinearGradient(this.jarLeft, 0, this.jarRight, 0);
    grad.addColorStop(0, 'rgba(255, 90, 90, 0)');
    grad.addColorStop(0.5, `rgba(255, 90, 90, ${pulse})`);
    grad.addColorStop(1, 'rgba(255, 90, 90, 0)');
    ctx.setLineDash([8, 7]);
    ctx.lineDashOffset = -this.coreTime * 14;
    ctx.strokeStyle = grad;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(this.jarLeft, this.overflowLineY);
    ctx.lineTo(this.jarRight, this.overflowLineY);
    ctx.stroke();
    ctx.restore();
  }

  _drawBalls(ctx) {
    for (const b of this.world.balls) {
      const isFreeze = b.special === 'freeze';
      const color = isFreeze ? CONFIG.FREEZE_COLOR : CONFIG.TIERS[b.tier].color;
      const label = isFreeze ? '★' : String(CONFIG.TIERS[b.tier].value);
      this._drawBallShape(ctx, b.x, b.y, b.radius, color, label, 1, isFreeze);
    }
  }

  /** A glossy gem-like sphere with a specular highlight and a bold outlined value label - the
   * visual language that ties the physics jar back to its 2048 lineage (numbers, not fruit). */
  _drawBallShape(ctx, x, y, radius, color, label, alpha = 1, glowBoost = false) {
    ctx.save();
    ctx.globalAlpha = alpha;

    const bodyGrad = ctx.createRadialGradient(
      x - radius * 0.35, y - radius * 0.4, radius * 0.1,
      x, y, radius * 1.05
    );
    bodyGrad.addColorStop(0, shadeColor(color, 0.55));
    bodyGrad.addColorStop(0.55, color);
    bodyGrad.addColorStop(1, shadeColor(color, -0.35));

    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = bodyGrad;
    ctx.shadowColor = glowBoost ? 'rgba(234, 255, 255, 0.9)' : color;
    ctx.shadowBlur = glowBoost ? 20 : 10;
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.lineWidth = Math.max(1, radius * 0.06);
    ctx.strokeStyle = shadeColor(color, -0.45);
    ctx.globalAlpha = alpha * 0.6;
    ctx.stroke();

    // Specular highlight - a soft light-source ellipse, upper-left.
    ctx.globalAlpha = alpha * 0.55;
    ctx.beginPath();
    ctx.ellipse(x - radius * 0.32, y - radius * 0.38, radius * 0.34, radius * 0.2, -0.6, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    ctx.globalAlpha = alpha;
    ctx.font = `800 ${Math.max(11, radius * 0.62)}px 'Fredoka', system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = Math.max(1.5, radius * 0.1);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.strokeText(label, x, y + 1);
    ctx.fillStyle = 'rgba(8, 12, 26, 0.9)';
    ctx.fillText(label, x, y + 1);

    ctx.restore();
  }

  _drawPreview(ctx) {
    const visual = itemVisual(this.queue[0]);
    const y = this.jarTop + (this.jarBottom - this.jarTop) * CONFIG.BALL_SPAWN_Y_FRACTION;

    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.strokeStyle = visual.color;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 5]);
    ctx.beginPath();
    ctx.moveTo(this.previewX, y + visual.radius);
    ctx.lineTo(this.previewX, this.jarBottom);
    ctx.stroke();
    ctx.restore();

    this._drawBallShape(ctx, this.previewX, y, visual.radius, visual.color, visual.label, 0.85);
  }
}
