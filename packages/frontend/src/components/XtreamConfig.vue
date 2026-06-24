<template>
  <form class="config-form" autocomplete="off" @submit.prevent="handleSubmit">
    <fieldset>
      <legend>Credentials</legend>
      <div class="form-group">
        <label for="xtreamUrl">Base URL <span class="req">*</span></label>
        <input type="url" id="xtreamUrl" v-model="form.xtreamUrl" required
          placeholder="http://panel.example.com:8080">
        <small class="hint">Do not include a trailing slash.</small>
      </div>
      <div class="form-group">
        <label for="xtreamUsername">Username <span class="req">*</span></label>
        <input type="text" id="xtreamUsername" v-model="form.xtreamUsername" required>
      </div>
      <div class="form-group password-group">
        <label for="xtreamPassword">Password <span class="req">*</span></label>
        <div class="pwd-wrapper">
          <input :type="showPwd ? 'text' : 'password'" id="xtreamPassword" v-model="form.xtreamPassword" required>
          <button type="button" class="btn tiny ghost" @click="showPwd = !showPwd">{{ showPwd ? 'Hide' : 'Show' }}</button>
        </div>
      </div>
    </fieldset>

    <fieldset>
      <legend>Categories</legend>
      <div class="info-banner">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <path d="M12 16v-4M12 8h.01"></path>
        </svg>
        <span>
          Load the categories from your panel, then pick the ones you want. Leave it untouched
          to include <strong>all</strong> categories in a single catalog.
        </span>
      </div>

      <div class="form-group">
        <button type="button" class="btn ghost" :disabled="loadingCats" @click="loadCategories">
          {{ loadingCats ? 'Loading…' : (categoriesLoaded ? 'Reload categories' : 'Load categories') }}
        </button>
        <small v-if="catsError" class="hint warn">{{ catsError }}</small>
      </div>

      <CategorySelector
        v-if="categoriesLoaded"
        v-model="form.selectedCategories"
        v-model:mode="form.catalogMode"
        v-model:groups="form.catalogGroups"
        :categories="categories"
        modeName="xtreamCatalogMode"
      />
    </fieldset>

    <fieldset>
      <legend>EPG Options</legend>
      <div class="form-group checkbox-line">
        <input type="checkbox" id="enableEpg" v-model="form.enableEpg">
        <label class="checkbox-label" for="enableEpg">Enable EPG</label>
      </div>

      <div v-if="form.enableEpg" class="form-group">
        <label class="group-label">EPG Source Mode</label>
        <div class="radio-group">
          <label class="checkbox-line">
            <input type="radio" name="epgMode" value="xtream" v-model="form.epgMode">
            <span class="checkbox-label">Panel XMLTV</span>
          </label>
          <label class="checkbox-line">
            <input type="radio" name="epgMode" value="custom" v-model="form.epgMode">
            <span class="checkbox-label">Custom EPG URL</span>
          </label>
        </div>
      </div>

      <div v-if="form.enableEpg && form.epgMode === 'custom'" class="form-group">
        <label for="customEpgUrl">Custom EPG XML URL</label>
        <input type="url" id="customEpgUrl" v-model="form.customEpgUrl"
          placeholder="https://example.com/epg.xml">
        <small class="hint">Used instead of panel xmltv.php when selected.</small>
      </div>

      <div class="form-group">
        <label for="epgOffsetHours">EPG Offset (hours)</label>
        <input type="number" step="0.25" id="epgOffsetHours" v-model.number="form.epgOffsetHours"
          placeholder="0">
      </div>

      <div class="form-group checkbox-line">
        <input type="checkbox" id="reformatLogos" v-model="form.reformatLogos">
        <label class="checkbox-label" for="reformatLogos">Reformat Logos
          <span class="hint">(may slow down loading)</span></label>
      </div>
    </fieldset>

    <fieldset>
      <legend>Display</legend>
      <div class="form-group">
        <label for="catalogName">Catalog Name</label>
        <input type="text" id="catalogName" v-model="form.catalogName"
          :placeholder="addonName">
        <small class="hint">Name shown in Stremio's channel list. Leave blank to use the default.</small>
      </div>
    </fieldset>

    <div class="form-actions">
      <button type="submit" class="btn primary">
        Install Addon
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
import { useDecodedToken } from '../composables/useDecodedToken'
import { useAddonInfo } from '../composables/useAddonInfo'
import CategorySelector, { type CategoryEntry } from './CategorySelector.vue'
import type { XtreamConfig, CatalogMode, CatalogGroup } from '../types/config'

const oc = inject<any>('overlayControl')!
const { info: addonInfo } = useAddonInfo()
const addonName = addonInfo.value?.name ?? 'NexoTV-Enhanced'

const showPwd = ref(false)
let originalPassword = ''

const form = reactive({
  xtreamUrl: '',
  xtreamUsername: '',
  xtreamPassword: '',
  enableEpg: true,
  epgMode: 'xtream',
  customEpgUrl: '',
  epgOffsetHours: 0,
  reformatLogos: false,
  catalogName: '',
  selectedCategories: [] as string[],
  catalogMode: 'single' as CatalogMode,
  catalogGroups: [] as CatalogGroup[],
})

// Category loading state
const categories = ref<CategoryEntry[]>([])
const categoriesLoaded = ref(false)
const loadingCats = ref(false)
const catsError = ref('')
// Cached results to avoid re-fetching during install (keyed by creds).
let cachedLiveList: any[] | null = null
let cachedCategoryEntries: CategoryEntry[] | null = null
let cachedLiveKey = ''

onMounted(() => {
  const { decodedConfig } = useDecodedToken()
  if (!decodedConfig || decodedConfig.provider !== 'xtream') return
  const d = decodedConfig as XtreamConfig
  form.xtreamUrl = d.xtreamUrl || ''
  form.xtreamUsername = d.xtreamUsername || ''
  if (d.xtreamPassword) {
    form.xtreamPassword = '********'
    originalPassword = d.xtreamPassword
  }
  form.enableEpg = !!d.enableEpg
  if (d.epgUrl) {
    form.epgMode = 'custom'
    form.customEpgUrl = d.epgUrl
  }
  form.epgOffsetHours = d.epgOffsetHours ?? 0
  form.reformatLogos = !!d.reformatLogos
  form.catalogName = (decodedConfig as any).catalogName || ''
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
    categoriesLoaded.value = true
  }
})

function credsKey() {
  return `${normalizeUrl(form.xtreamUrl)}|${form.xtreamUsername.trim()}|${form.xtreamPassword}`
}

function apiBase(): string {
  const baseUrl = normalizeUrl(form.xtreamUrl)
  const username = form.xtreamUsername.trim()
  let password = form.xtreamPassword
  if (password === '********' && originalPassword) password = originalPassword
  return `${baseUrl}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`
}

async function fetchLiveList(): Promise<any[]> {
  const base = apiBase()
  let txt: string
  try {
    txt = await robustFetch(`${base}&action=get_live_streams`, 'live_streams', true)
  } catch {
    txt = await robustFetch(`${base}&action=get_live_streams`, 'live_streams', false)
  }
  let list: any[] = []
  try { list = JSON.parse(txt) } catch { throw new Error('Failed to parse live streams JSON') }
  if (!Array.isArray(list)) list = []
  return list
}

async function fetchCategories(action: string, label: string): Promise<any[]> {
  const base = apiBase()
  let txt: string
  try {
    txt = await robustFetch(`${base}&action=${action}`, label, true)
  } catch {
    try {
      txt = await robustFetch(`${base}&action=${action}`, label, false)
    } catch {
      return []
    }
  }
  try {
    const list = JSON.parse(txt)
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

function declaredNames(cats: any[]): string[] {
  return cats
    .map(c => (c && c.category_name ? String(c.category_name).trim() : ''))
    .filter(Boolean)
}

/**
 * Build the typed category list. Live category *names* come from
 * get_live_categories (live streams only carry category_id) and channel counts
 * are derived by mapping each stream's category_id to its name. VOD and series
 * categories are added with a type label only (informational — catalogs still
 * contain live TV).
 */
function buildCategoryEntries(
  liveCats: any[], vodCats: any[], seriesCats: any[], live: any[]
): CategoryEntry[] {
  const idToName = new Map<string, string>()
  for (const c of liveCats) {
    if (c && c.category_id != null && c.category_name) {
      idToName.set(String(c.category_id), String(c.category_name).trim())
    }
  }
  const counts = new Map<string, number>()
  for (const l of live) {
    let name = ''
    if (l.category_id != null && idToName.has(String(l.category_id))) {
      name = idToName.get(String(l.category_id))!
    } else {
      name = (l.category_name || l.category || '').toString().trim()
    }
    if (!name) continue
    counts.set(name, (counts.get(name) || 0) + 1)
  }

  const tvNames = new Set<string>([...idToName.values(), ...counts.keys()].filter(Boolean))
  const order: Record<string, number> = { tv: 0, movie: 1, series: 2 }
  const entries: CategoryEntry[] = []
  for (const name of tvNames) entries.push({ name, count: counts.get(name) || 0, type: 'tv' })
  for (const name of new Set(declaredNames(vodCats))) entries.push({ name, type: 'movie' })
  for (const name of new Set(declaredNames(seriesCats))) entries.push({ name, type: 'series' })

  return entries.sort((a, b) =>
    order[a.type!] - order[b.type!] || a.name.localeCompare(b.name)
  )
}

/** Fetch + cache categories and the live list for the current credentials. */
async function loadCategoryEntries(): Promise<{ entries: CategoryEntry[]; live: any[] }> {
  if (cachedCategoryEntries && cachedLiveList && cachedLiveKey === credsKey()) {
    return { entries: cachedCategoryEntries, live: cachedLiveList }
  }
  const [liveCats, vodCats, seriesCats, live] = await Promise.all([
    fetchCategories('get_live_categories', 'live_categories'),
    fetchCategories('get_vod_categories', 'vod_categories'),
    fetchCategories('get_series_categories', 'series_categories'),
    fetchLiveList(),
  ])
  const entries = buildCategoryEntries(liveCats, vodCats, seriesCats, live)
  cachedCategoryEntries = entries
  cachedLiveList = live
  cachedLiveKey = credsKey()
  return { entries, live }
}

async function loadCategories() {
  const baseUrl = normalizeUrl(form.xtreamUrl)
  let password = form.xtreamPassword
  if (password === '********' && originalPassword) password = originalPassword
  if (!validateUrl(baseUrl)) { catsError.value = 'Enter a valid Base URL first.'; return }
  if (!form.xtreamUsername.trim() || !password) { catsError.value = 'Username / password required first.'; return }

  catsError.value = ''
  loadingCats.value = true
  oc.showOverlay(true)
  oc.setProgress(10, 'Loading categories')
  oc.appendDetail('== LOAD CATEGORIES (XTREAM) ==')
  try {
    const { entries, live } = await loadCategoryEntries()
    if (entries.length === 0) throw new Error('No categories found in this panel.')
    categories.value = entries
    categoriesLoaded.value = true
    const nTv = entries.filter(e => e.type === 'tv').length
    const nMovie = entries.filter(e => e.type === 'movie').length
    const nSeries = entries.filter(e => e.type === 'series').length
    oc.appendDetail(`✔ ${entries.length} categories (${nTv} TV, ${nMovie} Movies, ${nSeries} Series) · ${live.length} channels`)
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

function validateUrl(u: string) {
  try {
    const p = new URL(u)
    return p.protocol === 'http:' || p.protocol === 'https:'
  } catch { return false }
}

function normalizeUrl(raw: string) {
  let s = raw.trim()
  if (s.endsWith('/')) s = s.slice(0, -1)
  return s
}

async function fetchTextBrowser(url: string, label: string): Promise<string> {
  if (window.location.protocol === 'https:' && /^http:\/\//i.test(url)) {
    throw new Error('Mixed content blocked (forcing server prefetch fallback)')
  }
  oc.appendDetail(`→ (Browser) Fetching ${label}: ${url}`)
  const res = await fetch(url, { method: 'GET' })
  if (!res.ok) throw new Error(`${label} HTTP ${res.status}`)
  const txt = await res.text()
  oc.appendDetail(`✔ (Browser) ${label} ${txt.length.toLocaleString()} bytes`)
  return txt
}

async function fetchTextServer(url: string, purpose: string): Promise<string> {
  oc.appendDetail(`→ (Server) Prefetch ${purpose}: ${url}`)
  const res = await fetch('/api/prefetch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, purpose })
  })
  let payload: any = {}
  try { payload = await res.json() } catch {}
  if (!res.ok) {
    const msg = payload.error || `HTTP ${res.status}`
    const detail = payload.detail ? ` (${payload.detail})` : ''
    throw new Error(`Server prefetch failed ${res.status} - ${msg}${detail}`)
  }
  if (!payload.ok || !payload.content) throw new Error('Server prefetch empty content')
  oc.appendDetail(`✔ (Server) ${purpose} ${payload.bytes.toLocaleString()} bytes${payload.truncated ? ' (truncated)' : ''}`)
  if (payload.truncated) {
    throw new Error('Prefetch truncated: increase server PREFETCH_MAX_BYTES or reduce dataset')
  }
  return payload.content
}

async function robustFetch(url: string, purpose: string, browserFirst = true): Promise<string> {
  const mixed = window.location.protocol === 'https:' && /^http:\/\//i.test(url)
  if (browserFirst && !mixed) {
    try { return await fetchTextBrowser(url, purpose) } catch (e: any) {
      oc.appendDetail(`⚠ Browser fetch failed (${e.message}) → server fallback`)
    }
  }
  return await fetchTextServer(url, purpose)
}

function quickEpgStats(xml: string) {
  const prog = xml.match(/<programme\s/gi)
  const ch = xml.match(/<channel\s/gi)
  return { programmes: prog ? prog.length : 0, channels: ch ? ch.length : 0 }
}

function uuid() {
  return crypto?.randomUUID?.() ?? 'id-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

async function sha256Fragment(str: string): Promise<string> {
  try {
    const enc = new TextEncoder().encode(str)
    const digest = await crypto.subtle.digest('SHA-256', enc)
    const hex = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('')
    return hex.slice(0, 10) + '…'
  } catch { return '(hash-unavailable)' }
}

async function handleSubmit() {
  const baseUrl = normalizeUrl(form.xtreamUrl)
  const username = form.xtreamUsername.trim()
  let password = form.xtreamPassword
  const enableEpgInitial = form.enableEpg
  const epgMode = enableEpgInitial ? form.epgMode : 'disabled'
  const customEpg = epgMode === 'custom' ? form.customEpgUrl.trim() : ''
  const epgOffset = isFinite(form.epgOffsetHours) ? form.epgOffsetHours : 0

  if (!validateUrl(baseUrl)) { alert('Invalid Xtream base URL'); return }
  if (!username || !password) { alert('Username / password required'); return }
  if (password === '********' && originalPassword) password = originalPassword
  if (epgMode === 'custom' && enableEpgInitial) {
    if (!customEpg) { alert('Custom EPG URL is empty'); return }
    if (!validateUrl(customEpg)) { alert('Invalid Custom EPG URL'); return }
  }

  oc.showOverlay(true)
  oc.setProgress(5, 'Starting')
  oc.appendDetail('== PRE-FLIGHT (XTREAM) ==')
  oc.appendDetail(`Base URL: ${baseUrl}`)
  oc.appendDetail('Mode: JSON API')
  oc.appendDetail(`EPG Mode: ${enableEpgInitial ? (epgMode === 'custom' ? 'Custom URL' : 'Panel XMLTV') : 'Disabled'}`)

  try {
    const caps = await fetch('/api/capabilities').then(r => r.json()).catch(() => ({}))
    if (!caps.encryptionEnabled) {
      oc.appendDetail('⚠ WARNING: Server has no CONFIG_SECRET set. Your Xtream password is base64-encoded (not encrypted) in the manifest URL. Do not share this link publicly.')
    }
  } catch {}

  let enableEpgFinal = enableEpgInitial
  try {
    let epgStats = { programmes: 0, channels: 0 }

    oc.setProgress(12, 'Fetching Live Streams')
    // Categories come from get_live_categories (mapped by id); the live list
    // gives the channel count. loadCategoryEntries() caches both.
    const { entries: categoryEntries, live: liveList } = await loadCategoryEntries()
    const categorySet = new Set(categoryEntries.map(e => e.name))
    const liveCount = Array.isArray(liveList) ? liveList.length : 0
    oc.appendDetail(`✔ Live streams: ${liveCount.toLocaleString()} · ${categorySet.size} categories`)

    if (enableEpgInitial) {
      const epgSourceUrl = epgMode === 'custom'
        ? customEpg
        : `${baseUrl}/xmltv.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`

      oc.setProgress(44, 'Fetching EPG')
      let epgTxt: string | null = null
      try {
        try {
          epgTxt = await robustFetch(epgSourceUrl, 'epg', true)
        } catch (firstEpgErr: any) {
          oc.appendDetail(`⚠ EPG browser fetch failed: ${firstEpgErr.message} → server fallback`)
          epgTxt = await robustFetch(epgSourceUrl, 'epg', false)
        }
      } catch (finalEpgErr: any) {
        oc.appendDetail(`✖ EPG fetch failed after both attempts (${finalEpgErr.message}) – continuing WITHOUT EPG`)
        enableEpgFinal = false
      }

      if (enableEpgFinal && epgTxt) {
        oc.setProgress(52, 'Scanning EPG')
        epgStats = quickEpgStats(epgTxt)
        oc.appendDetail(`✔ EPG scan: ${epgStats.programmes.toLocaleString()} programmes / ${epgStats.channels.toLocaleString()} channels`)
      }
    } else {
      oc.appendDetail('EPG disabled by user.')
    }

    oc.setProgress(60, 'Building token')
    const config: XtreamConfig = {
      provider: 'xtream',
      xtreamUrl: baseUrl,
      xtreamUsername: username,
      xtreamPassword: password,
      enableEpg: enableEpgFinal,
      reformatLogos: form.reformatLogos,
    }

    if (enableEpgFinal && epgMode === 'custom' && customEpg) config.epgUrl = customEpg
    if (isFinite(epgOffset) && epgOffset !== 0) config.epgOffsetHours = epgOffset

    // Use the user's selection as-is. We intentionally do NOT filter against a
    // freshly fetched category list: a transient fetch hiccup (e.g. get_vod_categories
    // failing once) must never silently drop a whole group the user configured.
    const usedNames = new Set<string>()
    if (form.catalogMode === 'custom') {
      const groups = form.catalogGroups
        .map(g => ({ name: g.name.trim(), categories: [...g.categories] }))
        .filter(g => g.name && g.categories.length > 0)
      if (groups.length > 0) {
        config.catalogMode = 'custom'
        config.catalogGroups = groups
        for (const g of groups) for (const c of g.categories) usedNames.add(c)
      }
    } else {
      const selected = [...form.selectedCategories]
      if (selected.length > 0) {
        config.selectedCategories = selected
        config.catalogMode = form.catalogMode
        for (const c of selected) usedNames.add(c)
      }
    }

    // Carry the media type of each used category so the addon knows what to
    // fetch (VOD / series) and which Stremio catalog type to expose.
    if (usedNames.size > 0) {
      const typeByName = new Map(categories.value.map(c => [c.name, c.type || 'tv']))
      const categoryTypes: Record<string, 'tv' | 'movie' | 'series'> = {}
      for (const name of usedNames) categoryTypes[name] = (typeByName.get(name) as any) || 'tv'
      config.categoryTypes = categoryTypes
    }

    config.prescan = {
      liveCount,
      categoryCount: categorySet.size,
      epgProgrammes: enableEpgFinal ? epgStats.programmes : 0,
      epgChannels: enableEpgFinal ? epgStats.channels : 0,
      mode: 'json',
      epgSource: enableEpgFinal ? (epgMode === 'custom' ? 'custom' : 'xtream') : 'disabled'
    }
    config.instanceId = uuid()
    if (form.catalogName.trim()) (config as any).catalogName = form.catalogName.trim()

    const passHash = await sha256Fragment(password)
    oc.appendDetail(`Password hash fragment: ${passHash}`)

    const { manifestUrl, stremioUrl } = await oc.buildUrls(config)
    oc.appendDetail('✔ Token built')
    oc.appendDetail('Manifest URL: ' + manifestUrl)
    oc.appendDetail('Stremio URL: ' + stremioUrl)

    oc.setProgress(70, 'Waiting for manifest')
    oc.appendDetail('== SERVER BUILD PHASE ==')
    oc.appendDetail('Polling server…')
    oc.startPolling(manifestUrl, stremioUrl, 70)

  } catch (err: any) {
    oc.setProgress(100, 'Pre-flight failed')
    oc.appendDetail('✖ Error: ' + (err.message || String(err)))
    oc.appendDetail('Close overlay and adjust inputs to retry.')
    oc.markError()
  }
}
</script>
