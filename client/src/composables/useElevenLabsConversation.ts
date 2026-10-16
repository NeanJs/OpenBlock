import {
  Conversation,
  VoiceConversation,
  type DisconnectionDetails,
  type Mode,
  type Status,
} from '@elevenlabs/client'
import { computed, onBeforeUnmount, ref } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { elevenLabsAgentId } from '../config/elevenLabsConfig'
import { isDemoMode } from '../config/demoMode'
import { playVoiceCaptureEffect } from '../services/media/voiceCaptureEffects'
import { setVoiceReportHandoff } from '../services/voice/voiceReportHandoff'

export type VoiceStatus = Status
export type VoiceMode = Mode

const emptyFrequency = new Uint8Array(0)
const unmuteDelayMs = 250

function isPermissionError(error: unknown) {
  if (error instanceof DOMException) {
    return error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError'
  }
  const message = error instanceof Error ? error.message : String(error)
  return /notallowed|permission|denied/i.test(message)
}

function isUnavailableError(error: unknown) {
  if (error instanceof DOMException) {
    return (
      error.name === 'NotFoundError' ||
      error.name === 'NotReadableError' ||
      error.name === 'NotSupportedError'
    )
  }
  const message = error instanceof Error ? error.message : String(error)
  return /notfound|not readable|not supported|getusermedia|mediaDevices/i.test(message)
}

function errorKeyFromUnknown(error: unknown) {
  if (isPermissionError(error)) {
    return 'voice.micDenied'
  }
  if (isUnavailableError(error)) {
    return 'voice.unavailable'
  }
  return 'voice.failed'
}

export function useElevenLabsConversation() {
  const status = ref<VoiceStatus>('disconnected')
  const mode = ref<VoiceMode>('listening')
  const errorKey = ref('')
  const starting = ref(false)
  const completedConversationId = ref('')
  const completing = ref(false)

  let session: VoiceConversation | null = null
  let generation = 0
  let unmuteTimer: ReturnType<typeof setTimeout> | null = null
  let muteSequence = 0
  let desiredMicMuted = false
  let activeConversationId = ''
  let liveUserTranscript = ''
  let discardNextDisconnect = false
  let didConnect = false
  let endingSession: Promise<string> | null = null
  let idleWaiters: Array<() => void> = []
  let completeCancelled = false
  const agentIdleTimeoutMs = 20000

  const connected = computed(() => status.value === 'connected')
  const sessionHeld = computed(
    () =>
      status.value === 'connecting' ||
      status.value === 'connected' ||
      status.value === 'disconnecting',
  )

  function readFrequency(kind: 'input' | 'output') {
    if (!session) {
      return emptyFrequency
    }
    try {
      return kind === 'input'
        ? session.getInputByteFrequencyData()
        : session.getOutputByteFrequencyData()
    } catch {
      return emptyFrequency
    }
  }

  function getInputFrequency() {
    return readFrequency('input')
  }

  function getOutputFrequency() {
    return readFrequency('output')
  }

  function rememberConversationId(value: string | undefined) {
    const next = value?.trim() ?? ''
    if (!next || next.startsWith('room_')) {
      return
    }
    activeConversationId = next
  }

  function getConversationId(target: VoiceConversation | null) {
    rememberConversationId(activeConversationId)
    if (target) {
      try {
        rememberConversationId(target.getId())
      } catch {
        /* session already closed */
      }
    }
    return activeConversationId
  }

  function captureUserMessage(message: string | undefined, role: string | undefined) {
    if (role !== 'user') {
      return
    }
    const text = message?.trim() ?? ''
    if (!text) {
      return
    }
    liveUserTranscript = liveUserTranscript ? `${liveUserTranscript}\n\n${text}` : text
  }

  function finishConversation(conversationId: string) {
    const id = conversationId.trim()
    if (!id) {
      return ''
    }
    setVoiceReportHandoff({
      conversationId: id,
      userTranscript: liveUserTranscript,
    })
    completedConversationId.value = id
    completing.value = false
    return id
  }

  function resolveIdleWaiters() {
    const waiters = idleWaiters
    idleWaiters = []
    for (const waiter of waiters) {
      waiter()
    }
  }

  function whenAgentIdle() {
    if (mode.value !== 'speaking') {
      return Promise.resolve()
    }
    return new Promise<void>((resolve) => {
      const timer = window.setTimeout(() => {
        idleWaiters = idleWaiters.filter((waiter) => waiter !== done)
        resolve()
      }, agentIdleTimeoutMs)
      const done = () => {
        window.clearTimeout(timer)
        resolve()
      }
      idleWaiters.push(done)
    })
  }

  function clearUnmuteTimer() {
    if (unmuteTimer !== null) {
      clearTimeout(unmuteTimer)
      unmuteTimer = null
    }
  }

  function resetMicTurnState() {
    clearUnmuteTimer()
    muteSequence += 1
    desiredMicMuted = true
  }

  function syncMicToMode(target: VoiceConversation, token: number) {
    clearUnmuteTimer()
    const sequence = muteSequence + 1
    muteSequence = sequence
    desiredMicMuted = mode.value === 'speaking'

    if (desiredMicMuted) {
      target.setMicMuted(true)
      return
    }

    unmuteTimer = setTimeout(() => {
      unmuteTimer = null
      if (
        sequence !== muteSequence ||
        desiredMicMuted ||
        token !== generation ||
        session !== target
      ) {
        return
      }
      target.setMicMuted(false)
    }, unmuteDelayMs)
  }

  async function startSession() {
    if (starting.value || sessionHeld.value) {
      return
    }
    if (isDemoMode()) {
      starting.value = true
      status.value = 'connecting'
      errorKey.value = ''
      setTimeout(() => {
        status.value = 'connected'
        mode.value = 'listening'
        starting.value = false
        didConnect = true
      }, 400)
      return
    }
    if (!elevenLabsAgentId) {
      errorKey.value = 'voice.unavailable'
      return
    }

    starting.value = true
    errorKey.value = ''
    completing.value = false
    completedConversationId.value = ''
    activeConversationId = ''
    liveUserTranscript = ''
    discardNextDisconnect = false
    didConnect = false
    completeCancelled = false
    endingSession = null
    const token = generation + 1
    generation = token
    status.value = 'connecting'
    mode.value = 'listening'

    try {
      const next = await Conversation.startSession({
        agentId: elevenLabsAgentId,
        connectionType: 'webrtc',
        clientTools: {
          create_report: async () => {
            void endSession()
            return 'The report will be prepared for the resident to review.'
          },
          createReport: async () => {
            void endSession()
            return 'The report will be prepared for the resident to review.'
          },
          file_report: async () => {
            void endSession()
            return 'The report will be prepared for the resident to review.'
          },
        },
        onConversationCreated: (created) => {
          if (token !== generation || created.type !== 'voice') {
            return
          }
          session = created
          rememberConversationId(created.getId())
          syncMicToMode(created, token)
        },
        onConnect: ({ conversationId }) => {
          if (token !== generation) {
            return
          }
          rememberConversationId(conversationId)
        },
        onConversationMetadata: (metadata) => {
          if (token !== generation) {
            return
          }
          const record = metadata as { conversation_id?: string; conversationId?: string }
          rememberConversationId(record.conversation_id || record.conversationId)
        },
        onMessage: ({ message, role }) => {
          if (token !== generation) {
            return
          }
          captureUserMessage(message, role)
        },
        onUnhandledClientToolCall: () => {
          if (token !== generation) {
            return
          }
          void endSession()
        },
        onStatusChange: ({ status: nextStatus }) => {
          if (token !== generation) {
            return
          }
          const prev = status.value
          status.value = nextStatus
          if (prev !== 'connected' && nextStatus === 'connected') {
            didConnect = true
            playVoiceCaptureEffect('start')
          }
        },
        onModeChange: ({ mode: nextMode }) => {
          if (token !== generation) {
            return
          }
          mode.value = nextMode
          if (nextMode !== 'speaking') {
            resolveIdleWaiters()
          }
          if (session) {
            syncMicToMode(session, token)
          }
        },
        onError: (message) => {
          if (token !== generation) {
            return
          }
          if (didConnect || /end_call|disconnect|closed/i.test(message)) {
            return
          }
          errorKey.value = 'voice.failed'
        },
        onDisconnect: (details: DisconnectionDetails) => {
          if (token !== generation) {
            return
          }
          const conversationId = getConversationId(session)
          resetMicTurnState()
          session = null
          status.value = 'disconnected'
          mode.value = 'listening'
          starting.value = false
          resolveIdleWaiters()
          if (discardNextDisconnect) {
            discardNextDisconnect = false
            completing.value = false
            return
          }
          if (details.reason === 'user') {
            return
          }
          finishConversation(conversationId)
        },
      })

      if (token !== generation) {
        resetMicTurnState()
        await next.endSession()
        return
      }

      if (next.type !== 'voice') {
        await next.endSession()
        resetMicTurnState()
        session = null
        status.value = 'disconnected'
        errorKey.value = 'voice.failed'
        return
      }

      session = next
    } catch (error) {
      if (token !== generation) {
        return
      }
      resetMicTurnState()
      session = null
      status.value = 'disconnected'
      mode.value = 'listening'
      errorKey.value = errorKeyFromUnknown(error)
    } finally {
      if (token === generation) {
        starting.value = false
      }
    }
  }

  async function closeSession(options: { discard?: boolean } = {}) {
    generation += 1
    starting.value = false
    const current = session
    const conversationId = getConversationId(current)
    discardNextDisconnect = Boolean(options.discard)
    resetMicTurnState()
    resolveIdleWaiters()
    current?.setMicMuted(true)
    session = null
    status.value = 'disconnected'
    mode.value = 'listening'
    if (current) {
      playVoiceCaptureEffect('send')
      try {
        await current.endSession()
      } catch {
        /* already closed */
      }
    }
    if (options.discard) {
      completing.value = false
      return ''
    }
    return finishConversation(conversationId)
  }

  async function endSession(options: { discard?: boolean } = {}) {
    if (options.discard) {
      completeCancelled = true
      endingSession = null
      return closeSession({ discard: true })
    }
    if (isDemoMode()) {
      const demoId = 'conv-001'
      setVoiceReportHandoff({
        conversationId: demoId,
        userTranscript: 'I need to report a pothole on Granville Street near Davie Street.',
      })
      completedConversationId.value = demoId
      completing.value = false
      return demoId
    }
    if (endingSession) {
      return endingSession
    }
    completeCancelled = false
    completing.value = true
    const pending = (async () => {
      await whenAgentIdle()
      if (completeCancelled) {
        completing.value = false
        return ''
      }
      if (completedConversationId.value) {
        completing.value = false
        return completedConversationId.value
      }
      if (!session) {
        return finishConversation(getConversationId(null))
      }
      return closeSession()
    })()
    endingSession = pending
    try {
      return await pending
    } finally {
      if (endingSession === pending) {
        endingSession = null
      }
    }
  }

  onBeforeRouteLeave(() => {
    void endSession({ discard: true })
  })

  onBeforeUnmount(() => {
    void endSession({ discard: true })
  })

  return {
    status,
    mode,
    errorKey,
    starting,
    connected,
    sessionHeld,
    completedConversationId,
    completing,
    startSession,
    endSession,
    getInputFrequency,
    getOutputFrequency,
  }
}
