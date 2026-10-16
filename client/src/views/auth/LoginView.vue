<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import AppIcon from '../../components/ui/AppIcon.vue'
import GlassPanel from '../../components/ui/GlassPanel.vue'
import { pageTitleIconForRoute } from '../../config/nav'
import { isDemoMode } from '../../config/demoMode'
import { useAuth } from '../../composables/useAuth'
import { useLocale } from '../../composables/useLocale'
import { AuthError, homePathForRole } from '../../services/auth/authService'

const { t } = useLocale()
const titleIcon = pageTitleIconForRoute('login')
const { login } = useAuth()
const router = useRouter()

const email = ref('')
const password = ref('')
const submitting = ref(false)
const errorKey = ref('')

onMounted(() => {
  if (isDemoMode()) {
    email.value = `admin-${Math.random().toString(36).slice(2, 8)}@demo.local`
    password.value = Math.random().toString(36).slice(2, 12)
    setTimeout(() => signIn(email.value, password.value), 300)
  }
})

async function signIn(nextEmail: string, nextPassword: string) {
  if (submitting.value) {
    return
  }
  errorKey.value = ''
  submitting.value = true
  try {
    const user = await login(nextEmail, nextPassword)
    await router.replace(homePathForRole(user.role))
  } catch (error) {
    errorKey.value =
      error instanceof AuthError ? `auth.errors.${error.code}` : 'auth.errors.invalidCredentials'
  } finally {
    submitting.value = false
  }
}

function submit() {
  return signIn(email.value, password.value)
}
</script>

<template>
  <GlassPanel padding="lg" tone="fill" class="card">
    <div class="title-row">
      <AppIcon
        v-if="titleIcon"
        class="title-icon"
        :name="titleIcon"
        size="2.15rem"
        weight="duotone"
      />
      <h1 class="title">{{ t('auth.signIn') }}</h1>
    </div>
    <p class="lead">{{ t('auth.loginLead') }}</p>

    <RouterLink class="btn skip" to="/report">{{ t('auth.toReport') }}</RouterLink>

    <form class="form" @submit.prevent="submit">
      <label class="field">
        <span class="field-label">{{ t('auth.email') }}</span>
        <input
          v-model="email"
          class="control"
          type="email"
          autocomplete="email"
          inputmode="email"
          required
        />
      </label>
      <label class="field">
        <span class="field-label">{{ t('auth.password') }}</span>
        <input
          v-model="password"
          class="control"
          type="password"
          autocomplete="current-password"
          required
        />
      </label>
      <p v-if="errorKey" class="error" role="alert">{{ t(errorKey) }}</p>
      <button type="submit" class="btn submit" :disabled="submitting">
        {{ submitting ? t('auth.submitting') : t('auth.submitLogin') }}
      </button>
    </form>
  </GlassPanel>
</template>

<style scoped>
.card {
  width: min(100%, 26rem);
  display: grid;
  gap: 0.9rem;
}

.title-row {
  display: flex;
  align-items: center;
  gap: 0.65rem;
}

.title-icon {
  color: var(--accent);
  opacity: 0.95;
  flex-shrink: 0;
}

.title {
  margin: 0;
  font-size: 2.25rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  font-family: var(--font-display);
  color: var(--text-h);
}

.lead {
  margin: 0;
  color: var(--text-muted);
  font-size: 0.95rem;
}

.form {
  display: grid;
  gap: 0.8rem;
}

.field {
  display: grid;
  gap: 0.35rem;
}

.submit {
  width: 100%;
}

.skip {
  width: 100%;
  text-decoration: none;
}

.error {
  margin: 0;
  font-size: 0.82rem;
  color: var(--danger);
}
</style>
