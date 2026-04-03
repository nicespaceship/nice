/* NICE SPACESHIP — Shared Navigation */
const Nav = (() => {
  const LINKS = [
    { href: '/', label: 'Home' },
    { href: '/blueprints', label: 'Blueprints' },
    { href: '/pricing', label: 'Pricing' },
    { href: '/academy', label: 'Academy' },
    { href: '/about', label: 'About' },
  ];

  function _isActive(href) {
    const path = location.pathname.replace(/\/$/, '') || '/';
    return href === '/' ? path === '/' : path.startsWith(href);
  }

  function render() {
    const header = document.getElementById('site-header');
    if (!header) return;

    header.innerHTML = `
      <nav class="nav">
        <div class="nav-inner">
          <a href="/" class="nav-brand">
            <img src="/assets/logo.svg" alt="NICE SPACESHIP" class="nav-logo" />
            <span class="nav-brand-text">NICE SPACESHIP</span>
          </a>
          <div class="nav-links" id="nav-links">
            ${LINKS.map(l => `<a href="${l.href}" class="nav-link${_isActive(l.href) ? ' active' : ''}">${l.label}</a>`).join('')}
            <a href="https://reddit.com/r/nicespaceship" target="_blank" rel="noopener" class="nav-link">Community</a>
          </div>
          <div class="nav-right">
            <button class="nav-theme-btn" id="theme-toggle" title="Toggle theme">Light</button>
            <a href="https://nicespaceship.ai" class="nav-cta">Try NICE Free</a>
            <button class="nav-mobile-btn" id="nav-mobile-toggle" aria-label="Menu">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12h18M3 6h18M3 18h18"/></svg>
            </button>
          </div>
        </div>
      </nav>
    `;

    document.getElementById('nav-mobile-toggle')?.addEventListener('click', () => {
      document.getElementById('nav-links')?.classList.toggle('open');
    });
    document.getElementById('theme-toggle')?.addEventListener('click', () => {
      if (typeof ThemeLite !== 'undefined') ThemeLite.toggle();
    });
  }

  function renderFooter() {
    const footer = document.getElementById('site-footer');
    if (!footer) return;

    footer.innerHTML = `
      <div class="footer-inner">
        <div class="footer-grid">
          <div class="footer-col">
            <h4>Product</h4>
            <a href="https://nicespaceship.ai">NICE App</a>
            <a href="/blueprints">Blueprints</a>
            <a href="/pricing">Pricing</a>
            <a href="/academy">Academy</a>
          </div>
          <div class="footer-col">
            <h4>Community</h4>
            <a href="https://reddit.com/r/nicespaceship" target="_blank" rel="noopener">Reddit</a>
            <a href="https://github.com/nicespaceship/nice" target="_blank" rel="noopener">GitHub</a>
            <a href="/about">About</a>
          </div>
          <div class="footer-col">
            <h4>Legal</h4>
            <a href="/privacy">Privacy Policy</a>
            <a href="/terms">Terms of Service</a>
            <a href="/accessibility">Accessibility</a>
          </div>
          <div class="footer-col">
            <h4>Contact</h4>
            <a href="mailto:ben@nicespaceship.com">ben@nicespaceship.com</a>
            <a href="https://benduffey.com" target="_blank" rel="noopener">benduffey.com</a>
          </div>
        </div>
        <div class="footer-bottom">
          <span>&copy; ${new Date().getFullYear()} NICE SPACESHIP. MIT License.</span>
          <span>Las Vegas, NV</span>
        </div>
      </div>
    `;
  }

  return { render, renderFooter };
})();
