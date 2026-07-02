<template>
  <form class="config-form" autocomplete="off" @submit.prevent="handleInstall">
    <div class="info-banner">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4M12 8h.01"></path>
      </svg>
      <span>
        {{ t('Add several sources (Xtream / M3U) mixed into the same catalogs.', 'Ajoute plusieurs sources (Xtream / M3U) mixées dans les mêmes catalogues.') }}
        <strong>{{ t('Movies & Series', 'Films & Séries') }}</strong>
        {{ t('with the same title are de-duplicated (one item, one stream per source). TV channels stay listed per source.', 'de même titre sont dédupliqués (un seul élément, un flux par source). Les chaînes TV restent listées par source.') }}
      </span>
    </div>

    <fieldset v-for="(s, si) in sources" :key="s.id" class="source-card">
      <legend>{{ t('Source', 'Source') }} {{ si + 1 }}</legend>
      <div class="src-head">
        <input class="src-name" type="text" v-model="s.name" :placeholder="t('Name (e.g. IPTV1)', 'Nom (ex. IPTV1)')">
        <select v-model="s.provider" class="src-provider">
          <option value="xtream">Xtream</option>
          <option value="m3u">M3U</option>
          <option value="stalker">Stalker</option>
        </select>
        <button type="button" class="btn tiny ghost danger" @click="removeSource(si)">{{ t('Remove', 'Retirer') }}</button>
      </div>

      <template v-if="s.provider === 'xtream'">
        <div class="form-group"><label>Base URL</label>
          <input type="url" v-model="s.xtreamUrl" placeholder="http://panel:8080"></div>
        <div class="form-group"><label>{{ t('Username', 'Identifiant') }}</label><input type="text" v-model="s.xtreamUsername"></div>
        <div class="form-group"><label>{{ t('Password', 'Mot de passe') }}</label><input type="password" v-model="s.xtreamPassword"></div>
      </template>
      <template v-else-if="s.provider === 'm3u'">
        <div class="form-group"><label>{{ t('Playlist URL', 'URL de la playlist') }}</label>
          <input type="url" v-model="s.m3uUrl" placeholder="http://provider/get.php?...type=m3u_plus"></div>
      </template>
      <template v-else>
        <div class="form-group"><label>{{ t('Portal URL', 'URL du portail') }}</label>
          <input type="url" v-model="s.stalkerUrl" placeholder="http://portal.example.com"></div>
        <div class="form-group"><label>{{ t('MAC address', 'Adresse MAC') }}</label>
          <input type="text" v-model="s.stalkerMac" placeholder="00:1A:79:XX:XX:XX"></div>
      </template>

      <div class="form-group">
        <button type="button" class="btn ghost" :disabled="s.loading" @click="loadSource(s)">
          {{ s.loading ? t('Loading…', 'Chargement…') : (s.loaded ? t('Reload categories', 'Recharger les catégories') : t('Load categories', 'Charger les catégories')) }}
        </button>
        <small v-if="s.error" class="hint warn">{{ s.error }}</small>
      </div>

      <div v-if="s.loaded" class="src-picker">
        <div class="cat-toolbar">
          <input type="text" class="cat-filter" v-model="s.filter" :placeholder="t('Filter…', 'Filtrer…')">
          <span class="cat-count">{{ s.selected.length }} / {{ s.categories.length }}</span>
        </div>
        <div class="cat-actions">
          <button type="button" class="btn tiny ghost" @click="selectAll(s)">{{ t('All', 'Tout') }}</button>
          <button type="button" class="btn tiny ghost" @click="s.selected = []">{{ t('None', 'Aucun') }}</button>
        </div>
        <div class="cat-list">
          <label v-for="c in filteredCats(s)" :key="c.type + '::' + c.name" class="cat-item"
            :class="{ checked: s.selected.includes(c.name) }">
            <input type="checkbox" :checked="s.selected.includes(c.name)" @change="toggle(s, c.name)">
            <span v-if="c.type" class="type-badge" :class="'t-' + c.type">{{ typeLabel(c.type) }}</span>
            <span class="cat-name" :title="c.name">{{ c.name }}</span>
            <span v-if="c.count != null" class="cat-badge">{{ c.count }}</span>
          </label>
        </div>
      </div>
    </fieldset>

    <button type="button" class="btn ghost add-src" @click="addSource">+ {{ t('Add a source', 'Ajouter une source') }}</button>

    <fieldset v-if="mergedCategories.length">
      <legend>{{ t('Catalogs', 'Catalogues') }}</legend>
      <p class="hint">{{ t('Built from the merged categories of all sources.', 'Construits à partir des catégories fusionnées de toutes les sources.') }}</p>
      <CategorySelector
        v-model="globalSelected"
        v-model:mode="catalogMode"
        v-model:groups="catalogGroups"
        v-model:discoverOnly="discoverOnly"
        :categories="mergedCategories"
        modeName="multiCatalogMode"
      />
    </fieldset>

    <fieldset>
      <legend>{{ t('Playback', 'Lecture') }}</legend>
      <div class="form-group">
        <label class="group-label">{{ t('When playing a title', 'Lecture d\'un contenu') }}</label>
        <div class="radio-group">
          <label class="checkbox-line">
            <input type="radio" name="multiStream" value="choose" v-model="streamSelection">
            <span class="checkbox-label"><strong>{{ t('Offer the choice', 'Proposer le choix') }}</strong> — {{ t('one stream per source (IPTV1, IPTV2…).', 'un flux par source (IPTV1, IPTV2…).') }}</span>
          </label>
          <label class="checkbox-line">
            <input type="radio" name="multiStream" value="auto" v-model="streamSelection">
            <span class="checkbox-label"><strong>{{ t('Play the first available', 'Lire le 1er dispo') }}</strong> — {{ t('stream from the priority source.', 'flux de la source prioritaire.') }}</span>
          </label>
        </div>
      </div>
      <div class="form-group">
        <label for="multiCatalogName">{{ t('Catalog Name', 'Nom du catalogue') }}</label>
        <input type="text" id="multiCatalogName" v-model="catalogName" placeholder="NexoTV-Enhanced">
      </div>
    </fieldset>

    <TmdbKeyField v-model="tmdbApiKey" v-model:language="tmdbLanguage" />

    <RefreshIntervalField v-model="refreshHours" />

    <div class="form-actions">
      <button v-if="auth.state.enabled" type="button" class="btn ghost" @click="handleSave">{{ t('Save configuration', 'Sauvegarder la configuration') }}</button>
      <button type="submit" class="btn primary">{{ t('Install Addon', 'Installer l\'addon') }}</button>
    </div>
  </form>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, inject, onMounted } from 'vue'
import { useDecodedToken } from '../composables/useDecodedToken'
import { useAuth } from '../composables/useAuth'
import { useSavedConfigs } from '../composables/useSavedConfigs'
import CategorySelector from './CategorySelector.vue'
import TmdbKeyField from './TmdbKeyField.vue'
import RefreshIntervalField from './RefreshIntervalField.vue'
import { useI18n } from '../composables/useI18n'
import type { CategoryType, CatalogMode, StreamSelection, MultiConfig, SourceConfig, CatalogGroup } from '../types/config'

const oc = inject<any>('overlayControl')!
const { t } = useI18n()
const auth = useAuth()

interface Entry { name: string; count?: number; type?: CategoryType }
interface SourceState {
  id: string; name: string; provider: 'xtream' | 'm3u' | 'stalker'
  xtreamUrl: string; xtreamUsername: string; xtreamPassword: string
  m3uUrl: string
  stalkerUrl: string; stalkerMac: string
  categories: Entry[]; selected: string[]
  loaded: boolean; loading: boolean; error: string; filter: string
}

let counter = 0
function blankSource(): SourceState {
  return {
    id: 's' + (++counter), name: '', provider: 'xtream',
    xtreamUrl: '', xtreamUsername: '', xtreamPassword: '', m3uUrl: '',
    stalkerUrl: '', stalkerMac: '',
    categories: [], selected: [], loaded: false, loading: false, error: '', filter: '',
  }
}

const sources = reactive<SourceState[]>([blankSource()])
const catalogMode = ref<CatalogMode>('single')
const streamSelection = ref<StreamSelection>('choose')
const catalogName = ref('')
const tmdbApiKey = ref('')
const tmdbLanguage = ref('fr-FR')
const refreshHours = ref<number | null>(null)
const globalSelected = ref<string[]>([])
const catalogGroups = ref<CatalogGroup[]>([])
const discoverOnly = ref<string[]>([])

// Merged category pool = union of every source's selected categories.
// Type priority on conflicts: movie/series win over tv.
const mergedCategories = computed<Entry[]>(() => {
  const byName = new Map<string, Entry>()
  for (const s of sources) {
    const typeByName = new Map(s.categories.map(c => [c.name, c.type || 'tv']))
    for (const name of s.selected) {
      const t = (typeByName.get(name) as CategoryType) || 'tv'
      const cur = byName.get(name)
      if (!cur) byName.set(name, { name, type: t })
      else if (cur.type === 'tv' && t !== 'tv') cur.type = t
    }
  }
  const order: Record<CategoryType, number> = { tv: 0, movie: 1, series: 2 }
  return [...byName.values()].sort((a, b) => order[a.type!] - order[b.type!] || a.name.localeCompare(b.name))
})

// Keep globalSelected in sync with the pool: add newly-selected categories,
// drop removed ones, preserve the user's manual deselections.
let knownMerged = new Set<string>()
watch(mergedCategories, (entries) => {
  const names = new Set(entries.map(e => e.name))
  globalSelected.value = globalSelected.value.filter(n => names.has(n))
  for (const e of entries) if (!knownMerged.has(e.name)) globalSelected.value.push(e.name)
  knownMerged = names
}, { deep: false })

function addSource() { sources.push(blankSource()) }
function removeSource(i: number) { sources.splice(i, 1) }
function typeLabel(t?: CategoryType) { return t === 'movie' ? 'Movie' : t === 'series' ? 'Series' : 'TV' }
function filteredCats(s: SourceState) {
  const q = s.filter.trim().toLowerCase()
  return q ? s.categories.filter(c => c.name.toLowerCase().includes(q)) : s.categories
}
function toggle(s: SourceState, name: string) {
  const i = s.selected.indexOf(name)
  if (i >= 0) s.selected.splice(i, 1); else s.selected.push(name)
}
function selectAll(s: SourceState) {
  const set = new Set(s.selected)
  for (const c of filteredCats(s)) set.add(c.name)
  s.selected = [...set]
}

async function prefetch(url: string): Promise<string> {
  const r = await fetch('/api/prefetch', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, purpose: 'multi' }),
  })
  if (r.status === 401) { useAuth().markUnauthenticated(); throw new Error('Session expirée — reconnecte-toi.') }
  const p = await r.json().catch(() => ({}))
  if (!r.ok || !p.ok || !p.content) throw new Error(p.error || `HTTP ${r.status}`)
  return p.content
}

function xtreamBase(s: SourceState) {
  return `${s.xtreamUrl.replace(/\/$/, '')}/player_api.php?username=${encodeURIComponent(s.xtreamUsername)}&password=${encodeURIComponent(s.xtreamPassword)}`
}

function catMap(arr: any): Record<string, string> {
  const m: Record<string, string> = {}
  if (Array.isArray(arr)) for (const c of arr) if (c?.category_id != null && c.category_name) m[String(c.category_id)] = String(c.category_name)
  return m
}

async function loadXtream(s: SourceState): Promise<Entry[]> {
  const base = xtreamBase(s)
  const [live, liveCats, vodCats, serCats] = await Promise.all([
    prefetch(`${base}&action=get_live_streams`).then(JSON.parse).catch(() => []),
    prefetch(`${base}&action=get_live_categories`).then(JSON.parse).catch(() => []),
    prefetch(`${base}&action=get_vod_categories`).then(JSON.parse).catch(() => []),
    prefetch(`${base}&action=get_series_categories`).then(JSON.parse).catch(() => []),
  ])
  const idToName = catMap(liveCats)
  const counts = new Map<string, number>()
  for (const l of Array.isArray(live) ? live : []) {
    const name = idToName[String(l.category_id)] || l.category_name || ''
    if (name) counts.set(name.trim(), (counts.get(name.trim()) || 0) + 1)
  }
  const order: Record<CategoryType, number> = { tv: 0, movie: 1, series: 2 }
  const entries: Entry[] = []
  for (const name of new Set([...Object.values(idToName).map(n => n.trim()), ...counts.keys()])) {
    if (name) entries.push({ name, count: counts.get(name) || 0, type: 'tv' })
  }
  for (const c of Array.isArray(vodCats) ? vodCats : []) if (c?.category_name) entries.push({ name: String(c.category_name).trim(), type: 'movie' })
  for (const c of Array.isArray(serCats) ? serCats : []) if (c?.category_name) entries.push({ name: String(c.category_name).trim(), type: 'series' })
  return entries.sort((a, b) => order[a.type!] - order[b.type!] || a.name.localeCompare(b.name))
}

async function loadM3u(s: SourceState): Promise<Entry[]> {
  const text = await prefetch(s.m3uUrl.trim())
  const groups = new Map<string, { count: number; movie: number; other: number }>()
  let pending: string | null = null
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim()
    if (!line) continue
    if (line.startsWith('#EXTINF')) {
      const m = /group-title="([^"]*)"/i.exec(line) || /group-title=([^\s,]+)/i.exec(line)
      pending = (m && m[1].trim()) ? m[1].trim() : 'Uncategorized'
      if (!groups.has(pending)) groups.set(pending, { count: 0, movie: 0, other: 0 })
    } else if (!line.startsWith('#') && pending) {
      const g = groups.get(pending)!; g.count++
      if (/\/movie\//i.test(line)) g.movie++; else g.other++
      pending = null
    }
  }
  return [...groups.entries()]
    .map(([name, t]) => ({ name, count: t.count, type: (t.movie > t.other ? 'movie' : 'tv') as CategoryType }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

async function loadStalker(s: SourceState): Promise<Entry[]> {
  const r = await fetch('/api/stalker/categories', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: s.stalkerUrl.trim(), mac: s.stalkerMac.trim() }),
  })
  if (r.status === 401) { useAuth().markUnauthenticated(); throw new Error(t('Session expired — sign in again.', 'Session expirée — reconnecte-toi.')) }
  const p = await r.json().catch(() => ({}))
  if (!r.ok || !Array.isArray(p.categories)) throw new Error(p.error || `HTTP ${r.status}`)
  return p.categories
}

async function loadSource(s: SourceState) {
  s.error = ''
  if (s.provider === 'xtream' && (!s.xtreamUrl || !s.xtreamUsername || !s.xtreamPassword)) { s.error = t('URL / credentials required.', 'URL / identifiants requis.'); return }
  if (s.provider === 'm3u' && !s.m3uUrl) { s.error = t('Playlist URL required.', 'URL de playlist requise.'); return }
  if (s.provider === 'stalker' && (!s.stalkerUrl || !s.stalkerMac)) { s.error = t('Portal URL and MAC required.', 'URL du portail et MAC requis.'); return }
  s.loading = true
  oc.showOverlay(true); oc.setProgress(10, 'Loading categories'); oc.appendDetail(`== ${s.name || s.id} ==`)
  try {
    const entries = s.provider === 'xtream' ? await loadXtream(s)
      : s.provider === 'm3u' ? await loadM3u(s)
        : await loadStalker(s)
    if (!entries.length) throw new Error(t('No category found.', 'Aucune catégorie trouvée.'))
    s.categories = entries; s.loaded = true
    oc.appendDetail(`✔ ${entries.length} catégories`); oc.setProgress(100, 'OK'); oc.hideOverlay()
  } catch (e: any) { s.error = e.message || String(e); oc.appendDetail('✖ ' + s.error); oc.markError() }
  finally { s.loading = false }
}

function buildConfig(): (MultiConfig & { catalogName?: string }) | null {
  const out: SourceConfig[] = []
  const mergedSel = new Set<string>()
  const mergedTypes: Record<string, CategoryType> = {}
  for (const s of sources) {
    if (!s.selected.length) continue
    const typeByName = new Map(s.categories.map(c => [c.name, c.type || 'tv']))
    const categoryTypes: Record<string, CategoryType> = {}
    for (const name of s.selected) {
      const t = (typeByName.get(name) as CategoryType) || 'tv'
      categoryTypes[name] = t
      mergedSel.add(name)
      // merged type priority: movie/series win over tv on conflicts
      if (!mergedTypes[name] || mergedTypes[name] === 'tv') mergedTypes[name] = t
    }
    const src: SourceConfig = {
      id: s.id, name: (s.name || s.id).trim(), provider: s.provider,
      selectedCategories: [...s.selected], categoryTypes,
    }
    if (s.provider === 'xtream') {
      src.xtreamUrl = s.xtreamUrl.replace(/\/$/, ''); src.xtreamUsername = s.xtreamUsername.trim(); src.xtreamPassword = s.xtreamPassword
    } else if (s.provider === 'm3u') {
      src.m3uUrl = s.m3uUrl.trim()
    } else {
      src.stalkerUrl = s.stalkerUrl.trim(); src.stalkerMac = s.stalkerMac.trim()
    }
    out.push(src)
  }
  if (!out.length) return null

  // Top-level catalog layout operates on the merged category pool.
  const poolNames = new Set(mergedCategories.value.map(e => e.name))
  const cfg: MultiConfig & { catalogName?: string } = {
    provider: 'multi',
    sources: out,
    catalogMode: catalogMode.value,
    selectedCategories: [...mergedSel],
    categoryTypes: mergedTypes,
    streamSelection: streamSelection.value,
    reformatLogos: true,
    ...(catalogName.value.trim() ? { catalogName: catalogName.value.trim() } : {}),
    ...(tmdbApiKey.value.trim() ? { tmdbApiKey: tmdbApiKey.value.trim(), tmdbLanguage: tmdbLanguage.value } : {}),
    ...(refreshHours.value ? { refreshHours: refreshHours.value } : {}),
    ...(discoverOnly.value.length ? { discoverOnly: [...discoverOnly.value] } : {}),
  }

  if (catalogMode.value === 'custom') {
    const groups = catalogGroups.value
      .map(g => ({ name: g.name.trim(), categories: g.categories.filter(c => poolNames.has(c)) }))
      .filter(g => g.name && g.categories.length > 0)
    cfg.catalogGroups = groups
  } else {
    // single / split: restrict to the user's global selection within the pool.
    const sel = globalSelected.value.filter(c => poolNames.has(c))
    cfg.selectedCategories = sel.length ? sel : [...mergedSel]
  }
  return cfg
}

async function handleInstall() {
  const config = buildConfig()
  if (!config) { alert(t('Add at least one source with selected categories.', 'Ajoute au moins une source avec des catégories sélectionnées.')); return }
  oc.showOverlay(false); oc.setProgress(5, 'Building…')
  try {
    const { manifestUrl, stremioUrl } = await oc.buildUrls(config)
    oc.startPolling(manifestUrl, stremioUrl, 10)
  } catch (e: any) { oc.hideOverlay(); alert(t('Error: ', 'Erreur : ') + e.message) }
}

async function handleSave() {
  const config = buildConfig()
  if (!config) { alert(t('Add at least one source with selected categories.', 'Ajoute au moins une source avec des catégories sélectionnées.')); return }
  const name = prompt(t('Name this configuration:', 'Nom de la configuration :'), catalogName.value.trim() || 'Multi-source')
  if (!name) return
  try { await useSavedConfigs().save(name.trim(), config as any); alert(t('Configuration saved.', 'Configuration sauvegardée.')) }
  catch (e: any) { alert(t('Save failed: ', 'Échec : ') + (e.message || e)) }
}

onMounted(() => {
  const { decodedConfig } = useDecodedToken()
  const d = decodedConfig as any
  if (!d || !Array.isArray(d.sources) || !d.sources.length) return
  sources.splice(0, sources.length)
  for (const sc of d.sources) {
    const st = blankSource()
    st.id = sc.id || st.id
    st.name = sc.name || ''
    st.provider = sc.provider === 'm3u' ? 'm3u' : sc.provider === 'stalker' ? 'stalker' : 'xtream'
    st.xtreamUrl = sc.xtreamUrl || ''
    st.xtreamUsername = sc.xtreamUsername || ''
    st.xtreamPassword = sc.xtreamPassword || ''
    st.m3uUrl = sc.m3uUrl || ''
    st.stalkerUrl = sc.stalkerUrl || ''
    st.stalkerMac = sc.stalkerMac || ''
    st.selected = Array.isArray(sc.selectedCategories) ? [...sc.selectedCategories] : []
    const types = sc.categoryTypes || {}
    if (st.selected.length) {
      st.categories = st.selected.map((n: string) => ({ name: n, type: types[n] || 'tv' }))
      st.loaded = true
    }
    sources.push(st)
  }
  catalogMode.value = d.catalogMode === 'split' ? 'split'
    : d.catalogMode === 'custom' ? 'custom' : 'single'
  if (Array.isArray(d.catalogGroups)) {
    catalogGroups.value = d.catalogGroups.map((g: any) => ({ name: g.name, categories: [...(g.categories || [])] }))
  }
  streamSelection.value = d.streamSelection === 'auto' ? 'auto' : 'choose'
  catalogName.value = d.catalogName || ''
  tmdbApiKey.value = d.tmdbApiKey || ''
  tmdbLanguage.value = d.tmdbLanguage || 'fr-FR'
  refreshHours.value = d.refreshHours ?? null
  if (Array.isArray(d.discoverOnly)) discoverOnly.value = [...d.discoverOnly]
})
</script>

<style scoped>
.source-card { border: 1px solid rgba(255,255,255,0.14); border-radius: 10px; }
.src-head { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; margin-bottom: 0.5rem; }
.src-name { flex: 1; min-width: 120px; }
.src-provider { padding: 0.4rem; }
.src-picker { margin-top: 0.5rem; }
.cat-toolbar { display: flex; gap: 0.6rem; align-items: center; margin-bottom: 0.4rem; }
.cat-filter { flex: 1; }
.cat-count { font-size: 0.8rem; opacity: 0.7; white-space: nowrap; }
.cat-actions { display: flex; gap: 0.4rem; margin-bottom: 0.4rem; }
.cat-list { max-height: 220px; overflow-y: auto; border: 1px solid rgba(255,255,255,0.12); border-radius: 8px; padding: 0.25rem; display: flex; flex-direction: column; gap: 2px; }
.cat-item { display: flex; align-items: center; gap: 0.6rem; padding: 0.35rem 0.5rem; border-radius: 6px; cursor: pointer; }
.cat-item:hover { background: rgba(255,255,255,0.06); }
.cat-item.checked { background: rgba(99,102,241,0.16); }
.cat-item input { margin: 0; }
.cat-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cat-badge { font-size: 0.72rem; opacity: 0.7; background: rgba(255,255,255,0.1); border-radius: 10px; padding: 0.05rem 0.5rem; }
.type-badge { font-size: 0.66rem; font-weight: 600; border-radius: 5px; padding: 0.05rem 0.4rem; text-transform: uppercase; }
.type-badge.t-tv { background: rgba(56,189,248,0.18); color: #7dd3fc; }
.type-badge.t-movie { background: rgba(251,191,36,0.18); color: #fbbf24; }
.type-badge.t-series { background: rgba(167,139,250,0.2); color: #c4b5fd; }
.add-src { align-self: flex-start; }
.btn.tiny.danger { color: #f87171; }
.hint.warn { color: #fbbf24; }
</style>
