import { reactive } from 'vue'

// Shared singleton auth state so any component (and fetch helpers) can read it
// and the App-level gate reacts instantly.
const state = reactive({
  enabled: false,        // password gate active on the server
  authenticated: false,  // current session valid
  ready: false,          // initial status check done
})

export function useAuth() {
  async function recheck() {
    try {
      const r = await fetch('/api/auth/status').then(res => res.json())
      state.enabled = !!r.authEnabled
      state.authenticated = !!r.authenticated
    } catch {
      // If status can't be fetched, fail open (don't lock the user out of an
      // instance that has no auth configured).
      state.enabled = false
      state.authenticated = true
    } finally {
      state.ready = true
    }
  }

  async function login(password: string) {
    const r = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    if (!r.ok) {
      let msg = 'Invalid password'
      try { msg = (await r.json()).error || msg } catch {}
      throw new Error(msg)
    }
    state.authenticated = true
    return true
  }

  async function logout() {
    try { await fetch('/api/logout', { method: 'POST' }) } catch {}
    state.authenticated = false
  }

  // Called by fetch helpers when a protected endpoint returns 401.
  function markUnauthenticated() {
    if (state.enabled) state.authenticated = false
  }

  return { state, recheck, login, logout, markUnauthenticated }
}
