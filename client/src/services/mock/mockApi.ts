import type { Issue, IssueStatus } from '../../types/issue'
import type { ReportIngestDraft, ReportIngestInput } from '../../types/reportIngest'
import type { CreateReportInput, RemoteReport } from '../api/reportsApi'
import { ApiRequestError } from '../api/apiRequestError'
import { readStoreItem, writeStoreItem } from '../storage/persistentStore'
import { conversationTranscripts, mockIssues } from './mockData'

const storageKey = 'cityfix.issues.v1'

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function getLocalIssues(): Promise<Issue[]> {
  const raw = await readStoreItem(storageKey)
  if (raw) {
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        return parsed as Issue[]
      }
    } catch {
      // ignore
    }
  }
  return [...mockIssues]
}

async function saveLocalIssues(issues: Issue[]): Promise<void> {
  await writeStoreItem(storageKey, JSON.stringify(issues))
}

export function issueToRemoteReport(issue: Issue): RemoteReport {
  return {
    remoteId: issue.remoteId || issue.id,
    trackingId: issue.trackingId,
    title: issue.title,
    description: issue.description,
    transcript: issue.transcript,
    summary: issue.summary,
    issueType: issue.issueType,
    severity: issue.severity,
    status: issue.status,
    locationLabel: issue.locationLabel,
    latitude: issue.latitude,
    longitude: issue.longitude,
    photoUrl: issue.photoDataUrl,
    audioUrl: issue.audioUrl,
    recommendedAction: issue.recommendedAction || 'Investigate reported issue',
    createdAt: issue.createdAt,
    updatedAt: issue.updatedAt,
  }
}

export async function mockListReports(): Promise<RemoteReport[]> {
  await delay(1725)
  const issues = await getLocalIssues()
  return issues.map(issueToRemoteReport)
}

export async function mockGetAdminReport(reportId: string): Promise<RemoteReport> {
  await delay(1035)
  const issues = await getLocalIssues()
  const found = issues.find(
    (i) => i.id === reportId || i.remoteId === reportId || i.trackingId === reportId,
  )
  if (found) {
    return issueToRemoteReport(found)
  }
  throw new ApiRequestError('not-found')
}

export async function mockUpdateReportStatus(
  reportId: string,
  status: IssueStatus,
): Promise<RemoteReport | null> {
  await delay(1380)
  const issues = await getLocalIssues()
  const found = issues.find(
    (i) => i.id === reportId || i.remoteId === reportId || i.trackingId === reportId,
  )
  if (!found) {
    return null
  }
  found.status = status
  found.updatedAt = new Date().toISOString()
  await saveLocalIssues(issues)
  return issueToRemoteReport(found)
}

export async function mockCreateReport(input: CreateReportInput): Promise<RemoteReport> {
  await delay(2070)
  const issues = await getLocalIssues()
  const id = `issue-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  const trackingId = `CF-${Math.floor(1000 + Math.random() * 9000)}`
  const now = new Date().toISOString()
  const newIssue: Issue = {
    id,
    trackingId,
    title: input.title || 'New Civic Report',
    description: input.description || '',
    transcript: input.transcript || '',
    summary: input.description || input.title || '',
    issueType: input.issueType || 'other',
    severity: (input.severity as Issue['severity']) || 'medium',
    status: 'queued',
    locationLabel: input.locationDescription || 'City Center',
    latitude: input.latitude,
    longitude: input.longitude,
    photoDataUrl: input.photoUrl,
    audioUrl: input.audioUrl,
    recommendedAction: input.recommendedAction || 'Investigate reported issue',
    reporterId: 'demo-user',
    createdAt: now,
    updatedAt: now,
  }
  issues.unshift(newIssue)
  await saveLocalIssues(issues)
  return issueToRemoteReport(newIssue)
}

export async function mockTrackReport(trackingId: string): Promise<RemoteReport> {
  await delay(1380)
  const cleanId = trackingId.trim().toUpperCase()
  const issues = await getLocalIssues()
  const found = issues.find(
    (i) => i.trackingId.toUpperCase() === cleanId || i.id === trackingId,
  )
  if (found) {
    return issueToRemoteReport(found)
  }
  throw new ApiRequestError('not-found')
}

export async function mockIngestReport(input: ReportIngestInput): Promise<ReportIngestDraft> {
  await delay(2760)
  const text = input.text?.trim() || ''
  const locationLabel = input.locationLabel?.trim() || 'Granville & Davie Street'
  
  let issueType = 'pothole'
  let severity: Issue['severity'] = 'medium'
  let title = 'Reported Infrastructure Issue'
  let description = text || 'Civic issue reported via demo mode.'
  let recommendedAction = 'Inspect site and dispatch maintenance crew'

  if (text.toLowerCase().includes('light') || text.toLowerCase().includes('dark')) {
    issueType = 'street_light'
    title = 'Street Light Malfunction'
    recommendedAction = 'Replace bulb / check wiring'
  } else if (text.toLowerCase().includes('water') || text.toLowerCase().includes('leak')) {
    issueType = 'water_leak'
    severity = 'high'
    title = 'Water Leak Hazard'
    recommendedAction = 'Shut main valve and schedule plumbing repair'
  } else if (text.toLowerCase().includes('garbage') || text.toLowerCase().includes('trash')) {
    issueType = 'garbage'
    title = 'Garbage Accumulation'
    recommendedAction = 'Dispatch sanitation team'
  } else if (text.toLowerCase().includes('graffiti')) {
    issueType = 'graffiti'
    severity = 'low'
    title = 'Graffiti Removal Request'
    recommendedAction = 'Schedule pressure washing'
  }

  return {
    title,
    description,
    transcript: text,
    summary: title,
    issueType,
    severity,
    locationLabel,
    latitude: input.latitude ?? 49.2827,
    longitude: input.longitude ?? -123.1207,
    photoUrl: input.draft?.photoUrl,
    recommendedAction,
    trackingId: `CF-${Math.floor(1000 + Math.random() * 9000)}`,
    status: 'queued',
    createdAt: new Date().toISOString(),
  }
}

export async function mockTranscribeReport(_audio: Blob): Promise<string> {
  await delay(2415)
  return "There is a severe pothole on Granville Street near Davie Street causing damage to passing vehicles."
}

export async function mockGetVoiceConversationIssue(
  conversationId: string,
): Promise<ReportIngestDraft> {
  await delay(2070)
  const match = conversationTranscripts.find((c) => c.conversationId === conversationId)
  const text = match ? match.transcript : "Reported issue via voice conversation"
  return mockIngestReport({ text })
}
