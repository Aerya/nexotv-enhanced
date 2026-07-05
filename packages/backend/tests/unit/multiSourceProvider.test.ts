import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/utils/validateUrl', () => ({ validatePublicUrl: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../../src/parsers/m3uParser', () => ({
  parseM3U: (text: string) => ({
    channels: [{ name: text, url: `https://stream.example/${text}`, group: 'News' }],
  }),
}));

import { fetchData } from '../../src/providers/multiSourceProvider';

describe('multiSourceProvider', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('loads one source at a time while preserving source priority', async () => {
    let activeFetches = 0;
    let maxActiveFetches = 0;
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      activeFetches++;
      maxActiveFetches = Math.max(maxActiveFetches, activeFetches);
      await new Promise(resolve => setTimeout(resolve, 10));
      activeFetches--;
      const text = url.includes('first') ? 'First channel' : 'Second channel';
      return { ok: true, text: async () => text } as Response;
    }));

    const addon = {
      idPrefix: 'abc123',
      config: {
        sources: [
          { id: 'one', name: 'First', provider: 'm3u', m3uUrl: 'https://first.example/list.m3u' },
          { id: 'two', name: 'Second', provider: 'm3u', m3uUrl: 'https://second.example/list.m3u' },
        ],
      },
      channels: [],
      epgData: {},
      log: { warn: vi.fn(), debug: vi.fn() },
    };

    await fetchData(addon);

    expect(maxActiveFetches).toBe(1);
    expect(addon.channels.map((channel: any) => channel.name)).toEqual([
      'First channel (First)',
      'Second channel (Second)',
    ]);
  });
});
