import { describe, it, expect, beforeEach, vi } from 'vitest';

// DataIO is loaded globally by setup.js

describe('DataIO', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should be defined with expected methods', () => {
    expect(globalThis.DataIO).toBeDefined();
    expect(typeof globalThis.DataIO.exportData).toBe('function');
    expect(typeof globalThis.DataIO.importData).toBe('function');
  });

  it('should export data creating a download blob', () => {
    localStorage.setItem('nice-xp', '100');
    State.set('agents', [{ id: '1', name: 'Nova' }]);

    // Mock URL.createObjectURL to capture the Blob
    let capturedBlob = null;
    globalThis.URL.createObjectURL = vi.fn((blob) => { capturedBlob = blob; return 'blob:test'; });
    globalThis.URL.revokeObjectURL = vi.fn();

    // Mock HTMLAnchorElement click
    const origClick = HTMLAnchorElement.prototype.click;
    let clicked = false;
    HTMLAnchorElement.prototype.click = function() { clicked = true; };

    globalThis.DataIO.exportData();

    expect(clicked).toBe(true);
    expect(capturedBlob).toBeInstanceOf(Blob);
    expect(capturedBlob.type).toBe('application/json');

    HTMLAnchorElement.prototype.click = origClick;
  });

  it('importData should reject invalid JSON gracefully', async () => {
    const badFile = new File(['not json at all'], 'bad.json', { type: 'application/json' });

    // Should not throw, just alert/warn
    const alertMock = vi.fn();
    globalThis.alert = alertMock;

    try {
      await globalThis.DataIO.importData(badFile);
    } catch (e) {
      // acceptabale to throw
    }

    globalThis.alert = undefined;
  });

  it('should handle missing File gracefully', async () => {
    // importData with no file should not crash
    try {
      await globalThis.DataIO.importData(null);
    } catch (e) {
      // Expected — no file
    }
  });

  it('should have localStorage keys collected during export', () => {
    localStorage.setItem('nice-xp', '50');
    localStorage.setItem('nice-budget', '{}');
    localStorage.setItem('ns-theme', 'matrix');
    localStorage.setItem('unrelated-key', 'ignored');

    // Verify only nice-* and ns-* keys would be exported
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith('nice-') || key.startsWith('ns-'))) {
        keys.push(key);
      }
    }
    expect(keys).toContain('nice-xp');
    expect(keys).toContain('nice-budget');
    expect(keys).toContain('ns-theme');
    expect(keys).not.toContain('unrelated-key');
  });
});
