import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));

// Record every table ActivityFeed subscribes to via the realtime channel.
let subscribedTables = [];
function makeSB() {
  return {
    client: {
      channel: () => {
        const ch = {
          on: (_evt, filter, _cb) => { subscribedTables.push(filter && filter.table); return ch; },
          subscribe: () => ch,
        };
        return ch;
      },
    },
  };
}

function loadModule(rel) {
  let code = readFileSync(resolve(__dir, '..', rel), 'utf-8');
  code = code.replace(/^const (\w+)\s*=/gm, 'globalThis.$1 =');
  eval(code);
}

loadModule('lib/activity-feed.js');

describe('ActivityFeed realtime subscriptions', () => {
  beforeEach(() => {
    subscribedTables = [];
    globalThis.SB = makeSB();
  });

  it('subscribes to mission_runs (renamed from tasks), never the dropped tasks table', () => {
    // `tasks` was renamed to `mission_runs` in 20260424020717. Subscribing to
    // the old name delivered nothing, so mission events never reached the feed.
    ActivityFeed.init();
    expect(subscribedTables).toContain('agents');
    expect(subscribedTables).toContain('mission_runs');
    expect(subscribedTables).not.toContain('tasks');
  });
});
