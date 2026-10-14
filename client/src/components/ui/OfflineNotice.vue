<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { useMotionScope } from '../../motion/useMotionScope'
import { dismissSurface, presentSurface } from '../../motion/transitions'
import AppIcon from './AppIcon.vue'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

const overlayRef = ref<HTMLElement | null>(null)
const cardRef = ref<HTMLElement | null>(null)
const rendered = ref(false)
let generation = 0
const { run } = useMotionScope(overlayRef)

function setBodyScrollLocked(locked: boolean) {
  document.body.style.overflow = locked ? 'hidden' : ''
}

async function show() {
  const gen = ++generation
  rendered.value = true
  setBodyScrollLocked(true)
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  if (gen !== generation) {
    return
  }
  const overlay = overlayRef.value
  const card = cardRef.value
  if (!overlay || !card) {
    return
  }
  run(() => {
    presentSurface(overlay, card, 'center')
  })
}

async function hide() {
  const gen = ++generation
  setBodyScrollLocked(false)
  const overlay = overlayRef.value
  const card = cardRef.value
  const finish = () => {
    if (gen !== generation) {
      return
    }
    rendered.value = false
  }
  if (!overlay || !card) {
    await finish()
    return
  }
  run(() => {
    const tween = dismissSurface(overlay, card, 'center')
    if (!tween) {
      void finish()
      return
    }
    tween.eventCallback('onComplete', () => {
      void finish()
    })
  })
}

function onBackdropClick(event: MouseEvent) {
  if (event.target === event.currentTarget) {
    emit('close')
  }
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    emit('close')
  }
}

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      void show()
      return
    }
    if (rendered.value) {
      void hide()
    }
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  generation += 1
  setBodyScrollLocked(false)
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="rendered"
      ref="overlayRef"
      class="overlay"
      role="dialog"
      aria-modal="true"
      aria-label="OpenBlock demo notice"
      tabindex="-1"
      @click="onBackdropClick"
      @keydown="onKeydown"
    >
      <div ref="cardRef" class="card" @click.stop>
        <button type="button" class="close" :aria-label="'Close notice'" @click="emit('close')">
          <AppIcon name="x" size="1rem" />
        </button>
        <div class="body">
          <p class="message">
            The OpenBlock demo is currently offline and may not function as expected. Please keep this in
            mind as you proceed. Thank you for your interest!
          </p>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  z-index: 120;
  display: grid;
  place-items: center;
  background: rgba(9, 9, 10, 0.42);
  backdrop-filter: blur(2px);
}

.card {
  position: relative;
  width: min(26rem, calc(100vw - 2rem));
  padding: 1.4rem 1.5rem 1.5rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface-raised-solid);
  color: var(--text);
  box-shadow: 0 18px 56px rgba(9, 9, 10, 0.22);
  isolation: isolate;
}

.close {
  position: absolute;
  top: 0.55rem;
  right: 0.55rem;
  width: 2.4rem;
  height: 2.4rem;
  display: grid;
  place-items: center;
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
  background: var(--surface-solid);
  color: var(--text-h);
  cursor: pointer;
}

.body {
  display: grid;
  gap: 0.35rem;
}

.message {
  margin: 0;
  font-size: 0.95rem;
  line-height: 1.5;
  color: var(--text);
}

@media (min-width: 640px) {
  .card {
    padding: 1.6rem 1.75rem 1.75rem;
  }
}
</style>