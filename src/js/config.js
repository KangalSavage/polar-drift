// Central tuning values for Polar Drift.
// Keep gameplay constants here so balancing never requires touching game logic.

export const CONFIG = {
  // The ball falls at a fixed screen height; the shaft and its obstacles scroll upward
  // past it. Fractions are of the shared on-screen unit computed in Game (see _resize) -
  // keeps layout consistent across phone sizes without hardcoding pixels.
  SHAFT_WIDTH_FRACTION: 0.86, // was 0.64 - untested against a real phone screen, left ~18% dead margin on each side
  BALL_SCREEN_Y_FRACTION: 0.32, // how far down the screen the ball's fixed position sits
  // The height (in CSS px) every fixed vertical distance below (ball radius, obstacle
  // thickness, magnet/near-miss range, fall speed) was tuned against. Game._resize() derives
  // a scale factor from the real device's height relative to this, so a short phone (e.g.
  // iPhone SE) and a tall one (e.g. Pro Max) get the same actual reaction-time feel instead
  // of the same fixed obstacle-travel time turning into different amounts of warning.
  REFERENCE_HEIGHT: 850,
  BALL_RADIUS: 15,
  TRAIL_LENGTH: 16, // how many past positions the motion trail remembers

  // Horizontal dynamics - a simple 1D spring/force model, not a full physics engine.
  CENTER_SPRING_K: 5.5, // pulls the ball back toward the shaft's center when no field is acting on it
  MAGNET_FORCE: 1150, // horizontal accel an active (in-range) obstacle's field applies - strong/early
  // enough that the ball has usually already drifted into place well before the hard wall
  // boundary below would ever need to correct it, so gliding is what reads on screen, not snapping.
  MAGNET_RANGE_PX: 210, // vertical distance (above/below the ball) within which a field acts
  HORIZONTAL_DAMPING: 0.9, // per-frame-ish velocity decay, scaled by dt in code
  WALL_CORRECTION_RATE: 20, // per-second ease rate for the same-charge hard wall boundary - a
  // fast glide into place when it does need to correct, never an instant position snap

  // Difficulty ramp - flat grace window, then a smooth exponential ease toward the harder
  // ceiling. Same shape as Orbit Dash's curve on purpose: a proven, non-jarring feel.
  DIFFICULTY_GRACE_MS: 3200,
  FALL_SPEED_RAMP_TAU_MS: 22000,
  FALL_SPEED_BASE: 210, // px/s downward scroll speed at run start
  FALL_SPEED_MAX: 460,
  SPAWN_INTERVAL_BASE_MS: 1300,
  SPAWN_INTERVAL_MIN_MS: 640,

  // Obstacle shape: a colored block juts in from one (or, later on, both) shaft walls.
  // Same polarity as the ball = a solid wall that also repels (always survivable on its
  // own). Opposite polarity = a pull toward it that's lethal on contact.
  OBSTACLE_THICKNESS_PX: 100, // vertical extent of one obstacle band
  OBSTACLE_DEPTH_MIN_FRACTION: 0.32, // how far it juts into the shaft, as a fraction of shaft width
  OBSTACLE_DEPTH_MAX_FRACTION: 0.56,
  DOUBLE_SIDED_MIN_SPAWN_INDEX: 5, // both walls can spawn a block at once only from this spawn onward
  DOUBLE_SIDED_CHANCE_LATE: 0.32,
  DOUBLE_SIDED_MAX_COMBINED_FRACTION: 0.86, // fairness cap - always leaves some physical gap regardless of polarity choices

  // Scoring
  SCORE_PER_SECOND_SURVIVED: 5,
  GEM_SCORE: 12,
  CHAIN_WINDOW_MS: 900, // consecutive gem grabs within this long of each other keep the combo alive
  GEM_CHANCE: 0.55, // chance a given obstacle spawn also carries a gem in its safe gap
  NEAR_MISS_MARGIN_PX: 22, // hugging a safe (same-polarity) wall this close counts as a skillful near-miss
  NEAR_MISS_BONUS: 8,

  // Overload shield: a rare pickup (mutually exclusive with a gem on any given spawn) that
  // forgives exactly one otherwise-fatal wrong-polarity contact instead of ending the run.
  SHIELD_CHANCE: 0.07,
  SHIELD_BONUS_IF_ALREADY_ACTIVE: 40, // a 2nd charge while one is banked can't stack, so it converts to flat score
  SHIELD_COLOR: '#eaffff',
  SHIELD_GLOW: 'rgba(234, 255, 255, 0.6)',

  // First-run onboarding: spawn #0 is always a fixed, guaranteed-safe teaching layout
  // (single-sided, generous gap) so nobody's first-ever obstacle is an unlucky gamble.

  // Monetization via AdMob (see src/js/ads.js). Real ad unit IDs, from a dedicated "Polar
  // Drift" app registered under the same AdMob account as Orbit Dash (publisher id
  // ca-app-pub-2637666596373570). USE_TEST_ADS is off - real ad units, new ones can take up
  // to about an hour to start actually serving, and Google's own policy bars clicking your
  // own live ads (register the test device in AdMob instead if you need to verify visually).
  ADS: {
    USE_TEST_ADS: false,
    REWARDED_AD_UNIT_ID: 'ca-app-pub-2637666596373570/2953348777',
    INTERSTITIAL_AD_UNIT_ID: 'ca-app-pub-2637666596373570/8093994815',
    MAX_CONTINUES_PER_RUN: 1,
    CONTINUE_OFFER_SECONDS: 5,
    INTERSTITIAL_EVERY_N_GAMEOVERS: 3,
  },

  // Soft currency: earned at the end of every run, spendable any time to unlock a ball skin.
  COIN_SCORE_DIVISOR: 30,

  BG: '#05060f', // background never re-themes

  RED: '#ff3b5c',
  BLUE: '#2d9bff',

  // Cosmetic re-skins of the ball/trail. Unlocked permanently by spending coins (see
  // Storage.purchaseTheme); Nova is free from the start. The red/blue polarity colors
  // themselves never change - only the glow/trail accent does, so "which charge am I"
  // always reads the same regardless of skin.
  THEMES: [
    { name: 'Nova', coinCost: 0, trailAccent: '#ffffff' },
    { name: 'Solar', coinCost: 60, trailAccent: '#ffb23d' },
    { name: 'Toxic', coinCost: 150, trailAccent: '#9dff3d' },
    { name: 'Violet', coinCost: 300, trailAccent: '#c25dff' },
    { name: 'Ember', coinCost: 600, trailAccent: '#ff8a3d' },
  ],
};
