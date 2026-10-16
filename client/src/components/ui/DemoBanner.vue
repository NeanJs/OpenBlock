<script setup lang="ts">
import { computed } from 'vue'
import { useLocale } from '../../composables/useLocale'
import { isDemoMode } from '../../config/demoMode'

const { t } = useLocale()
const visible = computed(() => isDemoMode())
</script>

<template>
  <Transition name="slide-up">
    <div v-if="visible" class="banner">
      <span>{{ t('demo.banner') }}</span>
    </div>
  </Transition>
</template>

<style scoped>
.banner {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 70;
  background: var(--accent);
  color: var(--text-on-accent, white);
  padding: 0.6rem 1rem;
  display: flex;
  align-items: center;
  gap: 0.6rem;
  font-size: 0.85rem;
  font-weight: 500;
  justify-content: center;
  width: 100%;
}

.slide-up-enter-active,
.slide-up-leave-active {
  transition: transform var(--motion-duration-md) var(--motion-ease);
}

.slide-up-enter-from,
.slide-up-leave-to {
  transform: translateY(100%);
}
</style>