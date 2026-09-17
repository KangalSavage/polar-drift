import { CONFIG } from './config.js';
import { Storage } from './storage.js';
import { Game } from './game.js';
import { UI } from './ui.js';
import { AudioManager } from './audio.js';
import { Vibe } from './haptics.js';
import { Ads } from './ads.js';

async function boot() {
  const ui = new UI();
  const audio = new AudioManager();
  const bestScore = await Storage.init();
  ui.setMenuBestScore(bestScore);
  ui.setMenuCoins(Storage.getCoins());

  const soundEnabled = Storage.getSoundEnabled();
  audio.setEnabled(soundEnabled);
  Vibe.setEnabled(soundEnabled);
  ui.setMuteIcon(soundEnabled);

  let continuesUsedThisRun = 0;
  let runsSinceInterstitial = 0;
  let continueTimerHandle = null;

  const canvas = document.getElementById('game-canvas');
  const game = new Game(canvas, {
    onScoreChange: (score) => ui.setHudScore(score),
    onFlip: (toRed) => {
      audio.playFlip(toRed);
      Vibe.light();
    },
    onGem: (comboCount) => {
      audio.playGem(comboCount);
      if (comboCount >= 3) Vibe.medium();
    },
    onNearMiss: () => audio.playNearMiss(),
    onNewBestCrossed: () => {
      audio.playNewBest();
      Vibe.success();
      ui.setHudScoreGold(true);
    },
    onShieldChange: (active) => {
      ui.setShieldActive(active);
      if (active) audio.playShieldGain();
    },
    onShieldBreak: () => {
      audio.playShieldBreak();
      Vibe.medium();
    },
    onTutorialHint: (show) => ui.showGestureHint(show),
    onGameOver: (score) => {
      audio.playGameOver();
      Vibe.heavy();
      if (continuesUsedThisRun < CONFIG.ADS.MAX_CONTINUES_PER_RUN && Ads.isRewardedReady()) {
        offerContinue(score);
      } else {
        finalizeGameOver(score);
      }
    },
  });

  game.setTheme(Storage.getSelectedThemeIndex());

  function refreshThemeRow() {
    ui.renderThemeRow(
      CONFIG.THEMES,
      Storage.getSelectedThemeIndex(),
      Storage.getCoins(),
      { has: (index) => Storage.isThemePurchased(index) },
      async (index) => {
        await Storage.setSelectedThemeIndex(index);
        game.setTheme(index);
        refreshThemeRow();
      },
      async (index) => {
        const bought = await Storage.purchaseTheme(index, CONFIG.THEMES[index].coinCost);
        if (!bought) return;
        ui.setMenuCoins(Storage.getCoins());
        await Storage.setSelectedThemeIndex(index);
        game.setTheme(index);
        refreshThemeRow();
      }
    );
  }
  refreshThemeRow();

  async function finalizeGameOver(score) {
    const isNewBest = await Storage.setBestScoreIfHigher(score);
    const coinsEarned = Math.max(1, Math.floor(score / CONFIG.COIN_SCORE_DIVISOR));
    await Storage.addCoins(coinsEarned);
    ui.setMenuBestScore(Storage.getBestScore());
    ui.setMenuCoins(Storage.getCoins());
    ui.showGameOver({ score, best: Storage.getBestScore(), isNewBest, coinsEarned });
    refreshThemeRow(); // the coin balance just changed - a theme may now be affordable

    runsSinceInterstitial += 1;
    if (runsSinceInterstitial >= CONFIG.ADS.INTERSTITIAL_EVERY_N_GAMEOVERS) {
      runsSinceInterstitial = 0;
      await Ads.showInterstitial();
      audio.reset(); // same audio-session hijack as the rewarded ad
    }
  }

  /** Offers one "watch an ad to keep going" chance before the run is actually over. */
  function offerContinue(score) {
    let secondsLeft = CONFIG.ADS.CONTINUE_OFFER_SECONDS;
    ui.setContinueTimer(secondsLeft);
    ui.showContinueOverlay(true);
    ui.pauseBtn.classList.add('hidden'); // don't let a mid-decision pause tap fight the continue prompt

    continueTimerHandle = setInterval(() => {
      secondsLeft -= 1;
      ui.setContinueTimer(secondsLeft);
      if (secondsLeft <= 0) declineContinue(score);
    }, 1000);

    ui.continueBtn.onclick = async () => {
      clearInterval(continueTimerHandle);
      ui.showContinueOverlay(false);
      const earned = await Ads.showRewarded();
      audio.reset(); // the native ad view stole the audio session - rebuild on the next tap
      if (earned) {
        continuesUsedThisRun += 1;
        game.continueRun();
        ui.pauseBtn.classList.remove('hidden');
      } else {
        finalizeGameOver(score);
      }
    };
    ui.continueSkipBtn.onclick = () => declineContinue(score);
  }

  function declineContinue(score) {
    clearInterval(continueTimerHandle);
    ui.showContinueOverlay(false);
    finalizeGameOver(score);
  }

  async function beginRun() {
    const showTutorial = !Storage.getHasSeenTutorial();
    if (showTutorial) await Storage.markTutorialSeen();
    continuesUsedThisRun = 0;
    ui.setHudScoreGold(false);
    ui.setShieldActive(false);
    ui.pauseBtn.classList.remove('hidden');
    ui.showScreen('game');
    ui.showPauseOverlay(false);
    ui.showContinueOverlay(false);
    game.startNewRun(Storage.getBestScore(), showTutorial);
  }

  ui.startBtn.addEventListener('click', () => {
    audio.unlock(); // must happen inside a user-gesture handler (iOS autoplay policy)
    Ads.init(); // same rule - ATT prompt + first ad requests need a user gesture
    beginRun();
  });

  ui.pauseBtn.addEventListener('click', () => {
    game.pause();
    ui.showPauseOverlay(true);
  });

  ui.resumeBtn.addEventListener('click', () => {
    ui.showPauseOverlay(false);
    game.resume();
  });

  ui.pauseMenuBtn.addEventListener('click', () => {
    game.stop();
    ui.showPauseOverlay(false);
    ui.setMenuBestScore(Storage.getBestScore());
    ui.setMenuCoins(Storage.getCoins());
    refreshThemeRow();
    ui.showScreen('menu');
  });

  ui.playAgainBtn.addEventListener('click', () => {
    beginRun();
  });

  ui.gameoverMenuBtn.addEventListener('click', () => {
    ui.setMenuBestScore(Storage.getBestScore());
    ui.setMenuCoins(Storage.getCoins());
    refreshThemeRow();
    ui.showScreen('menu');
  });

  ui.muteBtn.addEventListener('click', async () => {
    const next = !Storage.getSoundEnabled();
    await Storage.setSoundEnabled(next);
    audio.setEnabled(next);
    Vibe.setEnabled(next);
    ui.setMuteIcon(next);
    if (next) audio.unlock(); // re-arm the AudioContext in case it was never unlocked yet
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && game.isPlaying()) {
      game.pause();
      ui.showPauseOverlay(true);
    }
  });

  ui.showScreen('menu');
}

document.addEventListener('DOMContentLoaded', boot);
