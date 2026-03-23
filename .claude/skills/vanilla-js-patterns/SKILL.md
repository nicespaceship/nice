---
name: vanilla-js-patterns
description: Vanilla JavaScript patterns for Nice Spaceship — IIFE modules, no-build philosophy, DOM manipulation, event handling. Use when writing new modules or refactoring JS.
user-invocable: true
---

# Vanilla JS Patterns

## No-Build Philosophy
- NO bundlers (webpack, vite, esbuild)
- NO TypeScript, NO JSX
- ES6 syntax only (const, let, arrow functions, template literals, destructuring)
- Scripts loaded via `<script defer>` tags in dependency order
- Service Worker caching requires Cmd+Shift+R for fresh code

## IIFE Module Pattern
```javascript
const MyModule = (() => {
  // Private — never exposed
  let _data = {};
  function _validate(v) { return v != null; }

  // Public API — only these are accessible
  function init() { /* setup */ }
  function getData(k) { return _data[k]; }

  return { init, getData };
})();
```

## Rules
1. One module per file, one IIFE per file
2. Private vars prefixed with `_` (convention, not enforced)
3. Public API returned as object literal
4. No circular dependencies — check load order
5. `typeof OtherModule !== 'undefined'` guards for optional deps

## State Management
```javascript
// DO: Use State pub/sub for shared data
State.set('agents', agentList);
State.on('agents', (list) => renderAgents(list));

// DON'T: Use global variables
window.agents = agentList; // ← NEVER
```

## DOM Manipulation
```javascript
// Prefer getElementById for known IDs
const el = document.getElementById('my-element');

// Use querySelector for CSS selectors
const btn = document.querySelector('.btn-primary[data-action="save"]');

// Event delegation for dynamic content
container.addEventListener('click', (e) => {
  const card = e.target.closest('.card');
  if (card) handleCardClick(card.dataset.id);
});

// Batch innerHTML updates (one big template literal)
el.innerHTML = `
  <div class="header">${title}</div>
  <div class="body">${items.map(i => `<p>${i}</p>`).join('')}</div>
`;
```

## Event Cleanup
```javascript
// Always remove listeners in destroy()
function render(el) {
  State.on('data', _onDataChanged);
}
function destroy() {
  State.off('data', _onDataChanged);
}
```

## Async Patterns
```javascript
// Use async/await with try/catch
async function loadData() {
  try {
    const data = await SB.db('table').list({ userId: user.id });
    State.set('data', data);
  } catch (err) {
    console.warn('[Module] Load failed:', err.message);
  }
}
```

## HTML Escaping
```javascript
// Always escape user input in templates
function _esc(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}
el.innerHTML = `<span>${_esc(userInput)}</span>`;
```

## Testing IIFE Modules
```javascript
// Tests use loadScriptGlobal() to convert const to globalThis
function loadScriptGlobal(path) {
  let code = readFileSync(resolve(__dirname, '..', path), 'utf-8');
  code = code.replace(/^const (\w+)\s*=/gm, 'globalThis.$1 =');
  eval(code);
}
// After loading, module is available as globalThis.ModuleName
```
