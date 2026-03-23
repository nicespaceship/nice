/* ═══════════════════════════════════════════════════════════════════
   NICE — Onboarding Tour
   Guided walkthrough for first-time users with spotlight overlay.
═══════════════════════════════════════════════════════════════════ */

const Onboarding = (() => {
  const STORAGE_KEY = 'nice-onboarding-done';

  const STEPS = [
    {
      target: null,
      title: 'Welcome to NICE\u2122',
      text: 'Mission control for your AI agent fleet. Activate blueprints, build spaceships, and launch missions. Let\u2019s show you around.',
      position: 'center'
    },
    {
      target: '.side-link[data-view="home"]',
      title: 'Bridge',
      text: 'Your command center. Agents, missions, analytics, workflows, and cost tracking \u2014 all in one place with tabbed navigation.',
      position: 'right'
    },
    {
      target: '.side-link[data-view="blueprints"]',
      title: 'Blueprints',
      text: 'The catalog. Browse and activate agent and spaceship blueprints \u2014 from Common to Legendary rarity.',
      position: 'right'
    },
    {
      target: '.bridge-stats',
      title: 'Bridge Stats',
      text: 'Your command overview \u2014 rank, XP, tokens, and streak at a glance.',
      position: 'bottom'
    },
    {
      target: '.side-user-card',
      title: 'Your Profile',
      text: 'Your pilot rank and callsign. Earn XP from missions and achievements to climb the ranks.',
      position: 'right'
    },
    {
      target: null,
      title: 'You\u2019re Clear for Launch',
      text: 'Head to Blueprints to activate your first agent. Press Cmd+K for the command palette, or ? for keyboard shortcuts. Replay this tour anytime from Settings.',
      position: 'center'
    }
  ];

  let _stepIdx = 0;
  let _overlayEl = null;

  function isComplete() {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  }

  function start() {
    _stepIdx = 0;
    _createOverlay();
    _showStep();
  }

  function _createOverlay() {
    if (_overlayEl) _overlayEl.remove();
    _overlayEl = document.createElement('div');
    _overlayEl.id = 'onboarding-overlay';
    _overlayEl.className = 'onb-overlay';
    _overlayEl.innerHTML = `
      <div class="onb-backdrop"></div>
      <div class="onb-spotlight" id="onb-spotlight"></div>
      <div class="onb-tooltip" id="onb-tooltip">
        <div class="onb-tooltip-step" id="onb-step"></div>
        <h3 class="onb-tooltip-title" id="onb-title"></h3>
        <p class="onb-tooltip-text" id="onb-text"></p>
        <div class="onb-tooltip-actions">
          <button class="btn btn-sm" id="onb-skip">Skip Tour</button>
          <button class="btn btn-sm btn-primary" id="onb-next">Next</button>
        </div>
      </div>
    `;
    document.body.appendChild(_overlayEl);

    document.getElementById('onb-skip').addEventListener('click', _finish);
    document.getElementById('onb-next').addEventListener('click', _next);

    // Escape to skip
    document.addEventListener('keydown', _escHandler);
  }

  function _escHandler(e) {
    if (e.key === 'Escape') _finish();
  }

  function _showStep() {
    const step = STEPS[_stepIdx];
    if (!step) { _finish(); return; }

    document.getElementById('onb-step').textContent = (_stepIdx + 1) + ' / ' + STEPS.length;
    document.getElementById('onb-title').textContent = step.title;
    document.getElementById('onb-text').textContent = step.text;

    const nextBtn = document.getElementById('onb-next');
    nextBtn.textContent = _stepIdx === STEPS.length - 1 ? 'Get Started' : 'Next';

    const spotlight = document.getElementById('onb-spotlight');
    const tooltip = document.getElementById('onb-tooltip');

    // Reset positioning from previous step
    tooltip.style.top = '';
    tooltip.style.bottom = '';
    tooltip.style.left = '';
    tooltip.style.transform = '';

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

        // Position tooltip relative to target
        tooltip.style.position = 'fixed';
        const nearBottom = rect.top > window.innerHeight * 0.6;

        if (step.position === 'bottom' && !nearBottom) {
          tooltip.style.top = (rect.bottom + 12) + 'px';
          tooltip.style.left = Math.max(12, rect.left) + 'px';
          tooltip.style.transform = 'none';
        } else if (nearBottom) {
          // Above target when near bottom of viewport
          tooltip.style.top = 'auto';
          tooltip.style.bottom = (window.innerHeight - rect.top + 12) + 'px';
          tooltip.style.left = Math.max(12, rect.left) + 'px';
          tooltip.style.transform = 'none';
        } else if (step.position === 'right' && rect.right + 320 < window.innerWidth) {
          tooltip.style.top = rect.top + 'px';
          tooltip.style.left = (rect.right + 16) + 'px';
          tooltip.style.transform = 'none';
        } else {
          // Below target as fallback
          tooltip.style.top = (rect.bottom + 12) + 'px';
          tooltip.style.left = Math.max(12, rect.left) + 'px';
          tooltip.style.transform = 'none';
        }
      } else {
        spotlight.style.display = 'none';
        _centerTooltip(tooltip);
      }
    } else {
      spotlight.style.display = 'none';
      _centerTooltip(tooltip);
    }
  }

  function _centerTooltip(tooltip) {
    tooltip.style.position = 'fixed';
    tooltip.style.top = '50%';
    tooltip.style.left = '50%';
    tooltip.style.transform = 'translate(-50%, -50%)';
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
    document.removeEventListener('keydown', _escHandler);
    if (_overlayEl) { _overlayEl.remove(); _overlayEl = null; }

    // Close mobile sidebar if we opened it
    document.getElementById('app-sidebar')?.classList.remove('open');
    document.getElementById('sidebar-overlay')?.classList.remove('open');

    // Award XP
    if (typeof Gamification !== 'undefined' && Gamification.addXP) {
      Gamification.addXP('complete_onboarding');
    }

    // Auto-start tutorial mission if not yet completed
    if (typeof TutorialMission !== 'undefined' && !TutorialMission.isComplete()) {
      setTimeout(() => TutorialMission.start(), 600);
    }
  }

  return { start, isComplete, STORAGE_KEY };
})();
