/* NICE SPACESHIP — Shared Navigation */
const Nav = (() => {
  const LINKS = [
    { href: '/about', label: 'About' },
    { href: '/blueprints', label: 'Blueprints' },
    { href: '/pricing', label: 'Pricing' },
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
    return `<svg class="${className}" viewBox="0 0 5000 5000" fill="currentColor" aria-hidden="true"><path d="M2463.17,3633.17c348.87-33.89,529.56,395.76,262.71,618.71-179.73,150.16-459.24,78.58-546.6-137.16-85.98-212.33,54.43-459.26,283.89-481.55Z"/><path d="M3763.2,2905.2c246.91-17.2,431.6,227.75,353.89,461.89-87.4,263.37-443.86,323.54-610.74,100.57-168.07-224.56-21.82-543.04,256.85-562.46Z"/><path d="M2467.2,673.2c345.58-32.47,524.02,397,258.68,618.68-180.13,150.49-459.08,78.97-546.6-137.16-87.17-215.28,55.93-459.73,287.92-481.52Z"/><path d="M1203.18,2905.19c275.09-15.44,457.71,280.84,322.9,522.88-119.67,214.87-425.07,238.14-577.97,45.82-177.41-223.16-28.22-552.8,255.07-568.7Z"/><path d="M3537.4,2014.6c-177.73-177.72-114.08-485.01,120.51-574.69,274.93-105.11,544.87,148.19,461.85,429.85-73.68,249.96-398.06,329.14-582.35,144.85Z"/><path d="M1187.2,1409.2c279.69-26.25,476.07,269.48,341.49,517.49-117.32,216.2-419.09,243.76-576.57,55.2-178.93-214.25-41.59-546.72,235.08-572.68Z"/><path d="M2447.2,1853.2c550.99-42.77,908.61,573.22,585.69,1025.69-276.72,387.72-866.37,355.58-1097.57-60.2-228.12-410.24,44.43-929.2,511.88-965.49ZM2455.2,1953.2c-427.55,33.48-653.11,541.85-388.78,882.39,257.89,332.24,777.21,269.58,942.28-116.89,164.38-384.87-139.97-797.88-553.5-765.5Z"/><path d="M1272,2204v604c-33.72-4.09-66.28-4.09-100,0v-604c31.79,6.4,68.34,6.38,100,0Z"/><path d="M3836,2808c-34.42-3.47-65.53-5.37-100,0v-596c2.93-1.06,4.78,4,6,4h84c1.4,0,4.44-7.1,10,2v590Z"/><polygon points="3375.95 1580 2868.23 1291.66 2912.04 1203.99 3418.07 1491.98 3423.59 1497.98 3375.95 1580"/><polygon points="2139.99 1291.94 1637.96 1579.88 1588.37 1497.36 2086.75 1204.5 2095.49 1210.49 2139.99 1291.94"/><path d="M2139.98,3712.08c2.15,3.03-33.45,55.51-38.18,63.72-4.14,7.19-5.9,25.29-15.33,23.83l-494.1-289.2,43.94-82.16,11.78,1.54,491.88,282.27Z"/><path d="M3366,3424.08l45.38,82.85-3.37,11.08-492.12,280.28c-7.13-25.22-36.8-54.55-44.83-75.52-1.4-3.67-4.89-6.66-1.38-10.87l496.32-287.83Z"/><path d="M2483.19,2101.18c280.93-16.74,488.07,258.72,401.96,525.96-85.83,266.35-424.89,363.36-639.04,180.75-276.2-235.52-124.03-685.19,237.08-706.71Z"/></svg>`;
  }
  const GLYPH_SVG = spaceshipGlyph('nav-brand-icon');
  const FOOTER_GLYPH_SVG = spaceshipGlyph('footer-brand-icon');
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
            ${GLYPH_SVG}
            <span class="nav-brand-text">NICE SPACESHIP</span>
          </a>
          <div class="nav-links" id="nav-links">
            ${LINKS.map(l => `<a href="${l.href}" class="nav-link${_isActive(l.href) ? ' active' : ''}">${l.label}</a>`).join('')}
          </div>
          <div class="nav-right">
            <a href="https://nicespaceship.ai" class="nav-cta">${CTA_GLYPH_SVG}<span>Launch NICE</span></a>
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
              ${FOOTER_GLYPH_SVG}
              <span class="footer-brand-text">NICE SPACESHIP</span>
            </div>
            <p class="footer-desc">Neural Intelligence Command Engine.<br/>Open source, MIT licensed.</p>
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
            <a href="/pricing">Pricing</a>
            <a href="/docs">Documentation</a>
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
