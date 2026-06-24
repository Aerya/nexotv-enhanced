<template>
  <div class="category-selector">
    <div class="cat-toolbar">
      <input
        type="text"
        class="cat-filter"
        v-model="filter"
        placeholder="Filter categories…"
        autocomplete="off"
      >
      <span class="cat-count">{{ selectedSet.size }} / {{ categories.length }} selected</span>
    </div>

    <div class="cat-actions">
      <button type="button" class="btn tiny ghost" @click="selectAll">Select all</button>
      <button type="button" class="btn tiny ghost" @click="selectNone">Select none</button>
      <button type="button" class="btn tiny ghost" @click="invert">Invert</button>
    </div>

    <div class="cat-list">
      <label
        v-for="cat in filtered"
        :key="cat.name"
        class="cat-item"
        :class="{ checked: selectedSet.has(cat.name) }"
      >
        <input
          type="checkbox"
          :checked="selectedSet.has(cat.name)"
          @change="toggle(cat.name)"
        >
        <span class="cat-name" :title="cat.name">{{ cat.name }}</span>
        <span v-if="cat.count != null" class="cat-badge">{{ cat.count }}</span>
      </label>
      <p v-if="filtered.length === 0" class="cat-empty">No category matches “{{ filter }}”.</p>
    </div>

    <div class="form-group">
      <label class="group-label">Catalog layout</label>
      <div class="radio-group">
        <label class="checkbox-line">
          <input type="radio" :name="modeName" value="single"
            :checked="mode === 'single'" @change="$emit('update:mode', 'single')">
          <span class="checkbox-label">
            <strong>Single catalog</strong> — all selected categories grouped into one catalog
            (categories stay available as a genre filter inside it).
          </span>
        </label>
        <label class="checkbox-line">
          <input type="radio" :name="modeName" value="split"
            :checked="mode === 'split'" @change="$emit('update:mode', 'split')">
          <span class="checkbox-label">
            <strong>One catalog per category</strong> — each selected category becomes its own
            Stremio catalog row.
          </span>
        </label>
      </div>
      <small v-if="mode === 'split' && selectedSet.size > splitWarnThreshold" class="hint warn">
        {{ selectedSet.size }} categories selected — that's a lot of catalog rows in Stremio.
      </small>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { CatalogMode } from '../types/config'

export interface CategoryEntry {
  name: string
  count?: number
}

const props = defineProps<{
  categories: CategoryEntry[]
  modelValue: string[]
  mode: CatalogMode
  /** unique radio group name so multiple selectors on a page don't clash */
  modeName?: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string[]): void
  (e: 'update:mode', value: CatalogMode): void
}>()

const splitWarnThreshold = 25
const filter = ref('')

const modeName = computed(() => props.modeName || 'catalogMode')
const selectedSet = computed(() => new Set(props.modelValue))

const filtered = computed(() => {
  const q = filter.value.trim().toLowerCase()
  if (!q) return props.categories
  return props.categories.filter(c => c.name.toLowerCase().includes(q))
})

function toggle(name: string) {
  const set = new Set(props.modelValue)
  if (set.has(name)) set.delete(name)
  else set.add(name)
  emit('update:modelValue', [...set])
}

function selectAll() {
  // Add every currently filtered category to the existing selection.
  const set = new Set(props.modelValue)
  for (const c of filtered.value) set.add(c.name)
  emit('update:modelValue', [...set])
}

function selectNone() {
  if (filter.value.trim()) {
    // Only clear the filtered subset.
    const filteredNames = new Set(filtered.value.map(c => c.name))
    emit('update:modelValue', props.modelValue.filter(n => !filteredNames.has(n)))
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
</script>

<style scoped>
.category-selector {
  margin-top: 0.5rem;
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
.cat-empty {
  padding: 0.75rem;
  opacity: 0.7;
  font-size: 0.85rem;
}
.hint.warn {
  color: #fbbf24;
}
</style>
