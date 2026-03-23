#!/usr/bin/env python3
"""Batch update all HTML pages: add Agents nav link + nav-user block."""
import os, glob

ROOT_FILES = glob.glob('*.html')
LOGS_FILES = glob.glob('logs/*.html')

# ── Root pages replacements ──────────────────────────────────────────────
ROOT_OLD_NAVLINKS = '''\
    <ul class="nav-links">
      <li><a href="./fleet.html">Fleet</a></li>
      <li><a href="./atm.html">ATM</a></li>
      <li><a href="./academy.html">Academy</a></li>
    </ul>
    <div style="display:flex;align-items:center;gap:10px;">
      <a href="./contact.html" class="nav-profile-btn" aria-label="Account">
        <svg class="icon icon-sm" aria-hidden="true"><use href="#icon-profile"/></svg>
      </a>
      <button id="hamburger" aria-label="Toggle menu"><span></span><span></span><span></span></button>
    </div>'''

ROOT_NEW_NAVLINKS = '''\
    <ul class="nav-links">
      <li><a href="./fleet.html">Fleet</a></li>
      <li><a href="./atm.html">ATM</a></li>
      <li><a href="./agents.html">Agents</a></li>
      <li><a href="./academy.html">Academy</a></li>
    </ul>
    <div style="display:flex;align-items:center;gap:10px;">
      <div class="nav-user">
        <span class="nav-username">Pilot_007</span>
        <span class="nav-user-badge">SCOUT</span>
      </div>
      <a href="./contact.html" class="nav-profile-btn" aria-label="Account">
        <svg class="icon icon-sm" aria-hidden="true"><use href="#icon-profile"/></svg>
      </a>
      <button id="hamburger" aria-label="Toggle menu"><span></span><span></span><span></span></button>
    </div>'''

ROOT_OLD_MOBILE = '''\
  <div id="mobile-menu">
    <a href="./fleet.html">Fleet</a>
    <a href="./atm.html">ATM</a>
    <a href="./academy.html">Academy</a>
    <a href="./contact.html">Account</a>
  </div>'''

ROOT_NEW_MOBILE = '''\
  <div id="mobile-menu">
    <a href="./fleet.html">Fleet</a>
    <a href="./atm.html">ATM</a>
    <a href="./agents.html">Agents</a>
    <a href="./academy.html">Academy</a>
    <a href="./contact.html">Account</a>
  </div>'''

# ── Logs pages replacements ──────────────────────────────────────────────
LOGS_OLD_NAVLINKS = '''\
    <ul class="nav-links">
      <li><a href="../fleet.html">Fleet</a></li>
      <li><a href="../atm.html">ATM</a></li>
      <li><a href="../academy.html">Academy</a></li>
    </ul>
    <div style="display:flex;align-items:center;gap:12px;">
      <a href="../contact.html" class="nav-profile-btn" aria-label="Account">
        <svg class="icon icon-sm" aria-hidden="true"><use href="#icon-profile"/></svg>
      </a>
      <button id="hamburger" aria-label="Toggle menu"><span></span><span></span><span></span></button>
    </div>'''

LOGS_NEW_NAVLINKS = '''\
    <ul class="nav-links">
      <li><a href="../fleet.html">Fleet</a></li>
      <li><a href="../atm.html">ATM</a></li>
      <li><a href="../agents.html">Agents</a></li>
      <li><a href="../academy.html">Academy</a></li>
    </ul>
    <div style="display:flex;align-items:center;gap:12px;">
      <div class="nav-user">
        <span class="nav-username">Pilot_007</span>
        <span class="nav-user-badge">SCOUT</span>
      </div>
      <a href="../contact.html" class="nav-profile-btn" aria-label="Account">
        <svg class="icon icon-sm" aria-hidden="true"><use href="#icon-profile"/></svg>
      </a>
      <button id="hamburger" aria-label="Toggle menu"><span></span><span></span><span></span></button>
    </div>'''

LOGS_OLD_MOBILE = '''\
  <div id="mobile-menu">
    <a href="../fleet.html">Fleet</a>
    <a href="../atm.html">ATM</a>
    <a href="../academy.html">Academy</a>
    <a href="../contact.html">Account</a>
  </div>'''

LOGS_NEW_MOBILE = '''\
  <div id="mobile-menu">
    <a href="../fleet.html">Fleet</a>
    <a href="../atm.html">ATM</a>
    <a href="../agents.html">Agents</a>
    <a href="../academy.html">Academy</a>
    <a href="../contact.html">Account</a>
  </div>'''

def patch(filename, old_nav, new_nav, old_mob, new_mob):
    with open(filename, 'r') as f:
        content = f.read()
    changed = False
    if old_nav in content:
        content = content.replace(old_nav, new_nav, 1)
        changed = True
    if old_mob in content:
        content = content.replace(old_mob, new_mob, 1)
        changed = True
    if changed:
        with open(filename, 'w') as f:
            f.write(content)
        print(f'  patched: {filename}')
    else:
        print(f'  skipped (no match): {filename}')

print('Patching root pages...')
for f in ROOT_FILES:
    patch(f, ROOT_OLD_NAVLINKS, ROOT_NEW_NAVLINKS, ROOT_OLD_MOBILE, ROOT_NEW_MOBILE)

print('Patching logs pages...')
for f in LOGS_FILES:
    patch(f, LOGS_OLD_NAVLINKS, LOGS_NEW_NAVLINKS, LOGS_OLD_MOBILE, LOGS_NEW_MOBILE)

print('Done.')
