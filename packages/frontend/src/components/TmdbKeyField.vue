<template>
  <fieldset>
    <legend>{{ t('Metadata (TMDB)', 'Métadonnées (TMDB)') }}</legend>
    <div class="info-banner">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4M12 8h.01"></path>
      </svg>
      <span>
        {{ t('Optional: a TMDB API key enriches Movies/Series detail pages (poster, synopsis, cast). When a title is not found on TMDB, the provider data is kept as a fallback.', 'Optionnel : une clé API TMDB enrichit les fiches Films/Séries (jaquette, synopsis, casting). Si un titre est introuvable sur TMDB, les données du fournisseur sont conservées en repli.') }}
      </span>
    </div>
    <div class="form-group">
      <label>{{ t('TMDB API key', 'Clé API TMDB') }}</label>
      <input type="text" :value="modelValue" autocomplete="off" placeholder="eyJhbGciOi… / 0123abcd…"
        @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)">
      <small class="hint">
        {{ t('Get a free key at', 'Obtenez une clé gratuite sur') }}
        <a href="https://www.themoviedb.org/settings/api" target="_blank" rel="noopener">themoviedb.org</a>
        — {{ t('API Read Access Token or v3 key.', 'jeton de lecture API ou clé v3.') }}
      </small>
    </div>
    <div class="form-group">
      <label>{{ t('Language', 'Langue') }}</label>
      <select :value="language" @change="$emit('update:language', ($event.target as HTMLSelectElement).value)">
        <option value="fr-FR">Français</option>
        <option value="en-US">English</option>
      </select>
    </div>
  </fieldset>
</template>

<script setup lang="ts">
import { useI18n } from '../composables/useI18n'

defineProps<{ modelValue: string; language: string }>()
defineEmits<{ (e: 'update:modelValue', v: string): void; (e: 'update:language', v: string): void }>()
const { t } = useI18n()
</script>
