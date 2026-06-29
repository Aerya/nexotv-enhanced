import type { AddonConfig } from '../types/config'

/** sessionStorage key used to hand a saved config to the form on reload. */
export const RESTORE_KEY = 'nx_restore_config'

// Cached for the lifetime of the page load so every component (App + the active
// provider form) sees the same restored config, even after the one-shot
// sessionStorage entry has been consumed. A full navigation resets this.
let cached: { value: AddonConfig | null } | null = null

function fromUrl(): AddonConfig | null {
  try {
    const parts = window.location.pathname.split('/').filter(Boolean)
    if (parts.length < 2) return null
    const lastPart = parts[parts.length - 1]
    if (!lastPart.startsWith('configure')) return null
    const token = parts[parts.length - 2]
    if (!token) return null
    // Encrypted tokens (enc:...) cannot be decoded client-side.
    if (token.startsWith('enc:')) return null
    let b64 = token.replace(/-/g, '+').replace(/_/g, '/')
    while (b64.length % 4) b64 += '='
    const json = decodeURIComponent(escape(atob(b64)))
    return JSON.parse(json)
  } catch {
    return null
  }
}

function fromSession(): AddonConfig | null {
  try {
    const raw = sessionStorage.getItem(RESTORE_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function useDecodedToken() {
  if (!cached) {
    let value = fromUrl()
    if (!value) {
      // Fallback for encrypted/compressed tokens: a saved config handed over via
      // sessionStorage (see SavedConfigs "Load"). Consume it once.
      value = fromSession()
      if (value) { try { sessionStorage.removeItem(RESTORE_KEY) } catch { /* ignore */ } }
    }
    cached = { value }
  }
  return { decodedConfig: cached.value }
}
