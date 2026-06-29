<template>
  <div class="card stats-card">
    <h2>{{ t('Statistics', 'Statistiques') }}</h2>

    <!-- Viewing (output) -->
    <section class="stats-section">
      <div class="stats-head">
        <h3>{{ t('Viewing', 'Visionnage') }}</h3>
        <span class="badge active">{{ t('Active (10 min)', 'En cours (10 min)') }}: {{ active }}</span>
        <span class="badge">{{ t('Total', 'Total') }}: {{ total }}</span>
        <button type="button" class="btn tiny ghost" :disabled="loadingViews" @click="loadViews">
          {{ loadingViews ? t('Loading…', 'Chargement…') : t('Refresh', 'Rafraîchir') }}
        </button>
        <button type="button" class="btn tiny ghost danger" v-if="views.length" @click="clearViews">
          {{ t('Clear', 'Vider') }}
        </button>
      </div>
      <p class="hint">
        {{ t('Each row is a stream-list request (media opened). Real watch duration is not measurable for direct provider streams.', 'Chaque ligne = une demande de liens de lecture (média ouvert). La durée réelle de visionnage n\'est pas mesurable pour des flux directs.') }}
      </p>
      <div v-if="views.length" class="table-wrap">
        <table class="stats-table">
          <thead>
            <tr>
              <th>{{ t('Time', 'Heure') }}</th>
              <th>{{ t('Title', 'Titre') }}</th>
              <th>{{ t('Type', 'Type') }}</th>
              <th>IP</th>
              <th>{{ t('Source', 'Source') }}</th>
              <th>MAC</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(v, i) in views" :key="i" :class="{ live: isLive(v.ts) }">
              <td class="nowrap">{{ fmt(v.ts) }}</td>
              <td class="title" :title="v.title">{{ v.title }}</td>
              <td>{{ v.type }}</td>
              <td class="nowrap">{{ v.ip }}</td>
              <td>{{ v.source }}</td>
              <td class="nowrap">{{ v.mac || '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-else class="hint">{{ t('No viewing recorded yet.', 'Aucun visionnage enregistré.') }}</p>
      <p v-if="error" class="hint warn">{{ error }}</p>
    </section>

    <!-- Feed (input) -->
    <section class="stats-section" v-if="saved.state.items.length">
      <h3>{{ t('Incoming feeds', 'Flux d\'entrée') }}</h3>
      <p class="hint">{{ t('Number of TV / Movie / Series groups (categories) per saved configuration.', 'Nombre de groupes (catégories) TV / Films / Séries par configuration sauvegardée.') }}</p>
      <ul class="feed-list">
        <li v-for="item in saved.state.items" :key="item.id" class="feed-item">
          <span class="type-badge" :class="'t-' + item.provider">{{ providerLabel(item.provider) }}</span>
          <span class="feed-name" :title="item.name">{{ item.name }}</span>
          <template v-if="feed[item.id]">
            <span class="g tv">TV {{ feed[item.id].groups.tv }}</span>
            <span class="g movie">{{ t('Movies', 'Films') }} {{ feed[item.id].groups.movie }}</span>
            <span class="g series">{{ t('Series', 'Séries') }} {{ feed[item.id].groups.series }}</span>
            <span class="hint">· {{ feed[item.id].channels }} {{ t('items', 'éléments') }}</span>
          </template>
          <button type="button" class="btn tiny ghost" :disabled="feedBusy === item.id" @click="loadFeed(item.id)">
            {{ feedBusy === item.id ? t('Loading…', 'Chargement…') : (feed[item.id] ? t('Reload', 'Recharger') : t('Load stats', 'Charger les stats')) }}
          </button>
        </li>
      </ul>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { useI18n } from '../composables/useI18n'
import { useAuth } from '../composables/useAuth'
import { useSavedConfigs } from '../composables/useSavedConfigs'

const { t } = useI18n()
const auth = useAuth()
const saved = useSavedConfigs()

interface ViewEntry { ts: number; type: string; title: string; ip: string; source: string; mac: string }

const views = ref<ViewEntry[]>([])
const total = ref(0)
const active = ref(0)
const loadingViews = ref(false)
const error = ref('')

const feed = reactive<Record<string, { loaded: boolean; channels: number; groups: { tv: number; movie: number; series: number } }>>({})
const feedBusy = ref('')

function providerLabel(p: string) {
  switch (p) {
    case 'm3u': return 'M3U'
    case 'iptv-org': return 'IPTV-org'
    case 'stalker': return 'Stalker'
    case 'multi': return 'Multi'
    default: return 'Xtream'
  }
}

function fmt(ms: number) { try { return new Date(ms).toLocaleString() } catch { return '' } }
function isLive(ms: number) { return Date.now() - ms < 10 * 60 * 1000 }

async function loadViews() {
  error.value = ''
  loadingViews.value = true
  try {
    const r = await fetch('/api/stats/views')
    if (r.status === 401) { auth.markUnauthenticated(); return }
    const d = await r.json()
    views.value = Array.isArray(d.history) ? d.history : []
    total.value = d.total || 0
    active.value = d.active || 0
  } catch (e: any) {
    error.value = e.message || 'Failed'
  } finally {
    loadingViews.value = false
  }
}

async function clearViews() {
  if (!confirm(t('Clear the whole viewing log?', 'Vider tout le journal de visionnage ?'))) return
  try {
    const r = await fetch('/api/stats/views', { method: 'DELETE' })
    if (r.status === 401) { auth.markUnauthenticated(); return }
    await loadViews()
  } catch (e: any) { error.value = e.message || 'Failed' }
}

async function loadFeed(id: string) {
  feedBusy.value = id
  try {
    const r = await fetch('/api/stats/feed', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    if (r.status === 401) { auth.markUnauthenticated(); return }
    const d = await r.json()
    if (r.ok) feed[id] = { loaded: !!d.loaded, channels: d.channels || 0, groups: d.groups || { tv: 0, movie: 0, series: 0 } }
  } catch { /* ignore */ }
  finally { feedBusy.value = '' }
}

onMounted(() => { saved.refresh(); loadViews() })
</script>

<style scoped>
.stats-card h2 { margin-top: 0; }
.stats-section { margin-top: 0.75rem; }
.stats-section h3 { margin: 0.25rem 0; font-size: 0.95rem; }
.stats-head { display: flex; align-items: center; flex-wrap: wrap; gap: 0.5rem; }
.badge {
  font-size: 0.72rem; font-weight: 600; border-radius: 6px; padding: 0.1rem 0.5rem;
  background: rgba(255, 255, 255, 0.1);
}
.badge.active { background: rgba(52, 211, 153, 0.18); color: #6ee7b7; }
.table-wrap { max-height: 320px; overflow: auto; border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 8px; }
.stats-table { width: 100%; border-collapse: collapse; font-size: 0.8rem; }
.stats-table th, .stats-table td { text-align: left; padding: 0.35rem 0.55rem; border-bottom: 1px solid rgba(255, 255, 255, 0.06); }
.stats-table th { position: sticky; top: 0; background: #1b1b25; opacity: 0.95; }
.stats-table tr.live td { background: rgba(52, 211, 153, 0.08); }
.stats-table .title { max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nowrap { white-space: nowrap; }
.feed-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.4rem; }
.feed-item { display: flex; align-items: center; gap: 0.6rem; padding: 0.4rem 0.5rem; border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 8px; flex-wrap: wrap; }
.feed-name { flex: 1; min-width: 120px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.g { font-size: 0.74rem; border-radius: 6px; padding: 0.05rem 0.45rem; background: rgba(255, 255, 255, 0.08); }
.g.tv { color: #7dd3fc; }
.g.movie { color: #fbbf24; }
.g.series { color: #c4b5fd; }
.type-badge { font-size: 0.66rem; font-weight: 600; border-radius: 5px; padding: 0.05rem 0.4rem; text-transform: uppercase; flex-shrink: 0; }
.type-badge.t-xtream { background: rgba(56, 189, 248, 0.18); color: #7dd3fc; }
.type-badge.t-m3u { background: rgba(251, 191, 36, 0.18); color: #fbbf24; }
.type-badge.t-iptv-org { background: rgba(167, 139, 250, 0.2); color: #c4b5fd; }
.type-badge.t-stalker { background: rgba(52, 211, 153, 0.18); color: #6ee7b7; }
.type-badge.t-multi { background: rgba(244, 114, 182, 0.18); color: #f9a8d4; }
.hint.warn { color: #fbbf24; }
</style>
