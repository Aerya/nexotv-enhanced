<template>
  <form class="config-form" autocomplete="off">
    <fieldset>
      <legend>{{ t('Playlist', 'Playlist') }}</legend>

      <div class="info-banner">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <path d="M12 16v-4M12 8h.01"></path>
        </svg>
        <span>
          Paste any <strong>M3U or M3U+</strong> playlist URL. Works with Xtream Codes
          <code>type=m3u_plus</code> links and standard M3U playlists.
          Each channel's stream URL is extracted individually.
        </span>
      </div>

      <div class="form-group">
        <label for="m3uUrl">Playlist URL <span class="req">*</span></label>
        <input type="url" id="m3uUrl" v-model="form.m3uUrl"
          placeholder="http://provider.com/get.php?username=X&password=Y&type=m3u_plus"
          autocomplete="off">
      </div>

      <div class="form-group">
        <label class="group-label">
          Public Playlists
          <span class="hint"> — third-party links, not affiliated with or endorsed by this addon.</span>
        </label>
        <div class="playlist-chips">
          <button
            v-for="pl in playlists"
            :key="pl.url"
            type="button"
            class="playlist-chip"
            :title="pl.url"
            @click="form.m3uUrl = pl.url"
          >
            <span class="chip-label">{{ pl.label }}</span>
            <span class="chip-note">{{ pl.note || '' }}</span>
          </button>
        </div>
      </div>
    </fieldset>

    <fieldset>
      <legend>{{ t('Categories', 'Catégories') }}</legend>
      <div class="info-banner">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <path d="M12 16v-4M12 8h.01"></path>
        </svg>
        <span>
          Load the categories (<code>group-title</code>) from the playlist, then pick the ones you
          want. Leave it untouched to include <strong>all</strong> categories in a single catalog.
        </span>
      </div>

      <div class="form-group">
        <button type="button" class="btn ghost" :disabled="loadingCats" @click="loadCategories">
          {{ loadingCats ? t('Loading…', 'Chargement…') : (categoriesLoaded ? t('Reload categories', 'Recharger les catégories') : t('Load categories', 'Charger les catégories')) }}
        </button>
        <small v-if="catsError" class="hint warn">{{ catsError }}</small>
      </div>

      <CategorySelector
        v-if="categoriesLoaded"
        v-model="form.selectedCategories"
        v-model:mode="form.catalogMode"
        v-model:groups="form.catalogGroups"
        v-model:discoverOnly="form.discoverOnly"
        :categories="categories"
        modeName="m3uCatalogMode"
      />
    </fieldset>

    <fieldset>
      <legend>{{ t('EPG Options', 'Options EPG') }}</legend>

      <div class="form-group checkbox-line">
        <input type="checkbox" id="m3uEnableEpg" v-model="form.enableEpg">
        <label class="checkbox-label" for="m3uEnableEpg">Enable EPG (program guide)</label>
      </div>

      <template v-if="form.enableEpg">
        <div class="form-group">
          <label class="group-label">EPG Source Mode</label>
          <div class="radio-group">
            <label class="checkbox-line">
              <input type="radio" name="m3uEpgMode" value="auto" v-model="form.epgMode">
              <span class="checkbox-label">Auto-detect from playlist header (<code>url-tvg</code>)</span>
            </label>
            <label class="checkbox-line">
              <input type="radio" name="m3uEpgMode" value="custom" v-model="form.epgMode">
              <span class="checkbox-label">Custom XMLTV URL</span>
            </label>
          </div>
        </div>

        <div v-if="form.epgMode === 'custom'" class="form-group">
          <label for="m3uCustomEpgUrl">Custom EPG XML URL</label>
          <input type="url" id="m3uCustomEpgUrl" v-model="form.customEpgUrl"
            placeholder="https://provider.com/epg.xml">
          <small class="hint">Used instead of the playlist's url-tvg header when selected.</small>
        </div>

        <div class="form-group">
          <label for="m3uEpgOffsetHours">EPG Offset (hours)</label>
          <input type="number" step="0.25" id="m3uEpgOffsetHours" v-model.number="form.epgOffsetHours"
            min="-48" max="48">
        </div>
      </template>

      <div class="form-group checkbox-line">
        <input type="checkbox" id="m3uReformatLogos" v-model="form.reformatLogos">
        <label class="checkbox-label" for="m3uReformatLogos">Reformat Logos
          <span class="hint">(may slow down loading)</span></label>
      </div>
    </fieldset>

    <fieldset>
      <legend>{{ t('Advanced', 'Avancé') }}</legend>
      <div class="form-group">
        <label class="group-label">Global User-Agent
          <span class="hint"> — leave blank unless your provider requires a specific player</span>
        </label>
        <div class="playlist-chips">
          <button
            v-for="p in USER_AGENT_PRESETS"
            :key="p.value"
            type="button"
            class="playlist-chip"
            :class="{ active: form.userAgentPreset === p.value }"
            @click="selectPreset(p.value)"
          >
            <span class="chip-label">{{ p.label }}</span>
          </button>
          <button
            type="button"
            class="playlist-chip"
            :class="{ active: form.userAgentPreset === 'custom' }"
            @click="selectPreset('custom')"
          >
            <span class="chip-label">Custom…</span>
          </button>
        </div>
        <input v-if="form.userAgentPreset === 'custom'" type="text" id="m3uGlobalUserAgent"
          v-model="form.globalUserAgent" placeholder="e.g. MyPlayer/1.0"
          style="margin-top: 0.5rem">
        <small class="hint">Channels with their own User-Agent in the playlist take priority over this setting.</small>
      </div>
    </fieldset>

    <TmdbKeyField v-model="form.tmdbApiKey" v-model:language="form.tmdbLanguage" />

    <RefreshIntervalField v-model="form.refreshHours" />

    <fieldset>
      <legend>{{ t('Display', 'Affichage') }}</legend>
      <div class="form-group">
        <label for="m3uCatalogName">Catalog Name</label>
        <input type="text" id="m3uCatalogName" v-model="form.catalogName"
          placeholder="NexoTV-Enhanced">
        <small class="hint">Name shown in Stremio's channel list. Leave blank to use the default.</small>
      </div>
    </fieldset>

    <div class="form-actions">
      <button class="btn ghost" type="button" @click="handleSave">{{ t('Save configuration', 'Sauvegarder la configuration') }}</button>
      <button class="btn primary" type="button" @click="handleInstall">
        {{ t('Install Addon', 'Installer l\'addon') }}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M5 12h14M12 5l7 7-7 7"/>
        </svg>
      </button>
    </div>
  </form>
</template>

<script setup lang="ts">
import { reactive, ref, inject, onMounted } from 'vue'
import { usePublicPlaylists } from '../composables/usePublicPlaylists'
import { useDecodedToken } from '../composables/useDecodedToken'
import { useI18n } from '../composables/useI18n'
import CategorySelector, { type CategoryEntry } from './CategorySelector.vue'
import TmdbKeyField from './TmdbKeyField.vue'
import RefreshIntervalField from './RefreshIntervalField.vue'
import { useAuth } from '../composables/useAuth'
import { useSavedConfigs } from '../composables/useSavedConfigs'
import type { M3uConfig, CatalogMode, CatalogGroup } from '../types/config'

const oc = inject<any>('overlayControl')!
const { playlists } = usePublicPlaylists()
const { t } = useI18n()

const USER_AGENT_PRESETS = [
  { label: 'TiviMate',         value: 'TiviMate/4.7.0 (Android)' },
  { label: 'IPTV Smarters Pro', value: 'IPTV Smarters Pro' },
  { label: 'GSE Smart IPTV',   value: 'GSE/7.6 CFNetwork/1410.1 Darwin/22.6.0' },
  { label: 'VLC',              value: 'VLC/3.0.18 LibVLC/3.0.18' },
  { label: 'Kodi',             value: 'Kodi/21.0 (X11; Linux x86_64) App_Bitness/64 Version/21.0' },
]

const form = reactive({
  m3uUrl: '',
  enableEpg: false,
  epgMode: 'auto',
  customEpgUrl: '',
  epgOffsetHours: 0,
  reformatLogos: false,
  catalogName: '',
  tmdbApiKey: '',
  tmdbLanguage: 'fr-FR',
  refreshHours: null as number | null,
  userAgentPreset: '',
  globalUserAgent: '',
  selectedCategories: [] as string[],
  catalogMode: 'single' as CatalogMode,
  catalogGroups: [] as CatalogGroup[],
  discoverOnly: [] as string[],
})

// Category loading state
const categories = ref<CategoryEntry[]>([])
const categoriesLoaded = ref(false)
const loadingCats = ref(false)
const catsError = ref('')
let knownCategoryNames = new Set<string>()

async function fetchPlaylistText(url: string): Promise<string> {
  const mixed = window.location.protocol === 'https:' && /^http:\/\//i.test(url)
  if (!mixed) {
    try {
      oc.appendDetail(`→ (Browser) Fetching playlist: ${url}`)
      const res = await fetch(url, { method: 'GET' })
      if (res.ok) {
        const txt = await res.text()
        oc.appendDetail(`✔ (Browser) playlist ${txt.length.toLocaleString()} bytes`)
        return txt
      }
      oc.appendDetail(`⚠ Browser fetch HTTP ${res.status} → server fallback`)
    } catch (e: any) {
      oc.appendDetail(`⚠ Browser fetch failed (${e.message}) → server fallback`)
    }
  }
  oc.appendDetail(`→ (Server) Prefetch playlist: ${url}`)
  const res = await fetch('/api/prefetch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, purpose: 'm3u_categories' })
  })
  if (res.status === 401) { useAuth().markUnauthenticated(); throw new Error('Session expired — please sign in again.') }
  let payload: any = {}
  try { payload = await res.json() } catch {}
  if (!res.ok || !payload.ok || !payload.content) {
    throw new Error(payload.error || `Server prefetch failed (HTTP ${res.status})`)
  }
  if (payload.truncated) {
    throw new Error('Playlist truncated by server (increase PREFETCH_MAX_BYTES).')
  }
  oc.appendDetail(`✔ (Server) playlist ${payload.bytes.toLocaleString()} bytes`)
  return payload.content
}

type CategoryType = 'tv' | 'movie' | 'series'

// Classify a stream URL by its Xtream-style path marker.
function typeFromUrl(url: string): CategoryType {
  const u = url.toLowerCase()
  if (u.includes('/series/')) return 'series'
  if (u.includes('/movie/')) return 'movie'
  return 'tv'
}

interface GroupTally { count: number; tv: number; movie: number; series: number }

function dominantType(t: GroupTally): CategoryType {
  if (t.series >= t.movie && t.series > t.tv) return 'series'
  if (t.movie >= t.series && t.movie > t.tv) return 'movie'
  return 'tv'
}

// Lightweight client-side group extraction (mirrors the backend M3U parser).
// Each group is typed TV/Movie/Series from its channels' stream URLs.
function categoriesFromM3U(text: string): CategoryEntry[] {
  const groups = new Map<string, GroupTally>()
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  let pending: string | null = null
  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue
    if (line.startsWith('#EXTINF')) {
      const m = /group-title="([^"]*)"/i.exec(line) || /group-title=([^\s,]+)/i.exec(line)
      pending = (m && m[1].trim()) ? m[1].trim() : 'Uncategorized'
      if (!groups.has(pending)) groups.set(pending, { count: 0, tv: 0, movie: 0, series: 0 })
    } else if (!line.startsWith('#') && pending) {
      const g = groups.get(pending)!
      g.count++
      g[typeFromUrl(line)]++
      pending = null
    }
  }
  const order: Record<CategoryType, number> = { tv: 0, movie: 1, series: 2 }
  return [...groups.entries()]
    .map(([name, t]) => ({ name, count: t.count, type: dominantType(t) }))
    .sort((a, b) => order[a.type] - order[b.type] || a.name.localeCompare(b.name))
}

async function loadCategories() {
  const url = form.m3uUrl.trim()
  if (!url) { catsError.value = 'Enter a playlist URL first.'; return }
  try { new URL(url) } catch { catsError.value = 'Enter a valid playlist URL first.'; return }

  catsError.value = ''
  loadingCats.value = true
  oc.showOverlay(true)
  oc.setProgress(10, 'Loading categories')
  oc.appendDetail('== LOAD CATEGORIES (M3U) ==')
  try {
    const text = await fetchPlaylistText(url)
    const cats = categoriesFromM3U(text)
    if (cats.length === 0) throw new Error('No categories found in this playlist.')
    categories.value = cats
    knownCategoryNames = new Set(cats.map(c => c.name))
    categoriesLoaded.value = true
    const total = cats.reduce((n, c) => n + (c.count || 0), 0)
    oc.appendDetail(`✔ ${cats.length} categories across ${total} channels`)
    oc.setProgress(100, 'Categories loaded')
    oc.hideOverlay()
  } catch (e: any) {
    catsError.value = e.message || String(e)
    oc.appendDetail('✖ ' + catsError.value)
    oc.markError()
  } finally {
    loadingCats.value = false
  }
}

function selectPreset(value: string) {
  if (form.userAgentPreset === value) {
    // toggle off
    form.userAgentPreset = ''
    form.globalUserAgent = ''
    return
  }
  form.userAgentPreset = value
  form.globalUserAgent = value !== 'custom' ? value : ''
}

onMounted(() => {
  const { decodedConfig } = useDecodedToken()
  if (!decodedConfig || decodedConfig.provider !== 'm3u') return
  const d = decodedConfig as M3uConfig
  form.m3uUrl = d.m3uUrl || ''
  form.enableEpg = !!d.enableEpg
  if (d.epgUrl) {
    form.epgMode = 'custom'
    form.customEpgUrl = d.epgUrl
  }
  form.epgOffsetHours = d.epgOffsetHours ?? 0
  form.reformatLogos = !!d.reformatLogos
  form.catalogName = (decodedConfig as any).catalogName || ''
  form.tmdbApiKey = (d as any).tmdbApiKey || ''
  form.refreshHours = (d as any).refreshHours ?? null
  form.tmdbLanguage = (d as any).tmdbLanguage || 'fr-FR'
  form.discoverOnly = Array.isArray((d as any).discoverOnly) ? [...(d as any).discoverOnly] : []
  form.catalogMode = d.catalogMode === 'split' ? 'split'
    : d.catalogMode === 'custom' ? 'custom' : 'single'
  if (Array.isArray(d.catalogGroups) && d.catalogGroups.length) {
    form.catalogGroups = d.catalogGroups.map(g => ({ name: g.name, categories: [...g.categories] }))
  }
  if (Array.isArray(d.selectedCategories) && d.selectedCategories.length) {
    form.selectedCategories = [...d.selectedCategories]
  }
  // Seed the selector with the saved categories so it renders without a reload.
  const seed = new Set<string>(d.selectedCategories || [])
  for (const g of (d.catalogGroups || [])) for (const c of g.categories) seed.add(c)
  if (seed.size) {
    const savedTypes = d.categoryTypes || {}
    categories.value = [...seed].sort().map(name => ({ name, type: savedTypes[name] || 'tv' }))
    knownCategoryNames = new Set(seed)
    categoriesLoaded.value = true
  }
  const savedUa = d.globalUserAgent || ''
  if (savedUa) {
    const match = USER_AGENT_PRESETS.find(p => p.value === savedUa)
    form.userAgentPreset = match ? match.value : 'custom'
    form.globalUserAgent = savedUa
  }
})

/** Assemble the persistable config from the current form (no network). */
function buildConfig(): (M3uConfig & { catalogName?: string }) | null {
  const m3uUrl = form.m3uUrl.trim()
  if (!m3uUrl) return null
  try { new URL(m3uUrl) } catch { return null }

  const enableEpg = form.enableEpg
  const customEpgUrl = form.epgMode === 'custom' ? form.customEpgUrl.trim() : ''
  const epgOffsetHours = form.epgOffsetHours || 0

  const config: M3uConfig & { catalogName?: string } = {
    provider: 'm3u',
    m3uUrl,
    enableEpg,
    reformatLogos: form.reformatLogos,
    ...(enableEpg && epgOffsetHours !== 0 ? { epgOffsetHours } : {}),
    ...(enableEpg && customEpgUrl ? { epgUrl: customEpgUrl } : {}),
    ...(form.catalogName.trim() ? { catalogName: form.catalogName.trim() } : {}),
    ...(form.globalUserAgent.trim() ? { globalUserAgent: form.globalUserAgent.trim() } : {}),
  }

  const keep = (c: string) => !knownCategoryNames.size || knownCategoryNames.has(c)
  const usedNames = new Set<string>()
  if (form.catalogMode === 'custom') {
    const groups = form.catalogGroups
      .map(g => ({ name: g.name.trim(), categories: g.categories.filter(keep) }))
      .filter(g => g.name && g.categories.length > 0)
    if (groups.length > 0) {
      config.catalogMode = 'custom'
      config.catalogGroups = groups
      for (const g of groups) for (const c of g.categories) usedNames.add(c)
    }
  } else {
    const selected = form.selectedCategories.filter(keep)
    if (selected.length > 0) {
      config.selectedCategories = selected
      config.catalogMode = form.catalogMode
      for (const c of selected) usedNames.add(c)
    }
  }
  if (usedNames.size > 0) {
    const typeByName = new Map(categories.value.map(c => [c.name, c.type]))
    const categoryTypes: Record<string, 'tv' | 'movie' | 'series'> = {}
    for (const name of usedNames) {
      if (typeByName.get(name) === 'movie') categoryTypes[name] = 'movie'
    }
    if (Object.keys(categoryTypes).length > 0) config.categoryTypes = categoryTypes
  }
  if (form.tmdbApiKey.trim()) { config.tmdbApiKey = form.tmdbApiKey.trim(); config.tmdbLanguage = form.tmdbLanguage }
  if (form.refreshHours) config.refreshHours = form.refreshHours
  if (form.discoverOnly.length) config.discoverOnly = [...form.discoverOnly]
  return config
}

async function handleSave() {
  const config = buildConfig()
  if (!config) { alert('Enter a valid playlist URL before saving.'); return }
  const name = prompt('Name this configuration:', form.catalogName.trim() || 'M3U')
  if (!name) return
  try {
    await useSavedConfigs().save(name.trim(), config)
    alert('Configuration saved.')
  } catch (e: any) {
    alert('Save failed: ' + (e.message || e))
  }
}

async function handleInstall() {
  const m3uUrl = form.m3uUrl.trim()
  if (!m3uUrl) { alert('Please enter a playlist URL.'); return }
  try { new URL(m3uUrl) } catch {
    alert('Please enter a valid URL (must start with http:// or https://).')
    return
  }

  const enableEpg = form.enableEpg
  const customEpgUrl = form.epgMode === 'custom' ? form.customEpgUrl.trim() : ''
  const epgOffsetHours = form.epgOffsetHours || 0

  const config: M3uConfig & { catalogName?: string } = {
    provider: 'm3u',
    m3uUrl,
    enableEpg,
    reformatLogos: form.reformatLogos,
    ...(enableEpg && epgOffsetHours !== 0 ? { epgOffsetHours } : {}),
    ...(enableEpg && customEpgUrl ? { epgUrl: customEpgUrl } : {}),
    ...(form.catalogName.trim() ? { catalogName: form.catalogName.trim() } : {}),
    ...(form.globalUserAgent.trim() ? { globalUserAgent: form.globalUserAgent.trim() } : {}),
  }

  // Keep only categories still present in the playlist (when a scan was done).
  const keep = (c: string) => !knownCategoryNames.size || knownCategoryNames.has(c)
  const usedNames = new Set<string>()
  if (form.catalogMode === 'custom') {
    const groups = form.catalogGroups
      .map(g => ({ name: g.name.trim(), categories: g.categories.filter(keep) }))
      .filter(g => g.name && g.categories.length > 0)
    if (groups.length > 0) {
      config.catalogMode = 'custom'
      config.catalogGroups = groups
      for (const g of groups) for (const c of g.categories) usedNames.add(c)
    }
  } else {
    const selected = form.selectedCategories.filter(keep)
    if (selected.length > 0) {
      config.selectedCategories = selected
      config.catalogMode = form.catalogMode
      for (const c of selected) usedNames.add(c)
    }
  }

  // M3U parity: expose Movie categories as real 'movie' catalogs (each entry
  // plays directly). Series stay flat under 'tv' — an M3U has no episode tree.
  if (usedNames.size > 0) {
    const typeByName = new Map(categories.value.map(c => [c.name, c.type]))
    const categoryTypes: Record<string, 'tv' | 'movie' | 'series'> = {}
    for (const name of usedNames) {
      if (typeByName.get(name) === 'movie') categoryTypes[name] = 'movie'
    }
    if (Object.keys(categoryTypes).length > 0) config.categoryTypes = categoryTypes
  }
  if (form.tmdbApiKey.trim()) { config.tmdbApiKey = form.tmdbApiKey.trim(); config.tmdbLanguage = form.tmdbLanguage }
  if (form.refreshHours) config.refreshHours = form.refreshHours
  if (form.discoverOnly.length) config.discoverOnly = [...form.discoverOnly]

  oc.showOverlay(false)
  oc.setProgress(5, 'Building M3U addon…')

  try {
    const { manifestUrl, stremioUrl } = await oc.buildUrls(config)
    oc.startPolling(manifestUrl, stremioUrl, 10)
  } catch (e: any) {
    oc.hideOverlay()
    alert('Error generating addon URL: ' + e.message)
  }
}
</script>
