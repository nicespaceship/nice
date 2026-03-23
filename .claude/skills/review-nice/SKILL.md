---
name: review-nice
description: Review NICE app code for consistency with project conventions, theme system, and module patterns. Use after making changes to verify quality.
disable-model-invocation: true
allowed-tools: Read, Grep, Glob, Agent
---

# Review NICE Code

Audit changed files for consistency with NICE project conventions.

## Checks

### 1. IIFE Module Pattern
All JS modules in `app/js/lib/` and `app/js/views/` must use:
```javascript
const ModuleName = (() => {
  // private state
  return { /* public API */ };
})();
```
- No ES module imports/exports
- No class syntax for top-level modules
- Module name must match filename (PascalCase)

### 2. Theme CSS Variables
No hardcoded colors in `app/css/app.css`. All colors must use CSS custom properties:
- `var(--bg)`, `var(--text)`, `var(--accent)`, `var(--border)`, etc.
- Exceptions: rarity colors (`#f59e0b`, `#a855f7`, `#ef4444`, `#6366f1`) which are consistent across themes
- Check with: `grep -n '#[0-9a-fA-F]\{3,6\}' app/css/app.css` and verify each is a rarity/brand color or inside a `[data-theme]` block

### 3. localStorage Namespacing
All localStorage keys must be prefixed with `nice-` or `ns-`:
- Search for: `localStorage.setItem` and `localStorage.getItem` calls
- Verify key names follow convention

### 4. Script Load Order
`app/index.html` script tags must maintain dependency order:
```
state.js → supabase.js → router.js → [views] → [libs] → nice.js
```
- `nice.js` must always be LAST
- Lib modules that depend on views must come after views

### 5. Feature Detection
All cross-module calls must use `typeof` guards:
```javascript
if (typeof ModuleName !== 'undefined' && ModuleName.method) {
  ModuleName.method();
}
```
This ensures graceful degradation if a module fails to load.

### 6. No Console Pollution
- `console.log` for debugging should not be committed
- `console.warn` is OK for fallback notices (e.g., "[ShipLog] DB write failed")
- `console.error` is OK for actual errors

## Output
Report findings as a checklist with pass/fail for each category. Flag any violations with file path and line number.
