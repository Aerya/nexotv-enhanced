import { describe, it, expect, beforeAll } from 'vitest';
import * as sqliteCache from '../../src/utils/sqliteCache';
import * as viewLog from '../../src/utils/viewLog';

// In-memory DB (idempotent init: first call wins).
beforeAll(() => { sqliteCache.init(':memory:'); });

describe('viewLog', () => {
  it('records entries and lists them newest-first', () => {
    viewLog.clear();
    const now = Date.now();
    viewLog.record({ ts: now - 1000, type: 'movie', id: 'a', title: 'A', ip: '1.1.1.1', source: 'X', mac: '', cfg: 'c1' });
    viewLog.record({ ts: now, type: 'tv', id: 'b', title: 'B', ip: '2.2.2.2', source: 'Y', mac: '00:11', cfg: 'c1' });
    const l = viewLog.list();
    expect(l).toHaveLength(2);
    expect(l[0].id).toBe('b'); // newest first
    expect(l[1].id).toBe('a');
  });

  it('prunes entries older than 30 days', () => {
    viewLog.clear();
    viewLog.record({ ts: Date.now() - 40 * 24 * 3600 * 1000, type: 'tv', id: 'old', title: 'Old', ip: '', source: '', mac: '', cfg: '' });
    expect(viewLog.list()).toHaveLength(0);
  });

  it('clears the log', () => {
    viewLog.record({ ts: Date.now(), type: 'tv', id: 'x', title: 'X', ip: '', source: '', mac: '', cfg: '' });
    viewLog.clear();
    expect(viewLog.list()).toHaveLength(0);
  });
});
