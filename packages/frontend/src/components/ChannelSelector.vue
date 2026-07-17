<template>
  <fieldset>
    <legend>{{ t('Channels', 'Chaînes') }}</legend>
    <p class="hint">
      {{ t(
        'Load the channels, then uncheck the ones you want to hide. Hidden channels are removed from catalogs and playback routes.',
        'Charge les chaînes, puis décoche celles que tu veux masquer. Les chaînes masquées sont retirées des catalogues et des routes de lecture.'
      ) }}
    </p>

    <div class="form-group channel-load-row">
      <button type="button" class="btn ghost" :disabled="loading || !config" @click="loadChannels">
        {{ loading
          ? t('Loading…', 'Chargement…')
          : (loaded ? t('Reload channels', 'Recharger les chaînes') : t('Load channels', 'Charger les chaînes')) }}
      </button>
      <span v-if="modelValue.length && !loaded" class="saved-count">
        {{ modelValue.length }} {{ t('hidden channel(s) saved', 'chaîne(s) masquée(s) enregistrée(s)') }}
      </span>
      <small v-if="error" class="hint warn">{{ error }}</small>
    </div>

    <template v-if="loaded">
      <div class="channel-toolbar">
        <input v-model="search" type="text" class="channel-search"
          :placeholder="t('Search a channel…', 'Rechercher une chaîne…')">
        <select v-model="category" class="channel-category">
          <option value="">{{ t('All categories', 'Toutes les catégories') }}</option>
          <option v-for="name in categories" :key="name" :value="name">{{ name }}</option>
        </select>
        <span class="channel-count">{{ visibleCount }} / {{ channels.length }} {{ t('visible', 'visibles') }}</span>
      </div>

      <div class="channel-actions">
        <button type="button" class="btn tiny ghost" @click="showFiltered">
          {{ t('Show filtered', 'Afficher le filtre') }}
        </button>
        <button type="button" class="btn tiny ghost" @click="hideFiltered">
          {{ t('Hide filtered', 'Masquer le filtre') }}
        </button>
      </div>

      <div class="channel-list">
        <label v-for="channel in displayedChannels" :key="channel.key" class="channel-item"
          :class="{ hidden: isHidden(channel.key) }">
          <input type="checkbox" :checked="!isHidden(channel.key)" @change="toggle(channel.key)">
          <span class="channel-main">
            <span class="channel-name">{{ channel.name }}</span>
            <span class="channel-meta">
              {{ channel.category }}<template v-if="channel.source"> · {{ channel.source }}</template>
            </span>
          </span>
        </label>
        <p v-if="!filteredChannels.length" class="empty">{{ t('No matching channel.', 'Aucune chaîne correspondante.') }}</p>
      </div>
      <p v-if="filteredChannels.length > DISPLAY_LIMIT" class="hint">
        {{ t(
          `Showing the first ${DISPLAY_LIMIT} results. Refine the search to find another channel.`,
          `Affichage des ${DISPLAY_LIMIT} premiers résultats. Affine la recherche pour trouver une autre chaîne.`
        ) }}
      </p>
    </template>
  </fieldset>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useAuth } from '../composables/useAuth'
import { useI18n } from '../composables/useI18n'

interface ChannelPreview {
  key: string
  name: string
  category: string
  source?: string
}

const props = defineProps<{
  modelValue: string[]
  config: Record<string, any> | null
}>()
const emit = defineEmits<{ 'update:modelValue': [value: string[]] }>()
const { t } = useI18n()
const auth = useAuth()

const DISPLAY_LIMIT = 500
const channels = ref<ChannelPreview[]>([])
const loading = ref(false)
const loaded = ref(false)
const error = ref('')
const search = ref('')
const category = ref('')

const hiddenSet = computed(() => new Set(props.modelValue))
const categories = computed(() => [...new Set(channels.value.map(channel => channel.category))]
  .sort((a, b) => a.localeCompare(b)))
const filteredChannels = computed(() => {
  const query = search.value.trim().toLocaleLowerCase()
  return channels.value.filter(channel =>
    (!category.value || channel.category === category.value) &&
    (!query || `${channel.name} ${channel.category} ${channel.source || ''}`.toLocaleLowerCase().includes(query))
  )
})
const displayedChannels = computed(() => filteredChannels.value.slice(0, DISPLAY_LIMIT))
const visibleCount = computed(() => channels.value.reduce((count, channel) =>
  count + (hiddenSet.value.has(channel.key) ? 0 : 1), 0))

function isHidden(key: string) {
  return hiddenSet.value.has(key)
}

function replaceHidden(next: Set<string>) {
  emit('update:modelValue', [...next].sort())
}

function toggle(key: string) {
  const next = new Set(props.modelValue)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  replaceHidden(next)
}

function showFiltered() {
  const next = new Set(props.modelValue)
  for (const channel of filteredChannels.value) next.delete(channel.key)
  replaceHidden(next)
}

function hideFiltered() {
  const next = new Set(props.modelValue)
  for (const channel of filteredChannels.value) next.add(channel.key)
  replaceHidden(next)
}

async function loadChannels() {
  if (!props.config) return
  loading.value = true
  error.value = ''
  try {
    const response = await fetch('/api/channels/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config: props.config }),
    })
    if (response.status === 401) {
      auth.markUnauthenticated()
      throw new Error(t('Session expired — sign in again.', 'Session expirée — reconnecte-toi.'))
    }
    const payload = await response.json().catch(() => ({}))
    if (!response.ok || !Array.isArray(payload.channels)) {
      throw new Error(payload.error || t('Unable to load channels.', 'Impossible de charger les chaînes.'))
    }
    const unique = new Map<string, ChannelPreview>()
    for (const item of payload.channels) {
      if (item?.key && !unique.has(item.key)) unique.set(item.key, item)
    }
    channels.value = [...unique.values()].sort((a, b) =>
      a.category.localeCompare(b.category) || a.name.localeCompare(b.name))
    loaded.value = true
  } catch (e: any) {
    error.value = e.message || String(e)
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.channel-load-row { display: flex; align-items: center; gap: 0.7rem; flex-wrap: wrap; }
.saved-count, .channel-count { font-size: 0.8rem; opacity: 0.72; }
.hint.warn { color: #fbbf24; }
.channel-toolbar { display: grid; grid-template-columns: minmax(180px, 1fr) minmax(150px, 0.5fr) auto; gap: 0.6rem; align-items: center; margin: 0.8rem 0 0.5rem; }
.channel-search, .channel-category { width: 100%; }
.channel-actions { display: flex; gap: 0.4rem; margin-bottom: 0.4rem; }
.channel-list { max-height: 360px; overflow-y: auto; border: 1px solid rgba(255,255,255,0.12); border-radius: 8px; padding: 0.25rem; display: flex; flex-direction: column; gap: 2px; }
.channel-item { display: flex; align-items: center; gap: 0.65rem; padding: 0.38rem 0.5rem; border-radius: 6px; cursor: pointer; }
.channel-item:hover { background: rgba(255,255,255,0.06); }
.channel-item.hidden { opacity: 0.55; }
.channel-item input { margin: 0; }
.channel-main { min-width: 0; display: flex; flex-direction: column; }
.channel-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.channel-meta { font-size: 0.72rem; opacity: 0.65; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.empty { margin: 0.8rem; text-align: center; opacity: 0.65; }
@media (max-width: 720px) {
  .channel-toolbar { grid-template-columns: 1fr; }
  .channel-count { justify-self: start; }
}
</style>
