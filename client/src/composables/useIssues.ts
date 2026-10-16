import { computed, ref } from 'vue'
import { adminReportsUrl, reportTrackUrl } from '../config/apiConfig'
import { useAuth } from './useAuth'
import {
  getAdminReport,
  listReports,
  trackReport,
  updateReportStatus,
  type RemoteReport,
} from '../services/api/reportsApi'
import { ApiRequestError } from '../services/api/apiRequestError'
import { getAccessToken, getCurrentUser } from '../services/auth/authService'
import { createTrackingId, trackingIdFromInternal } from '../services/report/enrichReport'
import { isOpenStatus, normalizeStatus } from '../services/report/statusFlow'
import { readStoreItem, writeStoreItem } from '../services/storage/persistentStore'
import { defaultIssueType, normalizeIssueType } from '../services/report/issueType'
import { classifyIssueInput } from '../services/report/reportInputKind'
import { normalizeSeverity } from '../services/report/severity'
import { isDemoMode } from '../config/demoMode'
import { getMockIssues } from '../services/mock/mockData'
import type { Issue, IssueStatus, NewIssueInput } from '../types/issue'

const storageKey = 'cityfix.issues.v1'

const issues = ref<Issue[]>([])
const hydrated = ref(false)
const storeReady = ref(false)
let bootstrapPromise: Promise<void> | null = null
const statusUpdates = new Set<string>()
type StaffLoadStatus = 'idle' | 'loading' | 'ready' | 'error'
const staffLoadStatus = ref<StaffLoadStatus>('idle')

async function persist() {
  await writeStoreItem(storageKey, JSON.stringify(issues.value))
}

function createId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `issue-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function isoTimestamp(value: string | undefined) {
  if (!value) {
    return null
  }
  const time = new Date(value).getTime()
  if (Number.isNaN(time)) {
    return null
  }
  return time
}

function remoteReportIsNewerThanLocal(current: Issue, remote: RemoteReport) {
  const remoteMs = isoTimestamp(remote.updatedAt)
  if (remoteMs === null) {
    return false
  }
  const localMs = isoTimestamp(current.updatedAt)
  if (localMs === null) {
    return true
  }
  return remoteMs > localMs
}

function normalizeIssue(
  issue: Issue & { category?: string; audioDataUrl?: string },
): Issue {
  const description = issue.description?.trim() ?? ''
  const transcript = issue.transcript?.trim() ?? ''
  const legacyCategory = typeof issue.category === 'string' ? issue.category : ''
  const issueType = normalizeIssueType(issue.issueType ?? legacyCategory ?? defaultIssueType)
  const { category: _legacy, audioDataUrl, ...rest } = issue
  return {
    ...rest,
    issueType,
    remoteId: issue.remoteId?.trim() || undefined,
    trackingId: issue.trackingId || trackingIdFromInternal(issue.id),
    reporterId: issue.reporterId ?? '',
    transcript,
    summary: issue.summary?.trim() || description || transcript,
    severity: normalizeSeverity(typeof issue.severity === 'string' ? issue.severity : ''),
    status: normalizeStatus(typeof issue.status === 'string' ? issue.status : ''),
    photoDataUrl: issue.photoDataUrl,
    audioUrl: issue.audioUrl || audioDataUrl,
    inputKind: classifyIssueInput({
      inputKind: issue.inputKind,
      photoDataUrl: issue.photoDataUrl,
      audioUrl: issue.audioUrl || audioDataUrl,
      transcript,
    }),
  }
}

function findRemoteIndex(remote: RemoteReport) {
  if (remote.remoteId) {
    const byRemote = issues.value.findIndex((issue) => issue.remoteId === remote.remoteId)
    if (byRemote >= 0) {
      return byRemote
    }
  }
  const trackingId = remote.trackingId.trim().toLowerCase()
  if (!trackingId) {
    return -1
  }
  return issues.value.findIndex((issue) => issue.trackingId.toLowerCase() === trackingId)
}

export async function bootstrapIssues() {
  if (bootstrapPromise) {
    return bootstrapPromise
  }
  bootstrapPromise = (async () => {
    if (hydrated.value) {
      storeReady.value = true
      return
    }
    hydrated.value = true
    try {
      const raw = await readStoreItem(storageKey)
      if (raw) {
        const parsed = JSON.parse(raw) as Issue[]
        if (Array.isArray(parsed)) {
          issues.value = parsed.map(normalizeIssue)
        }
      }
    } catch {
      issues.value = []
    }
    if (isDemoMode() && issues.value.length === 0) {
      issues.value = getMockIssues()
      await persist()
    }
    storeReady.value = true
  })()
  return bootstrapPromise
}

export function useIssues() {
  const sortedIssues = computed(() =>
    [...issues.value].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    ),
  )

  const openCount = computed(
    () => issues.value.filter((issue) => isOpenStatus(issue.status)).length,
  )

  const resolvedCount = computed(
    () => issues.value.filter((issue) => issue.status === 'resolved').length,
  )

  const highSeverityCount = computed(
    () =>
      issues.value.filter(
        (issue) => issue.severity === 'high' && isOpenStatus(issue.status),
      ).length,
  )

  function issuesForReporter(reporterId: string) {
    return sortedIssues.value.filter((issue) => issue.reporterId === reporterId)
  }

  function issuesCreatedOn(day: Date) {
    const start = new Date(day)
    start.setHours(0, 0, 0, 0)
    const end = new Date(start)
    end.setDate(end.getDate() + 1)
    return issues.value.filter((issue) => {
      const created = new Date(issue.createdAt).getTime()
      return created >= start.getTime() && created < end.getTime()
    })
  }

  async function addIssue(input: NewIssueInput) {
    const now = new Date().toISOString()
    const issue: Issue = {
      id: createId(),
      remoteId: input.remoteId?.trim() || undefined,
      trackingId:
        input.trackingId?.trim() || createTrackingId(issues.value.map((item) => item.trackingId)),
      title: input.title?.trim() || input.summary.trim(),
      description: input.description.trim(),
      transcript: input.transcript?.trim() ?? '',
      summary: input.summary.trim(),
      issueType: normalizeIssueType(input.issueType),
      severity: input.severity,
      status: input.status ?? 'queued',
      locationLabel: input.locationLabel.trim(),
      latitude: input.latitude,
      longitude: input.longitude,
      photoDataUrl: input.photoDataUrl,
      audioUrl: input.audioUrl,
      inputKind: classifyIssueInput({
        inputKind: input.inputKind,
        photoDataUrl: input.photoDataUrl,
        audioUrl: input.audioUrl,
        transcript: input.transcript,
      }),
      recommendedAction: input.recommendedAction?.trim() || undefined,
      reporterId: input.reporterId,
      createdAt: now,
      updatedAt: now,
    }
    issues.value = [issue, ...issues.value]
    await persist()
    return issue
  }

  async function handleUnauthorized() {
    const { logout } = useAuth()
    await logout()
    const { router } = await import('../router')
    if (router.currentRoute.value.path !== '/login') {
      await router.replace('/login')
    }
  }

  function isUnauthorized(error: unknown) {
    return error instanceof ApiRequestError && error.code === 'unauthorized'
  }

  async function requireStaffToken() {
    if (isDemoMode()) {
      return 'demo-token'
    }
    const token = await getAccessToken()
    if (!token) {
      await handleUnauthorized()
      return ''
    }
    return token
  }

  async function loadStaffReports() {
    if (isDemoMode()) {
      staffLoadStatus.value = 'loading'
      try {
        const remotes = await listReports('demo-token')
        for (const remote of remotes) {
          await saveRemoteReport(remote, 'demo-user', true)
        }
        staffLoadStatus.value = 'ready'
      } catch {
        staffLoadStatus.value = 'error'
      }
      return
    }
    if (!adminReportsUrl) {
      staffLoadStatus.value = 'ready'
      return
    }
    staffLoadStatus.value = 'loading'
    const token = await requireStaffToken()
    if (!token) {
      staffLoadStatus.value = 'error'
      return
    }
    try {
      const remotes = await listReports(token)
      for (const remote of remotes) {
        await saveRemoteReport(remote, getCurrentUser()?.id ?? '', true)
      }
      staffLoadStatus.value = 'ready'
    } catch (error) {
      if (isUnauthorized(error)) {
        await handleUnauthorized()
      }
      staffLoadStatus.value = 'error'
    }
  }

  async function loadStaffReport(reportId: string) {
    const id = reportId.trim()
    if (!id) {
      return null
    }
    if (isDemoMode()) {
      try {
        const remote = await getAdminReport(id, 'demo-token')
        return saveRemoteReport(remote, 'demo-user', true)
      } catch {
        return null
      }
    }
    if (!adminReportsUrl) {
      return null
    }
    const token = await requireStaffToken()
    if (!token) {
      return null
    }
    try {
      const remote = await getAdminReport(id, token)
      return saveRemoteReport(remote, getCurrentUser()?.id ?? '', true)
    } catch (error) {
      if (isUnauthorized(error)) {
        await handleUnauthorized()
      }
      throw error
    }
  }

  async function updateStatus(id: string, status: IssueStatus) {
    if (statusUpdates.has(id)) {
      return false
    }
    const index = issues.value.findIndex((issue) => issue.id === id)
    if (index === -1) {
      return false
    }
    const current = issues.value[index]
    const staff = getCurrentUser()?.role === 'staff'
    statusUpdates.add(id)
    try {
      if (staff && adminReportsUrl) {
        const remoteId = current.remoteId?.trim()
        if (!remoteId) {
          return false
        }
        const token = await requireStaffToken()
        if (!token) {
          return false
        }
        try {
          const remote = await updateReportStatus(remoteId, status, token)
          if (remote) {
            await saveRemoteReport(remote, current.reporterId, true)
            return true
          }
        } catch (error) {
          if (isUnauthorized(error)) {
            await handleUnauthorized()
          }
          return false
        }
      }
      const next = { ...current, status, updatedAt: new Date().toISOString() }
      issues.value = [
        ...issues.value.slice(0, index),
        next,
        ...issues.value.slice(index + 1),
      ]
      await persist()
      return true
    } finally {
      statusUpdates.delete(id)
    }
  }

  function getIssue(id: string) {
    return issues.value.find((issue) => issue.id === id)
  }

  function getIssueByTrackingId(trackingId: string) {
    const needle = trackingId.trim().toLowerCase()
    if (!needle) {
      return undefined
    }
    return issues.value.find((issue) => issue.trackingId.toLowerCase() === needle)
  }

  function isoOr(value: string | undefined, fallback: string) {
    if (!value) {
      return fallback
    }
    const time = new Date(value).getTime()
    if (Number.isNaN(time)) {
      return fallback
    }
    return new Date(time).toISOString()
  }

  async function saveRemoteReport(remote: RemoteReport, ownerId: string, preferRemote = false) {
    const now = new Date().toISOString()
    const index = findRemoteIndex(remote)
    if (index >= 0) {
      const current = issues.value[index]
      if (remote.partial) {
        const next: Issue = {
          ...current,
          remoteId: remote.remoteId || current.remoteId,
          trackingId: remote.trackingId || current.trackingId,
          status: remote.status,
          updatedAt: isoOr(remote.updatedAt, now),
        }
        issues.value = [
          ...issues.value.slice(0, index),
          next,
          ...issues.value.slice(index + 1),
        ]
        await persist()
        return next
      }
      const acceptRemoteStatus = preferRemote || remoteReportIsNewerThanLocal(current, remote)
      const next: Issue = {
        ...current,
        remoteId: remote.remoteId || current.remoteId,
        trackingId: remote.trackingId || current.trackingId,
        title: remote.title || current.title,
        description: remote.description || current.description,
        transcript: remote.transcript || current.transcript,
        summary: remote.summary || current.summary,
        issueType: remote.issueType,
        severity: remote.severity,
        status: acceptRemoteStatus ? remote.status : current.status,
        locationLabel: remote.locationLabel || current.locationLabel,
        latitude: remote.latitude ?? current.latitude,
        longitude: remote.longitude ?? current.longitude,
        photoDataUrl: current.photoDataUrl || remote.photoUrl,
        audioUrl: current.audioUrl || remote.audioUrl,
        inputKind: classifyIssueInput({
          inputKind: current.inputKind,
          photoDataUrl: current.photoDataUrl || remote.photoUrl,
          audioUrl: current.audioUrl || remote.audioUrl,
          transcript: remote.transcript || current.transcript,
        }),
        recommendedAction: remote.recommendedAction || current.recommendedAction,
        createdAt: isoOr(remote.createdAt, current.createdAt),
        updatedAt: acceptRemoteStatus
          ? isoOr(remote.updatedAt, current.updatedAt)
          : current.updatedAt,
      }
      issues.value = [
        ...issues.value.slice(0, index),
        next,
        ...issues.value.slice(index + 1),
      ]
      await persist()
      return next
    }
    if (remote.partial || !remote.trackingId) {
      return null
    }
    const createdAt = isoOr(remote.createdAt, now)
    const issue: Issue = {
      id: createId(),
      remoteId: remote.remoteId,
      trackingId: remote.trackingId,
      title: remote.title,
      description: remote.description,
      transcript: remote.transcript,
      summary: remote.summary,
      issueType: remote.issueType,
      severity: remote.severity,
      status: remote.status,
      locationLabel: remote.locationLabel,
      latitude: remote.latitude,
      longitude: remote.longitude,
      photoDataUrl: remote.photoUrl,
      audioUrl: remote.audioUrl,
      inputKind: classifyIssueInput({
        photoDataUrl: remote.photoUrl,
        audioUrl: remote.audioUrl,
        transcript: remote.transcript,
      }),
      recommendedAction: remote.recommendedAction,
      reporterId: ownerId,
      createdAt,
      updatedAt: isoOr(remote.updatedAt, createdAt),
    }
    issues.value = [issue, ...issues.value]
    await persist()
    return issue
  }

  async function syncTrackedReport(trackingId: string, ownerId: string) {
    const id = trackingId.trim()
    if (!id) {
      return null
    }
    if (!reportTrackUrl(id)) {
      return getIssueByTrackingId(id) ?? null
    }
    const remote = await trackReport(id)
    return saveRemoteReport(remote, ownerId)
  }

  return {
    storeReady,
    staffLoadStatus,
    issues: sortedIssues,
    openCount,
    resolvedCount,
    highSeverityCount,
    issuesForReporter,
    issuesCreatedOn,
    addIssue,
    loadStaffReports,
    loadStaffReport,
    updateStatus,
    getIssue,
    getIssueByTrackingId,
    syncTrackedReport,
  }
}
