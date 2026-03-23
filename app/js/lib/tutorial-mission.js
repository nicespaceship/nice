/* ═══════════════════════════════════════════════════════════════════
   NICE — Tutorial Mission (Day One Onboarding)
   Scripted first-run experience: Ensign slots a Common agent, gives
   one command via NICE AI, sees an artifact. <3 minutes, ~45 XP.
═══════════════════════════════════════════════════════════════════ */

const TutorialMission = (() => {
  const STORAGE_KEY = 'nice-tutorial-done';

  const STEPS = [
    {
      target: null,
      title: 'Welcome aboard, Ensign.',
      text: 'Let\u2019s run your first mission \u2014 activate a blueprint, then send your first command. Takes about a minute.',
      position: 'center',
      action: null,
      xpAction: null,
    },
    {
      target: '.side-link[data-view="blueprints"]',
      title: 'Open Blueprints',
      text: 'Click Blueprints to browse the agent catalog.',
      position: 'right',
      action: 'navigate-blueprints',
      xpAction: null,
    },
    {
      target: '.bp-card',
      title: 'Activate a Blueprint',
      text: 'Click the Activate button on any agent blueprint to add it to your collection.',
      position: 'right',
      action: 'activate-blueprint',
      xpAction: 'activate_blueprint',
    },
    {
      target: '.side-link[data-view="home"]',
      title: 'Back to Bridge',
      text: 'Click Bridge to see your activated agent on the Schematic.',
      position: 'right',
      action: 'navigate-home',
      xpAction: null,
    },
    {
      target: '#nice-ai-input',
      title: 'Send Your First Command',
      text: 'Type a message in the prompt bar below and hit Send. Try: \u201CSummarize today\u2019s top 3 AI headlines\u201D',
      position: 'top',
      action: 'send-command',
      xpAction: null,
    },
  ];

  let _stepIdx = 0;
  let _overlayEl = null;
  let _actionListener = null;

  function isComplete() {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  }

  function start() {
    if (isComplete()) return;
    _stepIdx = 0;
    _createOverlay();
    _showStep();
  }

  function _createOverlay() {
    if (_overlayEl) _overlayEl.remove();
    _overlayEl = document.createElement('div');
    _overlayEl.id = 'tutorial-overlay';
    _overlayEl.className = 'onb-overlay tut-mission-overlay';
    _overlayEl.innerHTML = `
      <div class="onb-backdrop"></div>
      <div class="onb-spotlight" id="tut-spotlight"></div>
      <div class="onb-tooltip" id="tut-tooltip">
        <div class="tut-step-badge" id="tut-step"></div>
        <h3 class="onb-tooltip-title" id="tut-title"></h3>
        <p class="onb-tooltip-text" id="tut-text"></p>
        <div class="onb-tooltip-actions">
          <button class="btn btn-sm" id="tut-skip">Skip Mission</button>
          <button class="btn btn-sm btn-primary" id="tut-next">Next</button>
        </div>
      </div>
      <div class="tut-progress-track"><div class="tut-progress-fill" id="tut-progress"></div></div>
    `;
    document.body.appendChild(_overlayEl);

    document.getElementById('tut-skip').addEventListener('click', _finish);
    document.getElementById('tut-next').addEventListener('click', _next);
    document.addEventListener('keydown', _escHandler);
  }

  function _escHandler(e) {
    if (e.key === 'Escape') _finish();
  }

  function _showStep() {
    const step = STEPS[_stepIdx];
    if (!step) { _finish(); return; }

    document.getElementById('tut-step').textContent = 'STEP ' + (_stepIdx + 1) + ' OF ' + STEPS.length;
    document.getElementById('tut-title').textContent = step.title;
    document.getElementById('tut-text').textContent = step.text;

    // Update progress bar
    const progress = document.getElementById('tut-progress');
    if (progress) progress.style.width = ((_stepIdx + 1) / STEPS.length * 100) + '%';

    const nextBtn = document.getElementById('tut-next');
    // First step and steps without actions show "Next"; steps with actions show "I did it"
    if (_stepIdx === 0) {
      nextBtn.textContent = 'Start Mission';
    } else if (step.action) {
      nextBtn.textContent = 'I did it';
    } else {
      nextBtn.textContent = 'Next';
    }

    const spotlight = document.getElementById('tut-spotlight');
    const tooltip = document.getElementById('tut-tooltip');

    if (step.target && step.position !== 'center') {
      const el = document.querySelector(step.target);
      if (el) {
        const rect = el.getBoundingClientRect();

        // Show sidebar on mobile for sidebar targets
        if (window.innerWidth <= 768 && step.target.includes('side')) {
          document.getElementById('app-sidebar')?.classList.add('open');
          document.getElementById('sidebar-overlay')?.classList.add('open');
        }

        spotlight.style.display = 'block';
        spotlight.style.top = (rect.top - 4) + 'px';
        spotlight.style.left = (rect.left - 4) + 'px';
        spotlight.style.width = (rect.width + 8) + 'px';
        spotlight.style.height = (rect.height + 8) + 'px';

        // Position tooltip with arrow
        tooltip.style.position = 'fixed';
        tooltip.style.top = '';
        tooltip.style.bottom = '';
        const nearBottom = rect.top > window.innerHeight * 0.6;

        if (step.position === 'top' || nearBottom) {
          // Above target
          tooltip.style.bottom = (window.innerHeight - rect.top + 12) + 'px';
          tooltip.style.left = Math.max(12, rect.left) + 'px';
          tooltip.style.transform = 'none';
          tooltip.setAttribute('data-arrow', 'bottom');
        } else if (step.position === 'right' && rect.right + 320 < window.innerWidth) {
          tooltip.style.top = rect.top + 'px';
          tooltip.style.left = (rect.right + 16) + 'px';
          tooltip.style.transform = 'none';
          tooltip.setAttribute('data-arrow', 'left');
        } else {
          // Below target
          tooltip.style.top = (rect.bottom + 12) + 'px';
          tooltip.style.left = Math.max(12, rect.left) + 'px';
          tooltip.style.transform = 'none';
          tooltip.setAttribute('data-arrow', 'top');
        }
      } else {
        spotlight.style.display = 'none';
        tooltip.removeAttribute('data-arrow');
        _centerTooltip(tooltip);
      }
    } else {
      spotlight.style.display = 'none';
      tooltip.removeAttribute('data-arrow');
      _centerTooltip(tooltip);
    }

    // Listen for the action on the target element
    _listenForAction(step);
  }

  function _centerTooltip(tooltip) {
    tooltip.style.position = 'fixed';
    tooltip.style.top = '50%';
    tooltip.style.left = '50%';
    tooltip.style.transform = 'translate(-50%, -50%)';
  }

  function _listenForAction(step) {
    _removeActionListener();

    if (!step.action) return;

    if (step.action === 'navigate-blueprints') {
      _actionListener = () => {
        if (location.hash.includes('blueprints')) { _removeActionListener(); _onActionComplete(); }
      };
      window.addEventListener('hashchange', _actionListener);
    } else if (step.action === 'navigate-home') {
      _actionListener = () => {
        if (location.hash === '#/' || location.hash === '' || location.hash === '#') { _removeActionListener(); _onActionComplete(); }
      };
      window.addEventListener('hashchange', _actionListener);
    } else if (step.action === 'activate-blueprint') {
      _actionListener = (e) => {
        if (e.target.closest('.bp-deploy-btn') || e.target.closest('.bp-activate-btn') || e.target.closest('[data-action="activate"]')) {
          _removeActionListener();
          setTimeout(() => _onActionComplete(), 300);
        }
      };
      document.addEventListener('click', _actionListener, true);
    } else if (step.action === 'send-command') {
      _actionListener = (e) => {
        if (e.target.closest('#nice-ai-send') || e.target.closest('.nice-ai-send')) {
          _removeActionListener();
          setTimeout(() => _onActionComplete(), 500);
        }
      };
      document.addEventListener('click', _actionListener, true);
      const input = document.getElementById('nice-ai-input');
      if (input) {
        const keyHandler = (e) => {
          if (e.key === 'Enter' && !e.shiftKey && input.value.trim()) {
            input.removeEventListener('keydown', keyHandler);
            _removeActionListener();
            setTimeout(() => _onActionComplete(), 500);
          }
        };
        input.addEventListener('keydown', keyHandler);
      }
    }
  }

  function _removeActionListener() {
    if (_actionListener) {
      window.removeEventListener('hashchange', _actionListener);
      document.removeEventListener('click', _actionListener, true);
      _actionListener = null;
    }
  }

  function _onActionComplete() {
    const step = STEPS[_stepIdx];
    // Award XP for this step
    if (step.xpAction && typeof Gamification !== 'undefined' && Gamification.addXP) {
      Gamification.addXP(step.xpAction);
    }
    _next();
  }

  function _next() {
    _stepIdx++;
    if (_stepIdx >= STEPS.length) {
      _finish();
    } else {
      _showStep();
    }
  }

  function _finish() {
    localStorage.setItem(STORAGE_KEY, 'true');
    _removeActionListener();
    document.removeEventListener('keydown', _escHandler);
    if (_overlayEl) { _overlayEl.remove(); _overlayEl = null; }

    // Close mobile sidebar if open
    document.getElementById('app-sidebar')?.classList.remove('open');
    document.getElementById('sidebar-overlay')?.classList.remove('open');

    // Award tutorial completion XP
    if (typeof Gamification !== 'undefined') {
      Gamification.addXP('complete_tutorial');
      Gamification.unlockAchievement('first-mission');
    }

    // Show completion notification
    if (typeof Notify !== 'undefined') {
      Notify.send({
        title: 'Mission Complete!',
        message: 'You\'ve completed your first mission. Welcome to the fleet, Ensign.',
        type: 'system',
      });
    }
  }

  return { start, isComplete, STORAGE_KEY };
})();
