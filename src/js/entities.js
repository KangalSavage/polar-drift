import { CONFIG } from './config.js';

/** A colored block jutting in from one shaft wall. Scrolls upward (y decreases) toward the ball. */
export class Obstacle {
  constructor(side, polarity, depthPx, y, thickness = CONFIG.OBSTACLE_THICKNESS_PX) {
    this.side = side; // 'left' | 'right'
    this.polarity = polarity; // 'red' | 'blue'
    this.depthPx = depthPx; // how far it juts into the shaft from its wall
    this.y = y;
    this.thickness = thickness;
    this.scored = false; // has the pass/near-miss bonus already been evaluated for this one?
    this.dangerHandled = false; // has a wrong-polarity contact with this one already been resolved (death or shield)?
    this.alive = true;
    this.isTutorialGate = false; // set by spawnObstacles() for spawn #0 - see Game._update's forced-teaching pause
  }
}

/** A gem (score) or shield (one-time save) floating in the shaft, independent of any wall. */
export class Pickup {
  constructor(type, x, y) {
    this.type = type; // 'gem' | 'shield'
    this.x = x;
    this.y = y;
    this.radius = type === 'shield' ? 12 : 8;
    this.collected = false;
    this.alive = true;
  }
}

/** Combo popup color - heats up from cyan to gold to hot orange as the gem streak grows. */
export function comboColor(count) {
  if (count >= 5) return '#ff5a3d';
  if (count >= 3) return '#ffd23d';
  return '#3dfcff';
}

/**
 * Smooth, continuous difficulty curve. First DIFFICULTY_GRACE_MS stays flat (learning
 * window), then eases toward the harder ceiling via exponential decay - no sudden jumps.
 */
export function getDifficulty(elapsedMs, scale = 1) {
  const t = Math.max(0, elapsedMs - CONFIG.DIFFICULTY_GRACE_MS);
  const progress = 1 - Math.exp(-t / CONFIG.FALL_SPEED_RAMP_TAU_MS);
  const fallSpeed = (CONFIG.FALL_SPEED_BASE + (CONFIG.FALL_SPEED_MAX - CONFIG.FALL_SPEED_BASE) * progress) * scale;
  const spawnIntervalMs =
    CONFIG.SPAWN_INTERVAL_BASE_MS - (CONFIG.SPAWN_INTERVAL_BASE_MS - CONFIG.SPAWN_INTERVAL_MIN_MS) * progress;
  return { fallSpeed, spawnIntervalMs, progress };
}

/**
 * Builds the next obstacle spawn (one block, or two at the same height once the run has
 * warmed up) plus an optional pickup placed in the surviving safe gap. Fairness rule: a
 * spawn's combined wall intrusion is capped so a physical gap always remains - polarity
 * choice determines whether it's *comfortable*, never whether it's *possible*.
 *
 * @param {number} spawnIndex 0 for the very first, fixed teaching spawn
 * @param {number} spawnY world/screen Y the spawn appears at (below the visible area)
 * @param {number} shaftWidth current shaft width in px, for converting depth fractions to px
 * @param {number} thicknessPx device-scaled obstacle thickness (see Game._resize)
 */
export function spawnObstacles(spawnIndex, spawnY, shaftWidth, thicknessPx) {
  const isTutorial = spawnIndex === 0;

  const side = isTutorial ? 'left' : Math.random() < 0.5 ? 'left' : 'right';
  // The tutorial obstacle is always the *opposite* of the ball's fixed starting charge
  // ('red', see Game.startNewRun) - it has to force a flip, not let the player coast through
  // by doing nothing. Combined with Game's forced pause on this specific obstacle, this is
  // where a first-time player learns the rule by being made to act on it, not just read it.
  const polarity = isTutorial ? 'blue' : Math.random() < 0.5 ? 'red' : 'blue';
  const depthFrac = isTutorial
    ? CONFIG.OBSTACLE_DEPTH_MIN_FRACTION
    : CONFIG.OBSTACLE_DEPTH_MIN_FRACTION +
      Math.random() * (CONFIG.OBSTACLE_DEPTH_MAX_FRACTION - CONFIG.OBSTACLE_DEPTH_MIN_FRACTION);

  const obstacles = [new Obstacle(side, polarity, depthFrac * shaftWidth, spawnY, thicknessPx)];
  if (isTutorial) obstacles[0].isTutorialGate = true;

  const wantsDoubleSided =
    !isTutorial &&
    spawnIndex >= CONFIG.DOUBLE_SIDED_MIN_SPAWN_INDEX &&
    Math.random() < CONFIG.DOUBLE_SIDED_CHANCE_LATE;

  if (wantsDoubleSided) {
    const otherSide = side === 'left' ? 'right' : 'left';
    // Must match the primary block's polarity, never the opposite one: repelling off a
    // same-charge wall always pushes the ball toward whichever wall is on the other side,
    // so a mixed-color pair would make the wrong-feeling choice unsurvivable no matter
    // which polarity the player picks. Same-color-both-sides keeps it fair: match it and
    // both walls hold you safely in the gap, get it wrong and both sides are dangerous.
    const otherPolarity = polarity;
    let otherDepthFrac = CONFIG.OBSTACLE_DEPTH_MIN_FRACTION * (0.55 + Math.random() * 0.3);

    const combined = depthFrac + otherDepthFrac;
    if (combined > CONFIG.DOUBLE_SIDED_MAX_COMBINED_FRACTION) {
      const scale = CONFIG.DOUBLE_SIDED_MAX_COMBINED_FRACTION / combined;
      obstacles[0].depthPx *= scale;
      otherDepthFrac *= scale;
    }
    obstacles.push(new Obstacle(otherSide, otherPolarity, otherDepthFrac * shaftWidth, spawnY, thicknessPx));
  }

  return obstacles;
}

/**
 * Picks what (if anything) floats in the safe gap of a spawn: nothing, a gem, or - rarely,
 * and mutually exclusive with a gem - a shield charge. Positioned toward the open side so
 * grabbing it correlates with actually surviving the obstacle rather than dumb luck.
 */
export function spawnPickup(obstacles, spawnY, shaftLeft, shaftRight) {
  const roll = Math.random();
  let type = null;
  if (roll < CONFIG.SHIELD_CHANCE) type = 'shield';
  else if (roll < CONFIG.SHIELD_CHANCE + CONFIG.GEM_CHANCE) type = 'gem';
  if (!type) return null;

  // Lean toward whichever side has less wall intrusion this spawn (the roomier side).
  const leftObstacle = obstacles.find((o) => o.side === 'left');
  const rightObstacle = obstacles.find((o) => o.side === 'right');
  const leftDepth = leftObstacle ? leftObstacle.depthPx : 0;
  const rightDepth = rightObstacle ? rightObstacle.depthPx : 0;
  const bias = leftDepth > rightDepth ? 0.62 : leftDepth < rightDepth ? 0.38 : 0.5;
  const x = shaftLeft + (shaftRight - shaftLeft) * (bias + (Math.random() * 0.16 - 0.08));

  return new Pickup(type, x, spawnY);
}
