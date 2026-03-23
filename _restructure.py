#!/usr/bin/env python3
import os, glob, re

WDIR = '/Users/ben/Documents/GitHub/nicespaceship.com/.claude/worktrees/happy-blackwell/'

# ──────────────────────────────────────────────────────────────────
# Helper
# ──────────────────────────────────────────────────────────────────
def patch(path, old, new, count=1):
    with open(path, 'r') as f: c = f.read()
    if old not in c:
        print(f"  WARN: pattern not found in {path}")
        return
    c = c.replace(old, new, count)
    with open(path, 'w') as f: f.write(c)
    print(f"  OK: {path}")

# ──────────────────────────────────────────────────────────────────
# 1. NAV ORDER: root pages
# ──────────────────────────────────────────────────────────────────
ROOT_NAV_OLD = '      <li><a href="./atm.html">ATM</a></li>\n      <li><a href="./agents.html">Agents</a></li>'
ROOT_NAV_NEW = '      <li><a href="./agents.html">Agents</a></li>\n      <li><a href="./atm.html">ATM</a></li>'

ROOT_MOB_OLD = '    <a href="./atm.html">ATM</a>\n    <a href="./agents.html">Agents</a>'
ROOT_MOB_NEW = '    <a href="./agents.html">Agents</a>\n    <a href="./atm.html">ATM</a>'

for f in glob.glob(WDIR + '*.html'):
    if 'fleet.html' in f: continue
    with open(f) as fh: c = fh.read()
    changed = False
    if ROOT_NAV_OLD in c:
        c = c.replace(ROOT_NAV_OLD, ROOT_NAV_NEW)
        changed = True
    if ROOT_MOB_OLD in c:
        c = c.replace(ROOT_MOB_OLD, ROOT_MOB_NEW)
        changed = True
    if changed:
        with open(f, 'w') as fh: fh.write(c)
        print(f"  Nav updated: {os.path.basename(f)}")

# logs/*.html
LOG_NAV_OLD = '      <li><a href="../atm.html">ATM</a></li>\n      <li><a href="../agents.html">Agents</a></li>'
LOG_NAV_NEW = '      <li><a href="../agents.html">Agents</a></li>\n      <li><a href="../atm.html">ATM</a></li>'
LOG_MOB_OLD = '    <a href="../atm.html">ATM</a>\n    <a href="../agents.html">Agents</a>'
LOG_MOB_NEW = '    <a href="../agents.html">Agents</a>\n    <a href="../atm.html">ATM</a>'

for f in glob.glob(WDIR + 'logs/*.html'):
    with open(f) as fh: c = fh.read()
    changed = False
    if LOG_NAV_OLD in c:
        c = c.replace(LOG_NAV_OLD, LOG_NAV_NEW); changed = True
    if LOG_MOB_OLD in c:
        c = c.replace(LOG_MOB_OLD, LOG_MOB_NEW); changed = True
    if changed:
        with open(f, 'w') as fh: fh.write(c)
        print(f"  Nav updated: {os.path.basename(f)}")

print("Nav order done.")
