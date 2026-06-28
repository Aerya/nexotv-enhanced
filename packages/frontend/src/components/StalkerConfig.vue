<template>
  <form class="config-form" autocomplete="off" @submit.prevent="handleInstall">
    <fieldset>
      <legend>{{ t('Stalker portal', 'Portail Stalker') }}</legend>
      <div class="info-banner">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4M12 8h.01"></path>
        </svg>
        <span>
          {{ t('Stalker / Ministra portal (MAC authentication). Live TV only for now.', 'Portail Stalker / Ministra (authentification par MAC). TV en direct uniquement pour l\'instant.') }}
        </span>
      </div>
      <div class="form-group">
        <label for="stalkerUrl">{{ t('Portal URL', 'URL du portail') }} <span class="req">*</span></label>
        <input type="url" id="stalkerUrl" v-model="form.stalkerUrl" placeholder="http://portal.example.com">
        <small class="hint">{{ t('Base URL (the addon auto-detects /c/portal.php).', 'URL de base (le chemin /c/portal.php est auto-détecté).') }}</small>
      </div>
      <div class="form-group">
        <label for="stalkerMac">{{ t('MAC address', 'Adresse MAC') }} <span class="req">*</span></label>
        <input type="text" id="stalkerMac" v-model="form.stalkerMac" placeholder="00:1A:79:XX:XX:XX">
      </div>
    </fieldset>

    <fieldset>
      <legend>{{ t('Categories', 'Catégories') }}</legend>
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
        :categories="categories"
        modeName="stalkerCatalogMode"
      />
    </fieldset>

    <fieldset>
      <legend>{{ t('Display', 'Affichage') }}</legend>
      <div class="form-group">
        <label for="stalkerCatalogName">{{ t('Catalog Name', 'Nom du catalogue') }}</label>
        <input type="text" id="stalkerCatalogName" v-model="form.catalogName" placeholder="NexoTV-Enhanced">
      </div>
    </fieldset>

    <div class="form-actions">
      <button type="button" class="btn ghost" @click="handleSave">{{ t('Save configuration', 'Sauvegarder la configuration') }}</button>
      <button type="submit" class="btn primary">{{ t('Install Addon', 'Installer l\'addon') }}</button>
    </div>
  </form>
</template>

<script setup lang="ts">
import { reactive, ref, inject, onMounted } from 'vue'
import CategorySelector, { type CategoryEntry } from './CategorySelector.vue'
import { useDecodedToken } from '../composables/useDecodedToken'
import { useAuth } from '../composables/useAuth'
import { useSavedConfigs } from '../composables/useSavedConfigs'
import { useI18n } from '../composables/useI18n'
import type { StalkerConfig, CatalogMode, CatalogGroup } from '../types/config'

const oc = inject<any>('overlayControl')!
const { t } = useI18n()

const form = reactive({
  stalkerUrl: '',
  stalkerMac: '',
  catalogName: '',
  selectedCategories: [] as string[],
  catalogMode: 'single' as CatalogMode,
  catalogGroups: [] as CatalogGroup[],
})

const categories = ref<CategoryEntry[]>([])
const categoriesLoaded = ref(false)
const loadingCats = ref(false)
const catsError = ref('')

async function loadCategories() {
  if (!form.stalkerUrl.trim() || !form.stalkerMac.trim()) { catsError.value = t('Portal URL and MAC required first.', 'URL du portail et MAC requis.'); return }
  catsError.value = ''
  loadingCats.value = true
  oc.showOverlay(true); oc.setProgress(10, 'Loading categories'); oc.appendDetail('== LOAD CATEGORIES (STALKER) ==')
  try {
    const r = await fetch('/api/stalker/categories', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: form.stalkerUrl.trim(), mac: form.stalkerMac.trim() }),
    })
    if (r.status === 401) { useAuth().markUnauthenticated(); throw new Error(t('Session expired — sign in again.', 'Session expirée — reconnecte-toi.')) }
    const p = await r.json().catch(() => ({}))
    if (!r.ok || !Array.isArray(p.categories) || !p.categories.length) throw new Error(p.error || t('No category found.', 'Aucune catégorie trouvée.'))
    categories.value = p.categories
    categoriesLoaded.value = true
    oc.appendDetail(`✔ ${p.categories.length} categories`); oc.setProgress(100, 'OK'); oc.hideOverlay()
  } catch (e: any) {
    catsError.value = e.message || String(e); oc.appendDetail('✖ ' + catsError.value); oc.markError()
  } finally { loadingCats.value = false }
}

function buildConfig(): (StalkerConfig & { catalogName?: string }) | null {
  const url = form.stalkerUrl.trim(), mac = form.stalkerMac.trim()
  if (!url || !mac) return null
  const config: StalkerConfig & { catalogName?: string } = { provider: 'stalker', stalkerUrl: url, stalkerMac: mac }
  if (form.catalogMode === 'custom') {
    const groups = form.catalogGroups
      .map(g => ({ name: g.name.trim(), categories: [...g.categories] }))
      .filter(g => g.name && g.categories.length > 0)
    if (groups.length) { config.catalogMode = 'custom'; config.catalogGroups = groups }
  } else if (form.selectedCategories.length) {
    config.selectedCategories = [...form.selectedCategories]
    config.catalogMode = form.catalogMode
  }
  if (form.catalogName.trim()) config.catalogName = form.catalogName.trim()
  return config
}

async function handleInstall() {
  const config = buildConfig()
  if (!config) { alert(t('Enter portal URL and MAC.', 'Renseigne l\'URL du portail et la MAC.')); return }
  oc.showOverlay(false); oc.setProgress(5, 'Building…')
  try {
    const { manifestUrl, stremioUrl } = await oc.buildUrls(config)
    oc.startPolling(manifestUrl, stremioUrl, 10)
  } catch (e: any) { oc.hideOverlay(); alert('Error: ' + e.message) }
}

async function handleSave() {
  const config = buildConfig()
  if (!config) { alert(t('Enter portal URL and MAC.', 'Renseigne l\'URL du portail et la MAC.')); return }
  const name = prompt(t('Name this configuration:', 'Nom de la configuration :'), form.catalogName.trim() || 'Stalker')
  if (!name) return
  try { await useSavedConfigs().save(name.trim(), config as any); alert(t('Configuration saved.', 'Configuration sauvegardée.')) }
  catch (e: any) { alert('Save failed: ' + (e.message || e)) }
}

onMounted(() => {
  const { decodedConfig } = useDecodedToken()
  if (!decodedConfig || decodedConfig.provider !== 'stalker') return
  const d = decodedConfig as StalkerConfig
  form.stalkerUrl = d.stalkerUrl || ''
  form.stalkerMac = d.stalkerMac || ''
  form.catalogName = (decodedConfig as any).catalogName || ''
  form.catalogMode = d.catalogMode === 'split' ? 'split' : d.catalogMode === 'custom' ? 'custom' : 'single'
  if (Array.isArray(d.catalogGroups)) form.catalogGroups = d.catalogGroups.map(g => ({ name: g.name, categories: [...g.categories] }))
  if (Array.isArray(d.selectedCategories)) form.selectedCategories = [...d.selectedCategories]
  const seed = new Set<string>(d.selectedCategories || [])
  for (const g of (d.catalogGroups || [])) for (const c of g.categories) seed.add(c)
  if (seed.size) { categories.value = [...seed].sort().map(name => ({ name, type: 'tv' as const })); categoriesLoaded.value = true }
})
</script>
