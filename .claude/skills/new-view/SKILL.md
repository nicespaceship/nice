---
name: new-view
description: Scaffold a new NICE view with IIFE module, route registration, script tag, and CSS section. Use when the user asks to create a new page/view.
user-invocable: true
---

# Create a New NICE View

Follow these steps to add a new view to the NICE app:

## 1. Create the view file

File: `app/js/views/{name}.js`

```javascript
const {Name}View = (() => {
  const title = '{Display Name}';

  function render(el) {
    const user = State.get('user');
    if (!user) return _authPrompt(el, '{display name}');

    el.innerHTML = `
      <div class="{name}-wrap">
        <div class="bp-header">
          <div>
            <h1 class="bp-title">{Display Name}</h1>
            <p class="bp-sub">{Subtitle description.}</p>
          </div>
        </div>
        <!-- View content here -->
      </div>
    `;

    _bindEvents(el);
  }

  function _bindEvents(el) {
    // Event listeners
  }

  function destroy() {
    // Clean up State listeners, Supabase channels
  }

  return { title, render, destroy };
})();
```

## 2. Add script tag to `app/index.html`

Add in the view scripts section (after other view scripts, before lib scripts):
```html
<script defer src="./js/views/{name}.js"></script>
```

## 3. Register the route in `app/js/nice.js`

In `_initRoutes()`:
```javascript
Router.on('/{name}', {Name}View);
```

## 4. Add to service worker cache in `app/sw.js`

In `PRECACHE_ASSETS`:
```javascript
'/app/js/views/{name}.js',
```

## 5. Add CSS section to `app/css/app.css`

```css
/* ── {Display Name} ── */
.{name}-wrap { max-width:900px; margin:0 auto; padding:0 16px; }
```

## 6. Add to command palette in `app/js/lib/command-palette.js`

```javascript
{ label: '{Display Name}', path: '/{name}', keywords: '{keywords}', icon: '#icon-{icon}' },
```

## 7. Update CLAUDE.md

Add to the view table:
```
| `{Name}View` | `{name}.js` | `#/{name}` | {Display Name} |
```

## Checklist
- [ ] View file created with IIFE pattern
- [ ] Script tag added to index.html
- [ ] Route registered in nice.js
- [ ] Added to sw.js cache list
- [ ] CSS section added
- [ ] Command palette entry added
- [ ] CLAUDE.md updated
- [ ] `node -c app/js/views/{name}.js` passes
- [ ] `npx vitest run` passes
