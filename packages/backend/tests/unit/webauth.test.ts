import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

// webauth reads env at call time, but env is imported as a module — reload it
// with a mocked CONFIG to toggle WEBUI_PASSWORD.

describe('webauth with password set', () => {
  let mod: typeof import('../../src/utils/webauth');

  beforeAll(async () => {
    vi.resetModules();
    vi.doMock('../../src/config/env', () => ({
      default: { WEBUI_PASSWORD: 'sup3r-secret', WEBUI_SESSION_TTL_MS: 3600000 },
      repoRoot: '/tmp',
    }));
    mod = await import('../../src/utils/webauth');
  });
  afterAll(() => { vi.resetModules(); vi.doUnmock('../../src/config/env'); });

  it('reports auth enabled', () => {
    expect(mod.authEnabled()).toBe(true);
  });

  it('verifyPassword accepts the right password, rejects others', () => {
    expect(mod.verifyPassword('sup3r-secret')).toBe(true);
    expect(mod.verifyPassword('wrong')).toBe(false);
    expect(mod.verifyPassword('')).toBe(false);
    expect(mod.verifyPassword(undefined)).toBe(false);
  });

  it('round-trips a session token', () => {
    const tok = mod.createSession()!;
    expect(typeof tok).toBe('string');
    expect(mod.verifySession(tok)).toBe(true);
  });

  it('rejects tampered / malformed / empty session tokens', () => {
    const tok = mod.createSession()!;
    expect(mod.verifySession(tok + 'x')).toBe(false);
    expect(mod.verifySession('garbage')).toBe(false);
    expect(mod.verifySession('')).toBe(false);
    expect(mod.verifySession(undefined)).toBe(false);
  });

  it('isAuthenticated reads the session cookie', () => {
    const tok = mod.createSession()!;
    expect(mod.isAuthenticated({ headers: { cookie: `nx_session=${tok}` } })).toBe(true);
    expect(mod.isAuthenticated({ headers: { cookie: 'nx_session=bad' } })).toBe(false);
    expect(mod.isAuthenticated({ headers: {} })).toBe(false);
  });

  it('parses cookies', () => {
    expect(mod.parseCookies('a=1; b=two; nx_session=abc')).toEqual({ a: '1', b: 'two', nx_session: 'abc' });
    expect(mod.parseCookies(undefined)).toEqual({});
  });
});

describe('webauth without password (open instance)', () => {
  let mod: typeof import('../../src/utils/webauth');

  beforeAll(async () => {
    vi.resetModules();
    vi.doMock('../../src/config/env', () => ({
      default: { WEBUI_PASSWORD: null, WEBUI_SESSION_TTL_MS: 3600000 },
      repoRoot: '/tmp',
    }));
    mod = await import('../../src/utils/webauth');
  });
  afterAll(() => { vi.resetModules(); vi.doUnmock('../../src/config/env'); });

  it('auth disabled → always authenticated, no session issued', () => {
    expect(mod.authEnabled()).toBe(false);
    expect(mod.createSession()).toBeNull();
    expect(mod.isAuthenticated({ headers: {} })).toBe(true);
    expect(mod.verifyPassword('anything')).toBe(false);
  });
});
