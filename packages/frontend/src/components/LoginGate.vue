<template>
  <div class="login-wrap">
    <form class="card login-card" @submit.prevent="submit">
      <h2>Sign in</h2>
      <p class="hint">This NexoTV-Enhanced instance is password protected.</p>

      <div class="form-group password-group">
        <label for="webuiPassword">Password</label>
        <div class="pwd-wrapper">
          <input
            :type="show ? 'text' : 'password'"
            id="webuiPassword"
            v-model="password"
            autocomplete="current-password"
            :disabled="loading"
            autofocus
          >
          <button type="button" class="btn tiny ghost" @click="show = !show">{{ show ? 'Hide' : 'Show' }}</button>
        </div>
      </div>

      <p v-if="error" class="login-error">{{ error }}</p>

      <div class="form-actions">
        <button class="btn primary" type="submit" :disabled="loading || !password">
          {{ loading ? 'Signing in…' : 'Sign in' }}
        </button>
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useAuth } from '../composables/useAuth'

const { login } = useAuth()
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
