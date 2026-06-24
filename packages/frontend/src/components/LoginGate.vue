<template>
  <div class="login-wrap">
    <form class="card login-card" @submit.prevent="submit">
      <h2>{{ t('Sign in', 'Connexion') }}</h2>
      <p class="hint">{{ t('This NexoTV-Enhanced instance is password protected.', 'Cette instance NexoTV-Enhanced est protégée par mot de passe.') }}</p>

      <div class="form-group password-group">
        <label for="webuiPassword">{{ t('Password', 'Mot de passe') }}</label>
        <div class="pwd-wrapper">
          <input
            :type="show ? 'text' : 'password'"
            id="webuiPassword"
            v-model="password"
            autocomplete="current-password"
            :disabled="loading"
            autofocus
          >
          <button type="button" class="btn tiny ghost" @click="show = !show">{{ show ? t('Hide', 'Cacher') : t('Show', 'Afficher') }}</button>
        </div>
      </div>

      <p v-if="error" class="login-error">{{ error }}</p>

      <div class="form-actions">
        <button class="btn primary" type="submit" :disabled="loading || !password">
          {{ loading ? t('Signing in…', 'Connexion…') : t('Sign in', 'Se connecter') }}
        </button>
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useAuth } from '../composables/useAuth'
import { useI18n } from '../composables/useI18n'

const { login } = useAuth()
const { t } = useI18n()
const password = ref('')
const show = ref(false)
const loading = ref(false)
const error = ref('')

async function submit() {
  if (!password.value || loading.value) return
  error.value = ''
  loading.value = true
  try {
    await login(password.value)
  } catch (e: any) {
    error.value = e.message || 'Login failed'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-wrap {
  min-height: 60vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem 1rem;
}
.login-card {
  width: 100%;
  max-width: 380px;
}
.login-card h2 {
  margin-top: 0;
}
.pwd-wrapper {
  display: flex;
  gap: 0.5rem;
}
.pwd-wrapper input {
  flex: 1;
}
.login-error {
  color: #f87171;
  font-size: 0.9rem;
  margin: 0.5rem 0 0;
}
</style>
