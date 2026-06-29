<template>
  <header class="app-header">
    <div class="header-inner">
      <div v-if="loading" class="header-skeleton">
        <div class="skeleton-icon"></div>
        <div class="skeleton-lines">
          <div class="skeleton-line w-48"></div>
          <div class="skeleton-line w-32"></div>
        </div>
      </div>
      <div v-else class="header-content">
        <img
          v-if="info?.logoUrl"
          :src="info.logoUrl"
          class="addon-logo"
          alt="Addon Logo"
          @error="(e) => (e.target as HTMLImageElement).style.display = 'none'"
          style="border-radius: 22%"
        >
        <div class="header-text">
          <h1 class="app-title">{{ info?.name }}</h1>
          <p class="subtitle">{{ info?.description }}</p>
        </div>
        <div class="header-actions">
          <div class="lang-switch">
            <button type="button" class="lang-btn" :class="{ active: i18n.state.lang === 'en' }"
              @click="i18n.setLang('en')">EN</button>
            <button type="button" class="lang-btn" :class="{ active: i18n.state.lang === 'fr' }"
              @click="i18n.setLang('fr')">FR</button>
          </div>
          <button v-if="auth.state.enabled && auth.state.authenticated" type="button"
            class="logout-btn" @click="auth.logout()">
            {{ t('Log out', 'Déconnexion') }}
          </button>
        </div>
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import { useAddonInfo } from '../composables/useAddonInfo'
import { useI18n } from '../composables/useI18n'
import { useAuth } from '../composables/useAuth'

const { info, loading } = useAddonInfo()
const i18n = useI18n()
const auth = useAuth()
const { t } = useI18n()
</script>

<style scoped>
.header-actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  align-self: flex-start;
}
.lang-switch {
  display: flex;
  gap: 0.25rem;
}
.logout-btn {
  font-size: 0.72rem;
  font-weight: 600;
  padding: 0.15rem 0.55rem;
  border-radius: 6px;
  border: 1px solid rgba(248, 113, 113, 0.4);
  background: rgba(248, 113, 113, 0.12);
  color: #f87171;
  cursor: pointer;
}
.logout-btn:hover { background: rgba(248, 113, 113, 0.2); }
.lang-btn {
  font-size: 0.72rem;
  font-weight: 600;
  padding: 0.15rem 0.5rem;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: transparent;
  color: inherit;
  cursor: pointer;
  opacity: 0.6;
}
.lang-btn.active {
  opacity: 1;
  background: rgba(99, 102, 241, 0.22);
  border-color: rgba(99, 102, 241, 0.5);
}
</style>
