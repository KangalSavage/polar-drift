import { CONFIG } from './config.js';

/**
 * Picks the tier for the next queued ball. Draws from the lowest SPAWN_TIER_POOL_SIZE
 * tiers that are below the highest tier reached so far this run - keeps early drops easy
 * to place while still letting the pool creep upward as the jar fills with bigger balls,
 * without ever handing the player a tier they can't yet merge toward.
 */
export function pickSpawnTier(highestTierReached) {
  const poolStart = Math.max(0, Math.min(highestTierReached - CONFIG.SPAWN_TIER_POOL_SIZE + 1, CONFIG.TIERS.length - CONFIG.SPAWN_TIER_POOL_SIZE));
  const poolEnd = Math.min(poolStart + CONFIG.SPAWN_TIER_POOL_SIZE, CONFIG.TIERS.length);
  return poolStart + Math.floor(Math.random() * (poolEnd - poolStart));
}

/** Combo popup color - heats up from cyan to gold to hot orange as a merge chain grows, same shape as Orbit Dash's comboColor. */
export function comboColor(count) {
  if (count >= 5) return '#ff5a3d';
  if (count >= 3) return '#ffd23d';
  return '#3dfcff';
}

/** Visual + radius lookup for a queue item, which is either a tier index or the 'freeze' special. */
export function itemVisual(item) {
  if (item === 'freeze') return { color: CONFIG.FREEZE_COLOR, label: '★', radius: CONFIG.FREEZE_BALL_RADIUS };
  const tier = CONFIG.TIERS[item];
  return { color: tier.color, label: String(tier.value), radius: tier.radius };
}
