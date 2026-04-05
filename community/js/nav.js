/* NICE SPACESHIP — Shared Navigation */
const Nav = (() => {
  const LINKS = [
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
          </div>
          <div class="nav-right">
            <a href="https://nicespaceship.ai" class="nav-cta">Launch NICE</a>
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
  }

  function renderFooter() {
    const footer = document.getElementById('site-footer');
    if (!footer) return;

    footer.innerHTML = `
      <div class="footer-inner">
        <div class="footer-grid">
          <div class="footer-col">
            <div class="footer-brand">NICE SPACESHIP</div>
            <p class="footer-desc">Neural Intelligence Command Engine.<br/>Open source, MIT licensed.</p>
            <div class="footer-socials">
              <a href="https://github.com/nicespaceship/nice" target="_blank" rel="noopener" title="GitHub"><i class="fa-brands fa-github"></i></a>
              <a href="https://www.reddit.com/r/nicespaceship/" target="_blank" rel="noopener" title="Reddit"><i class="fa-brands fa-reddit"></i></a>
              <a href="https://x.com/nicespaceship" target="_blank" rel="noopener" title="X"><i class="fa-brands fa-x-twitter"></i></a>
              <a href="https://www.instagram.com/nicespaceship" target="_blank" rel="noopener" title="Instagram"><i class="fa-brands fa-instagram"></i></a>
              <a href="https://www.tiktok.com/@nicespaceship" target="_blank" rel="noopener" title="TikTok"><i class="fa-brands fa-tiktok"></i></a>
            </div>
            <a href="https://nicespaceship.ai" class="footer-launch">Launch NICE <span>→</span></a>
          </div>
          <div class="footer-col">
            <h4>Product</h4>
            <a href="https://nicespaceship.ai">Launch NICE</a>
            <a href="/blueprints">Blueprints</a>
            <a href="/pricing">Pricing</a>
            <a href="/academy">Academy</a>
          </div>
          <div class="footer-col">
            <h4>Resources</h4>
            <a href="https://github.com/nicespaceship/nice" target="_blank" rel="noopener">GitHub</a>
            <a href="https://www.reddit.com/r/nicespaceship/" target="_blank" rel="noopener">Community</a>
            <a href="/about">About</a>
          </div>
          <div class="footer-col">
            <h4>Legal</h4>
            <a href="/privacy">Privacy</a>
            <a href="/terms">Terms</a>
            <a href="/accessibility">Accessibility</a>
          </div>
        </div>
        <div class="footer-bottom">
          <span>&copy; ${new Date().getFullYear()} NICE SPACESHIP</span>
          <span>United Federation of Planets</span>
        </div>
      </div>
    `;
  }

  return { render, renderFooter };
})();
