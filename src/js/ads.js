// Thin wrapper around @capacitor-community/admob. Mirrors the audio.js/haptics.js
// pattern: safe to call from anywhere, never throws into gameplay code, no-ops if
// something native fails to load (a bad network, a not-yet-configured AdMob account).
import { AdMob, RewardAdPluginEvents } from '@capacitor-community/admob';
import { CONFIG } from './config.js';

let initialized = false;
let rewardedReady = false;
let interstitialReady = false;

async function preloadRewarded() {
  try {
    await AdMob.prepareRewardVideoAd({
      adId: CONFIG.ADS.REWARDED_AD_UNIT_ID,
      isTesting: CONFIG.ADS.USE_TEST_ADS,
    });
    rewardedReady = true;
  } catch (err) {
    rewardedReady = false;
    console.warn('[Ads] rewarded preload failed', err);
  }
}

async function preloadInterstitial() {
  try {
    await AdMob.prepareInterstitial({
      adId: CONFIG.ADS.INTERSTITIAL_AD_UNIT_ID,
      isTesting: CONFIG.ADS.USE_TEST_ADS,
    });
    interstitialReady = true;
  } catch (err) {
    interstitialReady = false;
    console.warn('[Ads] interstitial preload failed', err);
  }
}

export const Ads = {
  /** Call once, inside a user-gesture handler (Start button) - same iOS rule as AudioManager.unlock(). */
  async init() {
    if (initialized) return;
    initialized = true;
    try {
      await AdMob.initialize({ initializeForTesting: CONFIG.ADS.USE_TEST_ADS });
      await AdMob.requestTrackingAuthorization(); // iOS 14+ ATT prompt; harmless no-op elsewhere
    } catch (err) {
      console.warn('[Ads] initialize failed', err);
      return;
    }
    preloadRewarded();
    preloadInterstitial();
  },

  /** Whether a rewarded ad is preloaded and ready to show right now (no network wait). */
  isRewardedReady() {
    return rewardedReady;
  },

  /** Resolves true only if the player watched to completion and actually earned the reward. */
  async showRewarded() {
    if (!rewardedReady) return false;
    rewardedReady = false; // consumed either way - preloadRewarded() below lines up the next one

    let earned = false;
    let finish;
    const done = new Promise((resolve) => {
      finish = resolve;
    });

    const handles = await Promise.all([
      AdMob.addListener(RewardAdPluginEvents.Rewarded, () => {
        earned = true;
      }),
      AdMob.addListener(RewardAdPluginEvents.Dismissed, () => finish()),
      AdMob.addListener(RewardAdPluginEvents.FailedToShow, () => finish()),
    ]);

    try {
      await AdMob.showRewardVideoAd();
    } catch (err) {
      finish();
    }

    await done;
    handles.forEach((h) => h.remove());
    preloadRewarded();
    return earned;
  },

  /** Fire-and-forget between-runs interstitial. Silently does nothing if none is preloaded. */
  async showInterstitial() {
    if (!interstitialReady) return;
    interstitialReady = false;
    try {
      await AdMob.showInterstitial();
    } catch (err) {
      console.warn('[Ads] show interstitial failed', err);
    }
    preloadInterstitial();
  },
};
