<template>
  <div class="app-container">
    <TheHeader />

    <!-- Password gate: shown when the server requires auth and we're not in. -->
    <LoginGate v-if="auth.state.ready && auth.state.enabled && !auth.state.authenticated" />

    <template v-else-if="auth.state.ready">
    <div v-if="auth.state.enabled" class="logout-bar">
      <button class="btn tiny ghost" @click="auth.logout()">{{ t('Log out', 'Déconnexion') }}</button>
    </div>

    <main class="main-content">
      <section class="config-section">
        <SavedConfigs />
        <div class="card configurator-card">
          <h2>{{ t('Provider', 'Fournisseur') }}</h2>

          <!-- Provider Tabs -->
          <div class="provider-tabs" role="tablist">
            <button class="tab-btn" :class="{ active: activeTab === 'iptv-org' }"
              id="tab-iptv-org" role="tab"
              :aria-selected="activeTab === 'iptv-org'"
              aria-controls="panel-iptv-org"
              @click="activeTab = 'iptv-org'">
              IPTV-org <span class="tab-badge">{{ t('Free', 'Gratuit') }}</span>
            </button>
            <button class="tab-btn" :class="{ active: activeTab === 'xtream' }"
              id="tab-xtream" role="tab"
              :aria-selected="activeTab === 'xtream'"
              aria-controls="panel-xtream"
              @click="activeTab = 'xtream'">
              Xtream API
            </button>
            <button class="tab-btn" :class="{ active: activeTab === 'm3u' }"
              id="tab-m3u" role="tab"
              :aria-selected="activeTab === 'm3u'"
              aria-controls="panel-m3u"
              @click="activeTab = 'm3u'">
              M3U / M3U+
            </button>
            <button class="tab-btn" :class="{ active: activeTab === 'stalker' }"
              id="tab-stalker" role="tab"
              :aria-selected="activeTab === 'stalker'"
              aria-controls="panel-stalker"
              @click="activeTab = 'stalker'">
              Stalker
            </button>
            <button class="tab-btn" :class="{ active: activeTab === 'multi' }"
              id="tab-multi" role="tab"
              :aria-selected="activeTab === 'multi'"
              aria-controls="panel-multi"
              @click="activeTab = 'multi'">
              Multi-source
            </button>
          </div>

          <!-- Tab Panels -->
          <div id="panel-iptv-org" class="tab-panel" :class="{ active: activeTab === 'iptv-org' }"
            role="tabpanel" aria-labelledby="tab-iptv-org">
            <IptvOrgConfig v-if="activeTab === 'iptv-org'" />
          </div>

          <div id="panel-xtream" class="tab-panel" :class="{ active: activeTab === 'xtream' }"
            role="tabpanel" aria-labelledby="tab-xtream">
            <XtreamConfig v-if="activeTab === 'xtream'" />
          </div>

          <div id="panel-m3u" class="tab-panel" :class="{ active: activeTab === 'm3u' }"
            role="tabpanel" aria-labelledby="tab-m3u">
            <M3uConfig v-if="activeTab === 'm3u'" />
          </div>

          <div id="panel-stalker" class="tab-panel" :class="{ active: activeTab === 'stalker' }"
            role="tabpanel" aria-labelledby="tab-stalker">
            <StalkerConfig v-if="activeTab === 'stalker'" />
          </div>

          <div id="panel-multi" class="tab-panel" :class="{ active: activeTab === 'multi' }"
            role="tabpanel" aria-labelledby="tab-multi">
            <MultiSourceConfig v-if="activeTab === 'multi'" />
          </div>
        </div>
      </section>

      <section class="about-section">
        <div class="card about-card">
          <h2>{{ t('About', 'À propos') }}</h2>
          <p>{{ t('Connect your IPTV service to Stremio. Choose from free public channels, your Xtream Codes subscription, or any M3U playlist URL.', 'Connectez votre service IPTV à Stremio. Au choix : chaînes publiques gratuites, abonnement Xtream Codes, ou n\'importe quelle URL de playlist M3U.') }}</p>
          <ul class="feature-list">
            <li><strong>IPTV-org</strong> – {{ t('thousands of free public channels, no credentials needed.', 'des milliers de chaînes publiques gratuites, sans identifiants.') }}</li>
            <li><strong>Xtream API</strong> – {{ t('connects your subscription panel.', 'connecte votre panel d\'abonnement.') }}</li>
            <li><strong>M3U / M3U+</strong> – {{ t('paste any playlist URL; EPG auto-detected from header.', 'collez une URL de playlist ; EPG auto-détecté depuis l\'en-tête.') }}</li>
            <li><strong>{{ t('Multi-source', 'Multi-source') }}</strong> – {{ t('mix several sources with movie/series de-duplication.', 'mixez plusieurs sources avec déduplication films/séries.') }}</li>
            <li><strong>EPG</strong> – {{ t('panel XMLTV, custom XMLTV URL, or auto-detected.', 'XMLTV du panel, URL XMLTV personnalisée, ou auto-détecté.') }}</li>
          </ul>
          <div class="credits">
            <p>
              {{ t('By', 'Par') }} <a href="https://github.com/joaosavi" target="_blank" rel="noopener">joaosavi</a>
              · {{ t('Enhanced by', 'Amélioré par') }} <a href="https://github.com/Aerya/nexotv-enhanced" target="_blank" rel="noopener">Aerya</a>
            </p>
          </div>
        </div>
      </section>
    </main>

    <TheOverlay
      :visible="poll.visible.value"
      :progress="poll.progress.value"
      :message="poll.message.value"
      :details="poll.details.value"
      :manifestUrl="poll.manifestUrl.value"
      :stremioUrl="poll.stremioUrl.value"
      :isReady="poll.isReady.value"
      @close="poll.hideOverlay()"
    />
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, provide, onMounted } from 'vue'
import TheHeader from './components/TheHeader.vue'
import TheOverlay from './components/TheOverlay.vue'
import LoginGate from './components/LoginGate.vue'
import SavedConfigs from './components/SavedConfigs.vue'
import XtreamConfig from './components/XtreamConfig.vue'
import IptvOrgConfig from './components/IptvOrgConfig.vue'
import M3uConfig from './components/M3uConfig.vue'
import StalkerConfig from './components/StalkerConfig.vue'
import MultiSourceConfig from './components/MultiSourceConfig.vue'
import { useManifestPoll } from './composables/useManifestPoll'
import { useConfigToken } from './composables/useConfigToken'
import { useDecodedToken } from './composables/useDecodedToken'
import { useAuth } from './composables/useAuth'
import { useI18n } from './composables/useI18n'
import type { Provider } from './types/config'

const poll = useManifestPoll()
const { buildUrls } = useConfigToken(poll.appendDetail)
const auth = useAuth()
const { t } = useI18n()

// Provide overlay control to all child components
provide('overlayControl', {
  showOverlay: poll.showOverlay,
  hideOverlay: poll.hideOverlay,
  appendDetail: poll.appendDetail,
  setProgress: poll.setProgress,
  startPolling: poll.startPolling,
  markError: poll.markError,
  buildUrls,
})

// Active tab state — default to iptv-org
const activeTab = ref<Provider>('iptv-org')

// Check auth status on load (shows the login gate if required).
onMounted(() => { auth.recheck() })

// Reconfiguration: switch to the correct tab based on the decoded token
onMounted(() => {
  const { decodedConfig } = useDecodedToken()
  if (decodedConfig && (decodedConfig as any).sources?.length) {
    activeTab.value = 'multi'
  } else if (decodedConfig && decodedConfig.provider) {
    activeTab.value = decodedConfig.provider as Provider
  }
})
</script>

<style scoped>
.logout-bar {
  display: flex;
  justify-content: flex-end;
  max-width: 960px;
  margin: 0.5rem auto -0.5rem;
  padding: 0 1rem;
}
</style>
