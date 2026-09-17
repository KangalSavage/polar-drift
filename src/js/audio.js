// Lightweight synthesized SFX via the Web Audio API - no audio asset files,
// no licensing concerns, tiny bundle footprint. AudioContext is created lazily
// and unlocked on the first user gesture (required by iOS/Chrome autoplay policy).

export class AudioManager {
  constructor() {
    this.ctx = null;
    this.enabled = true;
  }

  _ensureContext() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  /** Call from within a user-gesture handler (e.g. Start button click) to unlock audio on iOS. */
  unlock() {
    this._ensureContext();
  }

  /**
   * Tear down the current AudioContext so the next sound lazily builds a fresh one.
   * Needed after showing a native AdMob video ad: it takes over the app's AVAudioSession
   * on iOS and doesn't reliably hand it back, leaving the old WebAudio context silently
   * dead even though .resume() reports success. A brand new context on the next real user
   * tap re-negotiates the audio session correctly.
   */
  reset() {
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
  }

  setEnabled(enabled) {
    this.enabled = enabled;
  }

  /** Polarity flip - a quick two-tone blip, pitched by which charge it's flipping *to*. */
  playFlip(toRed) {
    if (!this.enabled) return;
    const ctx = this._ensureContext();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'square';
    const base = toRed ? 340 : 480;
    osc.frequency.setValueAtTime(base, now);
    osc.frequency.exponentialRampToValueAtTime(base * 1.35, now + 0.05);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.11, now + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.07);

    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.08);
  }

  /** Gem grabbed. Pitch rises with the combo streak. */
  playGem(comboCount = 1) {
    if (!this.enabled) return;
    const ctx = this._ensureContext();
    const now = ctx.currentTime;

    const baseFreq = 420;
    const freq = Math.min(baseFreq + (comboCount - 1) * 60, 1400);

    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.5, now + 0.08);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.26, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);

    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.15);
  }

  /** A close, skillful pass along a wall (near-miss) - a subtle whoosh, not as loud as a gem. */
  playNearMiss() {
    if (!this.enabled) return;
    const ctx = this._ensureContext();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(900, now);
    osc.frequency.exponentialRampToValueAtTime(500, now + 0.1);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.09, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);

    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.13);
  }

  /** Short triumphant ascending chime the moment the player passes their best score mid-run. */
  playNewBest() {
    if (!this.enabled) return;
    const ctx = this._ensureContext();
    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99]; // C5 E5 G5
    notes.forEach((freq, i) => {
      const start = now + i * 0.075;
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, start);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.22, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.22);

      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.24);
    });
  }

  /** Shield charge gained - a short two-note shimmer, distinct from the gem chime. */
  playShieldGain() {
    if (!this.enabled) return;
    const ctx = this._ensureContext();
    const now = ctx.currentTime;
    const notes = [660, 880];
    notes.forEach((freq, i) => {
      const start = now + i * 0.05;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.18, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.16);

      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.18);
    });
  }

  /** Shield absorbs a wrong-polarity hit - a short metallic clang instead of the full crash tone. */
  playShieldBreak() {
    if (!this.enabled) return;
    const ctx = this._ensureContext();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(90, now + 0.12);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.24, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);

    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.2);
  }

  /** Short descending tone on game over (wrong-polarity crash). */
  playGameOver() {
    if (!this.enabled) return;
    const ctx = this._ensureContext();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(55, now + 0.55);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.3, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);

    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.62);
  }
}
