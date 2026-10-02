/* NICE SPACESHIP — Shared Navigation */
const Nav = (() => {
  const LINKS = [
    { href: '/explore', label: 'Explore' },
    { href: '/blueprints', label: 'Blueprints' },
    { href: '/docs', label: 'Documentation' },
  ];

  // Inline glyphs so paths inherit currentColor (matches whatever text
  // color the surrounding lockup uses — keeps icons theme-safe without
  // touching the SVG assets which are also linked as favicons).
  // The two glyphs are distinct: spaceship = the company mark (used in
  // the brand lockup), nice = the product mark (used in the Launch NICE
  // CTA which links to the product domain).
  function spaceshipGlyph(className) {
    return `<svg class="${className}" viewBox="0 0 3904 3380" fill="currentColor" aria-hidden="true"><path d="M3904,3379.96l-1953.37-614.82L0,3379.96l1507.93-1383.04L1946.66,16.66l9.29-16.66,442.33,1995.71,1505.7,1384.25ZM2120.63,1879.39L1959.98,90.02l-7.93-53.99-168.82,1843.2c-125.13,53.5-228.34,189.67-239.17,326.83-1.51,19.1,4.52,81.65-4.09,91.91L32.02,3359.96l1678.05-772.27c44.36,24.24,85.06,48.51,134.8,61.44,108.54,28.22,204.01,14.13,303.22-35.04,17.15-8.5,36.89-29.62,55.95-24.35l1667.93,770.23-1511.26-1064.72c20.11-172.37-79.84-348.94-240.08-415.86Z"/><path d="M1781.4,2422.6c-212.47-214.36,91.23-547.83,322.65-356.65,260.72,215.38-90.31,591.06-322.65,356.65Z"/></svg>`;
  }
  function niceGlyph(className) {
    return `<svg class="${className}" viewBox="0 0 32 30" fill="currentColor" aria-hidden="true"><g transform="translate(0,1)"><polygon points="16,0 23.5,13 8.5,13" fill="#00C897"/><polygon points="7.5,14.5 15,27.5 0,27.5" fill="currentColor"/><polygon points="24.5,14.5 32,27.5 17,27.5" fill="currentColor"/></g></svg>`;
  }
  const NAV_BRAND_GLYPH_SVG = niceGlyph('nav-brand-icon');
  const FOOTER_GLYPH_SVG = niceGlyph('footer-brand-icon');
  const CTA_GLYPH_SVG = niceGlyph('nav-cta-icon');

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
            ${NAV_BRAND_GLYPH_SVG}
            <span class="nav-brand-text">NICE SPACESHIP</span>
          </a>
          <div class="nav-links" id="nav-links">
            ${LINKS.map(l => `<a href="${l.href}" class="nav-link${_isActive(l.href) ? ' active' : ''}">${l.label}</a>`).join('')}
            <a href="https://nicespaceship.ai" class="nav-cta">Launch NICE</a>
          </div>
          <div class="nav-right">
            <button class="theme-toggle" id="theme-toggle" aria-label="Toggle dark mode"><i class="fa-solid fa-${(document.body.getAttribute('data-theme') === 'dark') ? 'sun' : 'moon'}"></i></button>
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
            <div class="footer-brand">
              <span class="footer-brand-text">NICE SPACESHIP</span>
            </div>
            <p class="footer-desc"><span class="footer-desc-icon">${FOOTER_GLYPH_SVG}</span>Neural Intelligence Command Engine</p>
            <p class="footer-meta">Open source, MIT licensed.</p>
            <div class="footer-socials">
              <a href="https://github.com/nicespaceship/nice" target="_blank" rel="noopener" title="GitHub"><i class="fa-brands fa-github"></i></a>
              <a href="https://www.reddit.com/r/nicespaceship/" target="_blank" rel="noopener" title="Reddit"><i class="fa-brands fa-reddit"></i></a>
              <a href="https://x.com/nicespaceship" target="_blank" rel="noopener" title="X"><i class="fa-brands fa-x-twitter"></i></a>
              <a href="https://www.instagram.com/nicespaceship" target="_blank" rel="noopener" title="Instagram"><i class="fa-brands fa-instagram"></i></a>
              <a href="https://www.tiktok.com/@nicespaceship" target="_blank" rel="noopener" title="TikTok"><i class="fa-brands fa-tiktok"></i></a>
            </div>
          </div>
          <div class="footer-col">
            <h4>Product</h4>
            <a href="https://nicespaceship.ai">NICE</a>
            <a href="/blueprints">Blueprints</a>
            <a href="/explore#pricing">Pricing</a>
          </div>
          <div class="footer-col">
            <h4>Resources</h4>
            <a href="/docs">Documentation</a>
            <a href="/explore">Explore</a>
            <a href="https://github.com/nicespaceship/nice" target="_blank" rel="noopener">GitHub</a>
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

  return { render, renderFooter, niceGlyph, spaceshipGlyph };
})();
