import { reactive } from 'vue'
import { useAuth } from './useAuth'
import type { AddonConfig } from '../types/config'

export interface SavedConfigMeta {
  id: string
  name: string
  provider: string
  updatedAt: number
}

const state = reactive({
  items: [] as SavedConfigMeta[],
  loaded: false,
})

function check401(status: number) {
  if (status === 401) { useAuth().markUnauthenticated(); return true }
  return false
}

export function useSavedConfigs() {
  async function refresh() {
    try {
      const r = await fetch('/api/configs')
      if (check401(r.status)) return
      const d = await r.json()
      state.items = Array.isArray(d.configs) ? d.configs : []
    } catch {
      state.items = []
    } finally {
      state.loaded = true
    }
  }

  async function save(name: string, config: AddonConfig, id?: string): Promise<SavedConfigMeta> {
    const r = await fetch('/api/configs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, config, id }),
    })
    if (check401(r.status)) throw new Error('Session expired — please sign in again.')
    if (!r.ok) throw new Error('Save failed')
    const meta = await r.json()
    await refresh()
    return meta
  }

  async function get(id: string): Promise<AddonConfig> {
    const r = await fetch('/api/configs/' + encodeURIComponent(id))
    if (check401(r.status)) throw new Error('Session expired — please sign in again.')
    if (!r.ok) throw new Error('Config not found')
    return (await r.json()).config
  }

  async function remove(id: string) {
    const r = await fetch('/api/configs/' + encodeURIComponent(id), { method: 'DELETE' })
    if (check401(r.status)) return
    await refresh()
  }

  return { state, refresh, save, get, remove }
}
