<script setup lang="ts">
import { computed, onMounted } from 'vue'
import PageSwitch from './components/layout/PageSwitch.vue'
import BackgroundScene from './components/layout/BackgroundScene.vue'
import OfflineNotice from './components/ui/OfflineNotice.vue'
import { useAuth } from './composables/useAuth'
import { useIssues } from './composables/useIssues'
import { useLocale } from './composables/useLocale'
import { hydrateOfflineNotice } from './composables/useOfflineNotice'
import { useOfflineNotice } from './composables/useOfflineNotice'

const { storeReady } = useIssues()
const { ready: authReady } = useAuth()
const { ready: localeReady, t } = useLocale()
const { visible: offlineVisible, dismiss: dismissOffline } = useOfflineNotice()

const booting = computed(() => !storeReady.value || !authReady.value || !localeReady.value)

onMounted(() => {
  void hydrateOfflineNotice()
})
</script>

<template>
  <div class="shell">
    <BackgroundScene />
    <Transition name="boot" mode="out-in">
      <div v-if="booting" key="boot" class="boot" aria-live="polite">
        <p>{{ t('boot') }}</p>
      </div>
      <div v-else key="app" class="app">
        <PageSwitch layer="layout" />
      </div>
    </Transition>
    <OfflineNotice :open="offlineVisible" @close="dismissOffline" />
  </div>
</template>

<style scoped>
.shell {
  position: relative;
  min-height: 100svh;
  isolation: isolate;
}

.boot {
  position: relative;
  z-index: 1;
  min-height: 100svh;
  display: grid;
  place-items: center;
  color: var(--text-muted);
  font-weight: 600;
}

.app {
  position: relative;
  min-height: 100svh;
  isolation: isolate;
}

.app::before {
  content: '';
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 80;
  height: 3px;
  background: var(--civic-bar);
  pointer-events: none;
}

.boot-enter-active,
.boot-leave-active {
  transition: opacity var(--motion-duration-md) var(--motion-ease);
}

.boot-enter-from,
.boot-leave-to {
  opacity: 0;
}
</style>
