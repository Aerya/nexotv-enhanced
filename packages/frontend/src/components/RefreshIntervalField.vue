<template>
  <fieldset>
    <legend>{{ t('Auto-refresh', 'Mise à jour automatique') }}</legend>
    <div class="info-banner">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4M12 8h.01"></path>
      </svg>
      <span>
        {{ t('How often the addon re-fetches the incoming feed (and thus refreshes the Stremio catalogs).', 'Fréquence à laquelle l\'addon recharge le flux entrant (et rafraîchit donc les catalogues Stremio).') }}
      </span>
    </div>
    <div class="form-group">
      <label>{{ t('Refresh feeds every (hours)', 'Rafraîchir les flux toutes les (heures)') }}</label>
      <input type="number" min="1" max="720" step="1" :value="modelValue ?? ''" placeholder="4"
        @input="onInput">
      <small class="hint">
        {{ t('Leave empty for the server default (4h). Allowed range: 1–720 hours.', 'Laisser vide pour la valeur serveur par défaut (4 h). Plage autorisée : 1 à 720 heures.') }}
      </small>
    </div>
  </fieldset>
</template>

<script setup lang="ts">
import { useI18n } from '../composables/useI18n'

defineProps<{ modelValue: number | null }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: number | null): void }>()
const { t } = useI18n()

function onInput(e: Event) {
  const raw = (e.target as HTMLInputElement).value.trim()
  if (!raw) { emit('update:modelValue', null); return }
  const n = Math.floor(Number(raw))
  emit('update:modelValue', isFinite(n) && n > 0 ? Math.min(Math.max(n, 1), 720) : null)
}
</script>
