<template>
  <div class="category-selector">
    <!-- Catalog layout chooser -->
    <div class="form-group">
      <label class="group-label">{{ t('Catalog layout', 'Mise en page des catalogues') }}</label>
      <div class="radio-group">
        <label class="checkbox-line">
          <input type="radio" :name="modeName" value="single"
            :checked="mode === 'single'" @change="$emit('update:mode', 'single')">
          <span class="checkbox-label">
            <strong>{{ t('Single catalog', 'Catalogue unique') }}</strong> — {{ t('all selected categories grouped into one catalog (categories stay available as a genre filter inside it).', 'toutes les catégories regroupées dans un seul catalogue (les catégories restent un filtre de genre interne).') }}
          </span>
        </label>
        <label class="checkbox-line">
          <input type="radio" :name="modeName" value="split"
            :checked="mode === 'split'" @change="$emit('update:mode', 'split')">
          <span class="checkbox-label">
            <strong>{{ t('One catalog per category', 'Un catalogue par catégorie') }}</strong> — {{ t('each selected category becomes its own Stremio catalog row.', 'chaque catégorie devient sa propre ligne de catalogue dans Stremio.') }}
          </span>
        </label>
        <label class="checkbox-line">
          <input type="radio" :name="modeName" value="custom"
            :checked="mode === 'custom'" @change="$emit('update:mode', 'custom')">
          <span class="checkbox-label">
            <strong>{{ t('Custom catalogs', 'Catalogues personnalisés') }}</strong> — {{ t('build your own catalogs, each grouping one or more categories.', 'composez vos propres catalogues, chacun regroupant une ou plusieurs catégories.') }}
          </span>
        </label>
      </div>
    </div>

    <!-- On-home chooser: which catalogs show on the Stremio home board -->
    <div class="form-group" v-if="homeCatalogs.length">
      <label class="group-label">{{ t('On the home screen', 'Sur l\'accueil') }}</label>
      <p class="hint">{{ t('Unchecked catalogs stay accessible in Discover only.', 'Les catalogues décochés restent accessibles uniquement dans Découvrir.') }}</p>
      <div class="home-list">
        <label v-for="c in homeCatalogs" :key="c.key" class="checkbox-line">
          <input type="checkbox" :checked="isHomeCat(c.key)" @change="toggleHome(c.key)">
          <span class="checkbox-label">{{ c.label }}</span>
        </label>
      </div>
    </div>

    <!-- Type filter (only when the source exposes more than live TV) -->
    <!-- In custom mode the type filter is shown per-catalog instead (see below). -->
    <div v-if="hasTypes && mode !== 'custom'" class="type-filter">
      <button v-for="t in typeFilters" :key="t.value" type="button"
        class="playlist-chip" :class="{ active: typeFilter === t.value }"
        @click="typeFilter = t.value">
        <span class="chip-label">{{ t.label }}<span v-if="t.value !== 'all'" class="chip-n"> ({{ countByType(t.value) }})</span></span>
      </button>
    </div>
    <small v-if="hasTypes" class="hint">
      {{ t('Type is auto-detected. Movie and Series catalogs play directly from your provider (series show seasons & episodes on Xtream).', 'Type auto-détecté. Les catalogues Films et Séries se lisent directement depuis votre fournisseur (séries avec saisons & épisodes en Xtream).') }}
    </small>

    <!-- single / split: simple category picker -->
    <template v-if="mode !== 'custom'">
      <div class="cat-toolbar">
        <input type="text" class="cat-filter" v-model="filter" :placeholder="t('Filter categories…', 'Filtrer les catégories…')" autocomplete="off">
        <span class="cat-count">{{ selectedSet.size }} / {{ categories.length }} {{ t('selected', 'sélectionnées') }}</span>
      </div>

      <div class="cat-actions">
        <button type="button" class="btn tiny ghost" @click="selectAll">{{ t('Select all', 'Tout') }}</button>
        <button type="button" class="btn tiny ghost" @click="selectNone">{{ t('Select none', 'Aucun') }}</button>
        <button type="button" class="btn tiny ghost" @click="invert">{{ t('Invert', 'Inverser') }}</button>
      </div>

      <div class="cat-list">
        <label v-for="cat in filtered" :key="cat.type + '::' + cat.name" class="cat-item"
          :class="{ checked: selectedSet.has(cat.name) }">
          <input type="checkbox" :checked="selectedSet.has(cat.name)" @change="toggle(cat.name)">
          <span v-if="cat.type" class="type-badge" :class="'t-' + cat.type">{{ typeLabel(cat.type) }}</span>
          <span class="cat-name" :title="cat.name">{{ cat.name }}</span>
          <span v-if="cat.count != null" class="cat-badge">{{ cat.count }}</span>
        </label>
        <p v-if="filtered.length === 0" class="cat-empty">{{ t('No category matches the current filter.', 'Aucune catégorie ne correspond au filtre.') }}</p>
      </div>

      <small v-if="mode === 'split' && selectedSet.size > splitWarnThreshold" class="hint warn">
        {{ t(`${selectedSet.size} categories selected — that's a lot of catalog rows in Stremio.`, `${selectedSet.size} catégories sélectionnées — ça fait beaucoup de lignes de catalogue dans Stremio.`) }}
      </small>
    </template>

    <!-- custom: catalog groups editor -->
    <template v-else>
      <div class="groups-editor">
        <small class="hint warn">
          {{ t('Only categories added to a catalog below appear in Stremio. Selected categories left out of every catalog are not shown.', 'Seules les catégories placées dans un catalogue ci-dessous apparaissent dans Stremio. Les catégories cochées qui ne sont dans aucun catalogue ne sont pas affichées.') }}
        </small>
        <div v-for="(group, gi) in groups" :key="gi" class="group-card">
          <div class="group-head">
            <input type="text" class="group-name" :value="group.name"
              :placeholder="t('Catalog name', 'Nom du catalogue')" @input="setGroupName(gi, ($event.target as HTMLInputElement).value)">
            <span class="cat-badge">{{ group.categories.length }} cat.</span>
            <button type="button" class="btn tiny ghost" @click="toggleExpanded(gi)">
              {{ expanded.has(gi) ? t('Hide', 'Masquer') : t('Pick categories', 'Choisir les catégories') }}
            </button>
            <button type="button" class="btn tiny ghost danger" @click="removeGroup(gi)">{{ t('Remove', 'Retirer') }}</button>
          </div>

          <div v-if="group.categories.length" class="group-chips">
            <span v-for="c in group.categories" :key="c" class="group-chip">{{ c }}</span>
          </div>

          <div v-if="expanded.has(gi)" class="group-picker">
            <div v-if="hasTypes" class="type-filter">
              <button v-for="tf in typeFilters" :key="tf.value" type="button"
                class="playlist-chip" :class="{ active: (groupTypeFilters[gi] || 'all') === tf.value }"
                @click="groupTypeFilters[gi] = tf.value">
                <span class="chip-label">{{ tf.label }}<span v-if="tf.value !== 'all'" class="chip-n"> ({{ countByType(tf.value) }})</span></span>
              </button>
            </div>
            <input type="text" class="cat-filter" v-model="groupFilters[gi]" :placeholder="t('Filter categories…', 'Filtrer les catégories…')"
              autocomplete="off">
            <div class="cat-list">
              <label v-for="cat in filteredForGroup(gi)" :key="cat.type + '::' + cat.name" class="cat-item"
                :class="{ checked: groupHas(gi, cat.name) }">
                <input type="checkbox" :checked="groupHas(gi, cat.name)" @change="toggleGroupCategory(gi, cat.name)">
                <span v-if="cat.type" class="type-badge" :class="'t-' + cat.type">{{ typeLabel(cat.type) }}</span>
                <span class="cat-name" :title="cat.name">{{ cat.name }}</span>
                <span v-if="cat.count != null" class="cat-badge">{{ cat.count }}</span>
              </label>
            </div>
          </div>
        </div>

        <button type="button" class="btn ghost add-group" @click="addGroup">+ {{ t('Add catalog', 'Ajouter un catalogue') }}</button>

        <small v-if="groups.length === 0" class="hint">
          {{ t('Add at least one catalog and assign it some categories.', 'Ajoutez au moins un catalogue et affectez-lui des catégories.') }}
        </small>
        <small v-else-if="!hasValidGroup" class="hint warn">
          {{ t('Give each catalog a name and at least one category, otherwise it is ignored.', 'Donnez un nom et au moins une catégorie à chaque catalogue, sinon il est ignoré.') }}
        </small>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useI18n } from '../composables/useI18n'
import type { CatalogMode, CatalogGroup } from '../types/config'

const { t } = useI18n()

export type CategoryType = 'tv' | 'movie' | 'series'

export interface CategoryEntry {
  name: string
  count?: number
  type?: CategoryType
}

const props = defineProps<{
  categories: CategoryEntry[]
  modelValue: string[]
  mode: CatalogMode
  groups: CatalogGroup[]
  /** Catalog keys kept off the home board (Discover only). */
  discoverOnly?: string[]
  /** unique radio group name so multiple selectors on a page don't clash */
  modeName?: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string[]): void
  (e: 'update:mode', value: CatalogMode): void
  (e: 'update:groups', value: CatalogGroup[]): void
  (e: 'update:discoverOnly', value: string[]): void
}>()

const splitWarnThreshold = 25
const filter = ref('')
const typeFilter = ref<'all' | CategoryType>('all')

const typeFilters = computed(() => [
  { value: 'all' as const, label: t('All', 'Tous') },
  { value: 'tv' as const, label: 'TV' },
  { value: 'movie' as const, label: t('Movies', 'Films') },
  { value: 'series' as const, label: t('Series', 'Séries') },
])

const modeName = computed(() => props.modeName || 'catalogMode')
const selectedSet = computed(() => new Set(props.modelValue))
const hasTypes = computed(() => props.categories.some(c => c.type && c.type !== 'tv'))

// Catalogs that will be created, for the "on home" chooser.
const homeCatalogs = computed<Array<{ key: string; label: string }>>(() => {
  if (props.mode === 'custom') {
    return props.groups
      .map((g, i) => ({ i, g }))
      .filter(x => x.g.name.trim() && x.g.categories.length > 0)
      .map(x => ({ key: 'grp:' + x.i, label: x.g.name.trim() || `Catalog ${x.i + 1}` }))
  }
  if (props.mode === 'split') {
    return props.modelValue.map(name => ({ key: 'cat:' + name, label: name }))
  }
  // single: one catalog per present media type
  const typeByName = new Map(props.categories.map(c => [c.name, c.type || 'tv']))
  const present = new Set<string>()
  for (const n of props.modelValue) present.add((typeByName.get(n) as any) || 'tv')
  if (!props.modelValue.length) present.add('tv')
  return (['tv', 'movie', 'series'] as const)
    .filter(tp => present.has(tp))
    .map(tp => ({ key: 'type:' + tp, label: typeLabel(tp) }))
})

const discoverSet = computed(() => new Set(props.discoverOnly || []))
function isHomeCat(key: string) { return !discoverSet.value.has(key) }
function toggleHome(key: string) {
  const set = new Set(props.discoverOnly || [])
  if (set.has(key)) set.delete(key); else set.add(key)
  emit('update:discoverOnly', [...set])
}

function typeLabel(ct?: CategoryType) {
  return ct === 'movie' ? t('Movie', 'Film') : ct === 'series' ? t('Series', 'Série') : 'TV'
}

function countByType(t: 'all' | CategoryType) {
  if (t === 'all') return props.categories.length
  return props.categories.filter(c => (c.type || 'tv') === t).length
}

function matchesType(cat: CategoryEntry) {
  return typeFilter.value === 'all' || (cat.type || 'tv') === typeFilter.value
}

const filtered = computed(() => {
  const q = filter.value.trim().toLowerCase()
  return props.categories.filter(c =>
    matchesType(c) && (!q || c.name.toLowerCase().includes(q))
  )
})

function toggle(name: string) {
  const set = new Set(props.modelValue)
  if (set.has(name)) set.delete(name)
  else set.add(name)
  emit('update:modelValue', [...set])
}

function selectAll() {
  const set = new Set(props.modelValue)
  for (const c of filtered.value) set.add(c.name)
  emit('update:modelValue', [...set])
}

function selectNone() {
  const visible = new Set(filtered.value.map(c => c.name))
  if (visible.size < props.categories.length) {
    // A filter is active → only clear the visible subset.
    emit('update:modelValue', props.modelValue.filter(n => !visible.has(n)))
  } else {
    emit('update:modelValue', [])
  }
}

function invert() {
  const set = new Set(props.modelValue)
  for (const c of filtered.value) {
    if (set.has(c.name)) set.delete(c.name)
    else set.add(c.name)
  }
  emit('update:modelValue', [...set])
}

/* ---- custom groups ---- */

const expanded = reactive(new Set<number>())
const groupFilters = reactive<Record<number, string>>({})
const groupTypeFilters = reactive<Record<number, 'all' | CategoryType>>({})

const hasValidGroup = computed(() =>
  props.groups.some(g => g.name.trim() && g.categories.length > 0)
)

function emitGroups(next: CatalogGroup[]) {
  emit('update:groups', next)
}

function addGroup() {
  const next = props.groups.map(g => ({ name: g.name, categories: [...g.categories] }))
  next.push({ name: `Catalog ${next.length + 1}`, categories: [] })
  emitGroups(next)
  expanded.add(next.length - 1)
}

function removeGroup(gi: number) {
  const next = props.groups
    .filter((_, i) => i !== gi)
    .map(g => ({ name: g.name, categories: [...g.categories] }))
  expanded.delete(gi)
  emitGroups(next)
}

function setGroupName(gi: number, name: string) {
  const next = props.groups.map((g, i) => ({
    name: i === gi ? name : g.name,
    categories: [...g.categories],
  }))
  emitGroups(next)
}

function toggleExpanded(gi: number) {
  if (expanded.has(gi)) expanded.delete(gi)
  else expanded.add(gi)
}

function groupHas(gi: number, name: string) {
  return props.groups[gi]?.categories.includes(name) ?? false
}

function toggleGroupCategory(gi: number, name: string) {
  const next = props.groups.map((g, i) => {
    if (i !== gi) return { name: g.name, categories: [...g.categories] }
    const set = new Set(g.categories)
    if (set.has(name)) set.delete(name)
    else set.add(name)
    return { name: g.name, categories: [...set] }
  })
  emitGroups(next)
}

function filteredForGroup(gi: number) {
  const q = (groupFilters[gi] || '').trim().toLowerCase()
  const tf = groupTypeFilters[gi] || 'all'
  return props.categories.filter(c =>
    (tf === 'all' || (c.type || 'tv') === tf) && (!q || c.name.toLowerCase().includes(q))
  )
}
</script>

<style scoped>
.category-selector {
  margin-top: 0.5rem;
}
.home-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem 1.25rem;
}
.home-list .checkbox-line { margin: 0; }
.type-filter {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-bottom: 0.4rem;
}
.chip-n {
  opacity: 0.6;
}
.cat-toolbar {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.5rem;
}
.cat-filter {
  flex: 1;
}
.cat-count {
  font-size: 0.8rem;
  opacity: 0.75;
  white-space: nowrap;
}
.cat-actions {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}
.cat-list {
  max-height: 280px;
  overflow-y: auto;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  padding: 0.25rem;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.cat-item {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.4rem 0.55rem;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.12s ease;
}
.cat-item:hover {
  background: rgba(255, 255, 255, 0.06);
}
.cat-item.checked {
  background: rgba(99, 102, 241, 0.16);
}
.cat-item input {
  margin: 0;
  flex-shrink: 0;
}
.cat-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cat-badge {
  font-size: 0.72rem;
  opacity: 0.7;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  padding: 0.05rem 0.5rem;
  flex-shrink: 0;
}
.type-badge {
  font-size: 0.66rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  border-radius: 5px;
  padding: 0.05rem 0.4rem;
  flex-shrink: 0;
  text-transform: uppercase;
}
.type-badge.t-tv {
  background: rgba(56, 189, 248, 0.18);
  color: #7dd3fc;
}
.type-badge.t-movie {
  background: rgba(251, 191, 36, 0.18);
  color: #fbbf24;
}
.type-badge.t-series {
  background: rgba(167, 139, 250, 0.2);
  color: #c4b5fd;
}
.cat-empty {
  padding: 0.75rem;
  opacity: 0.7;
  font-size: 0.85rem;
}
.hint.warn {
  color: #fbbf24;
}

/* custom groups */
.groups-editor {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.group-card {
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  padding: 0.6rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.group-head {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.group-name {
  flex: 1;
  min-width: 140px;
}
.group-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
}
.group-chip {
  font-size: 0.72rem;
  background: rgba(99, 102, 241, 0.16);
  border-radius: 10px;
  padding: 0.1rem 0.55rem;
}
.group-picker {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.btn.tiny.danger {
  color: #f87171;
}
.add-group {
  align-self: flex-start;
}
</style>
