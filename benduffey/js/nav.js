/* benduffey.com — Shared Navigation
   Single-page site, so nav links are in-page anchors.
   "Visit NICE SPACESHIP" CTA points to the company site. */
const Nav = (() => {
  const LINKS = [
    { href: '#about',    label: 'About' },
    { href: '#nice',     label: 'NICE' },
    { href: '#greenfish', label: 'Greenfish' },
    { href: '#work',     label: 'Work' },
    { href: '#career',   label: 'Career' },
    { href: '#contact',  label: 'Contact' },
  ];

  // NICE SPACESHIP brand glyph — same SVG as the company site footer/CTA, so the
  // visual continuity is obvious when readers click through.
  function spaceshipGlyph(className) {
    return `<svg class="${className}" viewBox="0 0 3904 3380" fill="currentColor" aria-hidden="true"><path d="M3904,3379.96l-1953.37-614.82L0,3379.96l1507.93-1383.04L1946.66,16.66l9.29-16.66,442.33,1995.71,1505.7,1384.25ZM2120.63,1879.39L1959.98,90.02l-7.93-53.99-168.82,1843.2c-125.13,53.5-228.34,189.67-239.17,326.83-1.51,19.1,4.52,81.65-4.09,91.91L32.02,3359.96l1678.05-772.27c44.36,24.24,85.06,48.51,134.8,61.44,108.54,28.22,204.01,14.13,303.22-35.04,17.15-8.5,36.89-29.62,55.95-24.35l1667.93,770.23-1511.26-1064.72c20.11-172.37-79.84-348.94-240.08-415.86Z"/><path d="M1781.4,2422.6c-212.47-214.36,91.23-547.83,322.65-356.65,260.72,215.38-90.31,591.06-322.65,356.65Z"/></svg>`;
  }
  const FOOTER_GLYPH_SVG = spaceshipGlyph('footer-brand-icon');
  const CTA_GLYPH_SVG = spaceshipGlyph('nav-cta-icon');

  function render() {
    const header = document.getElementById('site-header');
    if (!header) return;

    header.innerHTML = `
      <nav class="nav">
        <div class="nav-inner">
          <a href="#" class="nav-brand">
            <span class="nav-brand-text">BENJAMIN DUFFEY</span>
          </a>
          <div class="nav-links" id="nav-links">
            ${LINKS.map(l => `<a href="${l.href}" class="nav-link">${l.label}</a>`).join('')}
          </div>
          <div class="nav-right">
            <a href="https://nicespaceship.com" class="nav-cta">${CTA_GLYPH_SVG}<span>Visit NICE SPACESHIP</span></a>
            <button class="nav-mobile-btn" id="nav-mobile-toggle" aria-label="Menu">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12h18M3 6h18M3 18h18"/></svg>
            </button>
          </div>
        </div>
      </nav>
    `;

    const toggle = document.getElementById('nav-mobile-toggle');
    const links = document.getElementById('nav-links');
    toggle?.addEventListener('click', () => links?.classList.toggle('open'));
    // Close mobile nav after tapping a link (anchor navigation feels broken otherwise).
    links?.querySelectorAll('a').forEach(a => a.addEventListener('click', () => links.classList.remove('open')));
  }

  function renderFooter() {
    const footer = document.getElementById('site-footer');
    if (!footer) return;

    const year = new Date().getFullYear();
    footer.innerHTML = `
      <div class="footer-inner">
        <div class="footer-grid">
          <div class="footer-col">
            <div class="footer-brand">
              <span class="footer-brand-text">BENJAMIN DUFFEY</span>
            </div>
            <p class="footer-desc">Founder, CEO &amp; Lead Engineer at NICE SPACESHIP. Las Vegas, NV.</p>
            <div class="footer-socials">
              <a href="https://github.com/benduffey" target="_blank" rel="noopener" title="GitHub"><i class="fa-brands fa-github"></i></a>
              <a href="https://www.linkedin.com/in/benduffey/" target="_blank" rel="noopener" title="LinkedIn"><i class="fa-brands fa-linkedin"></i></a>
              <a href="https://x.com/benduffey" target="_blank" rel="noopener" title="X"><i class="fa-brands fa-x-twitter"></i></a>
              <a href="https://www.youtube.com/@Greenfishlabs" target="_blank" rel="noopener" title="Greenfish Labs YouTube"><i class="fa-brands fa-youtube"></i></a>
            </div>
          </div>
          <div class="footer-col">
            <h4>Sections</h4>
            <a href="#about">About</a>
            <a href="#nice">NICE SPACESHIP</a>
            <a href="#greenfish">Greenfish Labs</a>
            <a href="#work">Selected Work</a>
            <a href="#career">Career</a>
          </div>
          <div class="footer-col">
            <h4>NICE SPACESHIP</h4>
            <a href="https://nicespaceship.com" target="_blank" rel="noopener">nicespaceship.com</a>
            <a href="https://nicespaceship.ai" target="_blank" rel="noopener">Launch NICE</a>
            <a href="https://github.com/nicespaceship/nice" target="_blank" rel="noopener">GitHub</a>
          </div>
          <div class="footer-col">
            <h4>Contact</h4>
            <a href="mailto:ben@nicespaceship.com">ben@nicespaceship.com</a>
          </div>
        </div>
        <div class="footer-bottom">
          <span>&copy; ${year} Benjamin Duffey</span>
          <a class="footer-launch" href="https://nicespaceship.com" target="_blank" rel="noopener">${FOOTER_GLYPH_SVG}<span>NICE SPACESHIP</span></a>
        </div>
      </div>
    `;
  }

  return { render, renderFooter };
})();
