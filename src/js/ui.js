// Thin DOM layer: screen switching + HUD updates. Kept separate from Game
// so gameplay logic never touches the DOM directly.

export class UI {
  constructor() {
    this.screens = {
      menu: document.getElementById('menu-screen'),
      game: document.getElementById('game-screen'),
      gameover: document.getElementById('gameover-screen'),
    };

    this.menuBestScoreEl = document.getElementById('menu-best-score');
    this.menuCoinsEl = document.getElementById('menu-coins');
    this.coinsEarnedRowEl = document.getElementById('coins-earned-row');
    this.coinsEarnedEl = document.getElementById('coins-earned');
    this.hudScoreEl = document.getElementById('hud-score');
    this.hudShieldEl = document.getElementById('hud-shield');
    this.pauseOverlayEl = document.getElementById('pause-overlay');
    this.continueOverlayEl = document.getElementById('continue-overlay');
    this.continueTimerEl = document.getElementById('continue-timer');
    this.finalScoreEl = document.getElementById('final-score');
    this.finalBestScoreEl = document.getElementById('final-best-score');
    this.newBestBadgeEl = document.getElementById('new-best-badge');
    this.gestureHintEl = document.getElementById('gesture-hint');
    this.nearMissRowEl = document.getElementById('near-miss-row');
    this.nearMissCountEl = document.getElementById('near-miss-count');
    this.doubleCoinsBtn = document.getElementById('double-coins-btn');
    this.doubleCoinsAmountEl = document.getElementById('double-coins-amount');
    this.doubleCoinsClaimedEl = document.getElementById('double-coins-claimed');

    this.themeRowEl = document.getElementById('theme-row');

    this.startBtn = document.getElementById('start-btn');
    this.pauseBtn = document.getElementById('pause-btn');
    this.resumeBtn = document.getElementById('resume-btn');
    this.pauseMenuBtn = document.getElementById('pause-menu-btn');
    this.playAgainBtn = document.getElementById('play-again-btn');
    this.gameoverMenuBtn = document.getElementById('gameover-menu-btn');
    this.continueBtn = document.getElementById('continue-btn');
    this.continueSkipBtn = document.getElementById('continue-skip-btn');
    this.muteBtn = document.getElementById('mute-btn');
    this.muteIconEl = document.getElementById('mute-icon');
  }

  showScreen(name) {
    for (const key of Object.keys(this.screens)) {
      this.screens[key].classList.toggle('active', key === name);
    }
  }

  setMenuBestScore(score) {
    this.menuBestScoreEl.textContent = score;
  }

  setMenuCoins(coins) {
    this.menuCoinsEl.textContent = coins;
  }

  setHudScore(score) {
    this.hudScoreEl.textContent = score;
    // Restart the pop animation on every change - re-adding the class after a reflow, since
    // just toggling it wouldn't retrigger a CSS animation that's already "finished".
    this.hudScoreEl.classList.remove('score-pop');
    void this.hudScoreEl.offsetWidth;
    this.hudScoreEl.classList.add('score-pop');
  }

  setHudScoreGold(isGold) {
    this.hudScoreEl.classList.toggle('new-best', isGold);
  }

  setShieldActive(active) {
    this.hudShieldEl.classList.toggle('hidden', !active);
  }

  setMuteIcon(soundEnabled) {
    this.muteIconEl.textContent = soundEnabled ? '🔊' : '🔇';
  }

  showGestureHint(show) {
    this.gestureHintEl.classList.toggle('hidden', !show);
  }

  /**
   * Rebuilds the ball/trail theme swatch row. A theme is unlocked once it's in
   * `purchasedIndices` (bought with coins) or free (coinCost 0). A still-locked but
   * affordable theme renders as "buyable" (shows its coin cost, tappable) instead of a
   * plain lock icon. Call again whenever coins/selection/purchases change.
   */
  renderThemeRow(themes, selectedIndex, coins, purchasedIndices, onSelect, onPurchase) {
    this.themeRowEl.innerHTML = '';
    themes.forEach((theme, index) => {
      const unlocked = theme.coinCost === 0 || purchasedIndices.has(index);
      const btn = document.createElement('button');
      btn.className = 'theme-swatch';
      btn.style.background = theme.trailAccent;
      btn.setAttribute('aria-label', theme.name);
      if (index === selectedIndex) btn.classList.add('selected');
      if (unlocked) {
        btn.addEventListener('click', () => onSelect(index));
      } else {
        btn.classList.add('locked');
        const affordable = coins >= theme.coinCost;
        if (affordable) {
          btn.classList.add('buyable');
          const cost = document.createElement('span');
          cost.className = 'theme-cost';
          cost.textContent = theme.coinCost;
          btn.appendChild(cost);
          btn.addEventListener('click', () => onPurchase(index));
        }
      }
      this.themeRowEl.appendChild(btn);
    });
  }

  showPauseOverlay(show) {
    this.pauseOverlayEl.classList.toggle('hidden', !show);
  }

  showContinueOverlay(show) {
    this.continueOverlayEl.classList.toggle('hidden', !show);
  }

  setContinueTimer(seconds) {
    this.continueTimerEl.textContent = Math.max(0, seconds);
  }

  showGameOver({ score, best, isNewBest, coinsEarned, nearMissCount }) {
    this.finalScoreEl.textContent = score;
    this.finalBestScoreEl.textContent = best;
    this.newBestBadgeEl.classList.toggle('hidden', !isNewBest);
    this.coinsEarnedEl.textContent = coinsEarned;
    this.coinsEarnedRowEl.classList.toggle('hidden', coinsEarned <= 0);
    this.nearMissCountEl.textContent = nearMissCount;
    this.nearMissRowEl.classList.toggle('hidden', !nearMissCount);
    this.doubleCoinsClaimedEl.classList.add('hidden');
    this.showScreen('gameover');
  }

  /** The post-run "watch an ad to double what you just earned" offer - hidden if no ad is ready. */
  showDoubleCoinsButton(show, coinsEarned) {
    this.doubleCoinsAmountEl.textContent = coinsEarned;
    this.doubleCoinsBtn.classList.toggle('hidden', !show);
  }

  showDoubleCoinsClaimed(coinsEarned) {
    this.doubleCoinsClaimedEl.textContent = `+${coinsEarned} 🪙`;
    this.doubleCoinsClaimedEl.classList.remove('hidden');
  }
}
