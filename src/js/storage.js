// Persistent player data: best score, tutorial-seen flag, selected cosmetic theme.
//
// Uses Capacitor's Preferences plugin, which is backed by UserDefaults on iOS
// and SharedPreferences on Android - genuinely persistent app storage, unlike
// WebView localStorage which can be cleared by the OS/webview cache.
// On plain web (no native bridge) Preferences transparently falls back to
// localStorage under the hood, so this same code works in the browser too.
import { Preferences } from '@capacitor/preferences';

const BEST_SCORE_KEY = 'polardrift_best_score';
const TUTORIAL_SEEN_KEY = 'polardrift_tutorial_seen';
const THEME_INDEX_KEY = 'polardrift_theme_index';
const SOUND_ENABLED_KEY = 'polardrift_sound_enabled';
const COINS_KEY = 'polardrift_coins';
const PURCHASED_THEMES_KEY = 'polardrift_purchased_themes';

let cachedBestScore = 0;
let cachedHasSeenTutorial = false;
let cachedThemeIndex = 0;
let cachedSoundEnabled = true;
let cachedCoins = 0;
let cachedPurchasedThemes = new Set();

export const Storage = {
  /** Load all persisted data. Call once at boot, before reading any of it. */
  async init() {
    try {
      const [best, tutorial, theme, sound, coins, purchased] = await Promise.all([
        Preferences.get({ key: BEST_SCORE_KEY }),
        Preferences.get({ key: TUTORIAL_SEEN_KEY }),
        Preferences.get({ key: THEME_INDEX_KEY }),
        Preferences.get({ key: SOUND_ENABLED_KEY }),
        Preferences.get({ key: COINS_KEY }),
        Preferences.get({ key: PURCHASED_THEMES_KEY }),
      ]);
      cachedBestScore = best.value ? parseInt(best.value, 10) || 0 : 0;
      cachedHasSeenTutorial = tutorial.value === '1';
      cachedThemeIndex = theme.value ? parseInt(theme.value, 10) || 0 : 0;
      cachedSoundEnabled = sound.value !== '0'; // on by default - only explicit '0' turns it off
      cachedCoins = coins.value ? parseInt(coins.value, 10) || 0 : 0;
      cachedPurchasedThemes = new Set(
        purchased.value ? purchased.value.split(',').filter(Boolean).map((n) => parseInt(n, 10)) : []
      );
    } catch (err) {
      console.warn('[Storage] Failed to load persisted data, using defaults.', err);
      cachedBestScore = 0;
      cachedHasSeenTutorial = false;
      cachedThemeIndex = 0;
      cachedSoundEnabled = true;
      cachedCoins = 0;
      cachedPurchasedThemes = new Set();
    }
    return cachedBestScore;
  },

  getBestScore() {
    return cachedBestScore;
  },

  /** Persist a new best score if it beats the current one. Returns true if it was a new best. */
  async setBestScoreIfHigher(score) {
    if (score <= cachedBestScore) return false;
    cachedBestScore = score;
    try {
      await Preferences.set({ key: BEST_SCORE_KEY, value: String(score) });
    } catch (err) {
      console.warn('[Storage] Failed to persist best score.', err);
    }
    return true;
  },

  getHasSeenTutorial() {
    return cachedHasSeenTutorial;
  },

  async markTutorialSeen() {
    cachedHasSeenTutorial = true;
    try {
      await Preferences.set({ key: TUTORIAL_SEEN_KEY, value: '1' });
    } catch (err) {
      console.warn('[Storage] Failed to persist tutorial-seen flag.', err);
    }
  },

  getSelectedThemeIndex() {
    return cachedThemeIndex;
  },

  async setSelectedThemeIndex(index) {
    cachedThemeIndex = index;
    try {
      await Preferences.set({ key: THEME_INDEX_KEY, value: String(index) });
    } catch (err) {
      console.warn('[Storage] Failed to persist selected theme.', err);
    }
  },

  getSoundEnabled() {
    return cachedSoundEnabled;
  },

  async setSoundEnabled(enabled) {
    cachedSoundEnabled = enabled;
    try {
      await Preferences.set({ key: SOUND_ENABLED_KEY, value: enabled ? '1' : '0' });
    } catch (err) {
      console.warn('[Storage] Failed to persist sound preference.', err);
    }
  },

  getCoins() {
    return cachedCoins;
  },

  /** Credits coins earned from a run (e.g. at game-over). Returns the new total. */
  async addCoins(amount) {
    if (amount <= 0) return cachedCoins;
    cachedCoins += amount;
    try {
      await Preferences.set({ key: COINS_KEY, value: String(cachedCoins) });
    } catch (err) {
      console.warn('[Storage] Failed to persist coins.', err);
    }
    return cachedCoins;
  },

  isThemePurchased(index) {
    return cachedPurchasedThemes.has(index);
  },

  /** Spends `cost` coins to permanently unlock theme `index`. */
  async purchaseTheme(index, cost) {
    if (cachedCoins < cost || cachedPurchasedThemes.has(index)) return false;
    cachedCoins -= cost;
    cachedPurchasedThemes.add(index);
    try {
      await Promise.all([
        Preferences.set({ key: COINS_KEY, value: String(cachedCoins) }),
        Preferences.set({ key: PURCHASED_THEMES_KEY, value: [...cachedPurchasedThemes].join(',') }),
      ]);
    } catch (err) {
      console.warn('[Storage] Failed to persist theme purchase.', err);
    }
    return true;
  },
};
