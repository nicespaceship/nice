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

  it('subscribes to the live tables (user_agents, mission_runs), never the dropped agents/tasks names', () => {
    // Both names were stale: `tasks` was renamed to `mission_runs`
    // (20260424020717), and there was never a bare `agents` table; it is
    // `user_agents`. Subscribing to a dropped name silently delivers nothing,
    // so those events never reached the feed.
    ActivityFeed.init();
    expect(subscribedTables).toContain('user_agents');
    expect(subscribedTables).toContain('mission_runs');
    expect(subscribedTables).not.toContain('agents');
    expect(subscribedTables).not.toContain('tasks');
  });
});
