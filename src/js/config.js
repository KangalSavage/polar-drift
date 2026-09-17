// Central tuning values for Tilt Merge.
// Keep gameplay constants here so balancing never requires touching game logic.

export const CONFIG = {
  // Jar shape, as fractions of the on-screen play area computed in Game (see _resize) -
  // keeps layout consistent across phone sizes without hardcoding pixels.
  JAR_WIDTH_FRACTION: 0.72,
  JAR_HEIGHT_FRACTION: 0.68,
  JAR_WALL_THICKNESS: 6,
  OVERFLOW_LINE_FRACTION: 0.14, // from the jar's top edge - a resting ball above this line risks game over
  OVERFLOW_GRACE_MS: 1100, // a ball must stay above the line this long before it actually ends the run - lets a bounce settle first

  // Physics - simple position-based circle solver, no external physics engine. Tuned by
  // feel, not realism: heavier damping than real gravity so the jar doesn't feel jittery
  // with 30+ balls resting at once.
  GRAVITY: 1450, // px/s^2 at the shared layout unit scale
  DAMPING: 0.985, // per-frame velocity decay (air/rolling friction approximation)
  WALL_RESTITUTION: 0.22,
  FLOOR_RESTITUTION: 0.16,
  FLOOR_FRICTION: 0.86, // extra horizontal damping on floor contact so balls settle instead of sliding forever
  SOLVER_ITERATIONS: 6, // relaxation passes per frame for stable stacking
  BOUNCE_CUTOFF_SPEED: 8, // px/s - impacts slower than this just stop instead of bouncing, so resting balls don't buzz
  POSITION_SLOP: 0.5, // px of overlap tolerated without correction - fixes tiny-overlap jitter in tall stacks
  POSITION_CORRECTION_PERCENT: 0.8, // only resolve this fraction of overlap per pass (Baumgarte-style) - full correction overshoots and oscillates
  MAX_CORRECTION_PER_PASS: 6, // px - caps how far one collision pass can shove a ball, so a pile-up of freshly spawned overlapping balls eases apart instead of exploding
  VELOCITY_SLEEP_THRESHOLD: 3, // px/s - velocities under this are zeroed each frame, so settled stacks stop micro-jittering

  // Tilt control: two dedicated hold-buttons (bottom corners of the game screen) rotate
  // gravity inside the jar while held - the skill layer plain drop-and-merge games don't
  // have. Deliberately a separate control from dropping (drag-to-position-then-release on
  // the jar itself) rather than overloading one gesture with two meanings.
  TILT_MAX_ANGLE: 0.46, // radians, ~26 degrees
  TILT_EASE_RATE: 7, // per-second lerp toward the held/released target - same rate ramping in as springing back

  DROP_COOLDOWN_MS: 260, // minimum time between drops, so rapid taps can't stack-spawn on top of each other
  BALL_SPAWN_Y_FRACTION: 0.08, // new balls appear this far down from the jar's top edge

  // Merge tiers - value mirrors classic 2048 doubling. Radius growth is deliberately flat
  // (13px -> 38px across 10 tiers, not proportional to value) - a 1024 ball is the payoff
  // moment, not something that should eat half the jar's width on a phone screen. Even the
  // top tier stays under ~30% of JAR_WIDTH_FRACTION's on-screen width on a typical phone.
  TIERS: [
    { value: 2, radius: 13, color: '#8fd3ff' },
    { value: 4, radius: 15, color: '#6fc2ff' },
    { value: 8, radius: 17, color: '#4fb0ff' },
    { value: 16, radius: 20, color: '#3d9dff' },
    { value: 32, radius: 23, color: '#5d7dff' },
    { value: 64, radius: 26, color: '#8a5dff' },
    { value: 128, radius: 29, color: '#c25dff' },
    { value: 256, radius: 32, color: '#ff5dd6' },
    { value: 512, radius: 35, color: '#ff5d8a' },
    { value: 1024, radius: 38, color: '#ffb23d' },
  ],
  SPAWN_TIER_POOL_SIZE: 3, // the queue always draws from the lowest 3 not-yet-capped tiers

  // Chain-merge combo: merging is scored as the produced tile's value, multiplied by how
  // many merges cascade from a single drop (comboCount) - same "reward precision, not just
  // action" philosophy as Orbit Dash's near-miss/combo systems, just expressed through
  // physics instead of lane timing.
  CHAIN_WINDOW_MS: 550, // a merge counts as part of the same chain if it happens within this long of the previous one

  // Freeze power-up: a rare star-ball (mutually exclusive with a normal spawn) that, once
  // merged/touched, grants one "overflow save" - the next time the jar would otherwise end
  // the run, the topmost balls are cleared into score instead. Same one-lifeline-per-run
  // shape as Orbit Dash's shield.
  FREEZE_BALL_CHANCE: 0.06,
  FREEZE_BALL_RADIUS: 12,
  FREEZE_COLOR: '#eafffe',
  FREEZE_GLOW: 'rgba(234, 255, 255, 0.6)',
  FREEZE_BONUS_IF_ALREADY_ACTIVE: 50, // picking up a 2nd charge while one is banked can't stack, so it converts to flat score
  FREEZE_CLEAR_BALL_COUNT: 4, // how many of the topmost balls get vaporized when a freeze charge saves the run
  CONTINUE_CLEAR_BALL_COUNT: 12, // a bigger, no-bonus-score clear when reviving via a rewarded ad instead of a banked freeze charge

  // Soft currency: earned at the end of every run, spendable any time to unlock a jar skin.
  // Coins are the only unlock path, same reasoning as Orbit Dash - a single very long run
  // shouldn't be able to buy out the whole cosmetic economy at once.
  COIN_SCORE_DIVISOR: 40,

  // Monetization via AdMob (see src/js/ads.js). These are Google's public TEST ad unit
  // IDs - safe to ship while developing, but MUST be swapped for this app's own real
  // AdMob app/ad-unit IDs (a fresh AdMob registration, separate from Orbit Dash's) before
  // any production build, and USE_TEST_ADS flipped to false once that's verified end to end.
  ADS: {
    USE_TEST_ADS: true,
    REWARDED_AD_UNIT_ID: 'ca-app-pub-3940256099942544/1712485313',
    INTERSTITIAL_AD_UNIT_ID: 'ca-app-pub-3940256099942544/4411468910',
    MAX_CONTINUES_PER_RUN: 1,
    CONTINUE_OFFER_SECONDS: 5,
    INTERSTITIAL_EVERY_N_GAMEOVERS: 3,
  },

  BG: '#0a0f1e', // background never re-themes

  // Cosmetic jar re-skins. Unlocked permanently by spending coins (see
  // Storage.purchaseTheme); Glass is free from the start. Purely visual - never affects
  // physics or scoring.
  THEMES: [
    {
      name: 'Glass',
      coinCost: 0,
      colors: { jarWall: 'rgba(150, 200, 255, 0.55)', jarGlow: 'rgba(80, 160, 255, 0.25)', accent: '#3dd6ff' },
    },
    {
      name: 'Amber',
      coinCost: 60,
      colors: { jarWall: 'rgba(255, 190, 120, 0.55)', jarGlow: 'rgba(255, 150, 60, 0.25)', accent: '#ffb23d' },
    },
    {
      name: 'Jade',
      coinCost: 150,
      colors: { jarWall: 'rgba(120, 255, 190, 0.55)', jarGlow: 'rgba(60, 255, 150, 0.25)', accent: '#3dffb2' },
    },
    {
      name: 'Violet',
      coinCost: 300,
      colors: { jarWall: 'rgba(200, 150, 255, 0.55)', jarGlow: 'rgba(160, 80, 255, 0.25)', accent: '#b23dff' },
    },
    {
      name: 'Ember',
      coinCost: 600,
      colors: { jarWall: 'rgba(255, 130, 130, 0.55)', jarGlow: 'rgba(255, 70, 70, 0.25)', accent: '#ff5d5d' },
    },
  ],
};
