<template>
  <div class="card saved-card" v-if="saved.state.items.length || saved.state.loaded">
    <h2>{{ t('Saved configurations', 'Configurations sauvegardées') }}</h2>
    <p v-if="!saved.state.items.length" class="hint">
      {{ t('No saved configuration yet. Build one below and click', 'Aucune configuration sauvegardée. Crées-en une ci-dessous puis clique sur') }}
      <strong>{{ t('Save', 'Sauvegarder') }}</strong>.
    </p>
    <ul v-else class="saved-list">
      <li v-for="item in saved.state.items" :key="item.id" class="saved-item">
        <span class="type-badge" :class="'t-' + item.provider">{{ providerLabel(item.provider) }}</span>
        <span class="saved-name" :title="item.name">{{ item.name }}</span>
        <span class="saved-date">{{ formatDate(item.updatedAt) }}</span>
        <button type="button" class="btn tiny" :disabled="busy === item.id" @click="load(item)">
          {{ busy === item.id ? t('Loading…', 'Chargement…') : t('Load', 'Charger') }}
        </button>
        <button type="button" class="btn tiny ghost danger" @click="remove(item)">{{ t('Delete', 'Supprimer') }}</button>
      </li>
    </ul>
    <p v-if="error" class="hint warn">{{ error }}</p>
  </div>
</template>

<script setup lang="ts">
import { ref, inject, onMounted } from 'vue'
import { useSavedConfigs } from '../composables/useSavedConfigs'
import { useI18n } from '../composables/useI18n'

const oc = inject<any>('overlayControl')!
const saved = useSavedConfigs()
const { t } = useI18n()
const busy = ref('')
const error = ref('')

onMounted(() => { saved.refresh() })

function providerLabel(p: string) {
  return p === 'm3u' ? 'M3U' : p === 'iptv-org' ? 'IPTV-org' : 'Xtream'
}

function formatDate(ms: number) {
  try { return new Date(ms).toLocaleDateString() } catch { return '' }
}

async function load(item: { id: string }) {
  error.value = ''
  busy.value = item.id
  try {
    const config = await saved.get(item.id)
    const { manifestUrl } = await oc.buildUrls(config)
    // Reuse the reconfigure route: the SPA restores the form from the token.
    window.location.href = manifestUrl.replace(/\/manifest\.json$/, '/configure')
  } catch (e: any) {
    error.value = e.message || 'Load failed'
    busy.value = ''
  }
}

async function remove(item: { id: string; name: string }) {
  if (!confirm(t(`Delete saved configuration “${item.name}”?`, `Supprimer la configuration « ${item.name} » ?`))) return
  error.value = ''
  try { await saved.remove(item.id) } catch (e: any) { error.value = e.message || 'Delete failed' }
}
</script>

<style scoped>
.saved-card { margin-bottom: 1rem; }
.saved-card h2 { margin-top: 0; }
.saved-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.4rem; }
.saved-item {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.5rem 0.6rem;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
}
.saved-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; }
.saved-date { font-size: 0.78rem; opacity: 0.6; white-space: nowrap; }
.type-badge {
  font-size: 0.66rem; font-weight: 600; border-radius: 5px; padding: 0.05rem 0.4rem;
  text-transform: uppercase; flex-shrink: 0;
}
.type-badge.t-xtream { background: rgba(56, 189, 248, 0.18); color: #7dd3fc; }
.type-badge.t-m3u { background: rgba(251, 191, 36, 0.18); color: #fbbf24; }
.type-badge.t-iptv-org { background: rgba(167, 139, 250, 0.2); color: #c4b5fd; }
.btn.tiny.danger { color: #f87171; }
.hint.warn { color: #fbbf24; }
</style>
