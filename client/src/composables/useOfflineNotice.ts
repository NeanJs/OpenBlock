import { ref } from 'vue'
import { readStoreItem, writeStoreItem } from '../services/storage/persistentStore'

const noticeKey = 'cityfix.offlineNoticeLastSeen.v1'
const cooldownMs = 15 * 60 * 1000

const visible = ref(false)
let hydratePromise: Promise<void> | null = null

export async function hydrateOfflineNotice() {
  if (hydratePromise) {
    return hydratePromise
  }
  hydratePromise = (async () => {
    try {
      const stored = await readStoreItem(noticeKey)
      const lastSeen = stored ? Number(stored) : 0
      const now = Date.now()
      if (!lastSeen || now - lastSeen >= cooldownMs) {
        visible.value = true
      }
    } catch {
      visible.value = true
    }
  })()
  return hydratePromise
}

export function useOfflineNotice() {
  async function dismiss() {
    visible.value = false
    try {
      await writeStoreItem(noticeKey, String(Date.now()))
    } catch {
      // Ignore storage errors; the UI state is already updated.
    }
  }

  function show() {
    visible.value = true
  }

  return {
    visible,
    dismiss,
    show,
  }
}