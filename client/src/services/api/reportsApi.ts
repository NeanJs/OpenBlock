import {
  adminReportsUrl,
  adminReportStatusUrl,
  adminReportUrl,
  reportsCollectionUrl,
  reportTrackUrl,
} from '../../config/apiConfig'
import {
  apiRequestErrorFromResponse,
  ApiRequestError,
  type ApiRequestErrorCode,
} from './apiRequestError'
import { defaultIssueType } from '../report/issueType'
import { normalizeSeverity } from '../report/severity'
import { normalizeStatus } from '../report/statusFlow'
import { pickIssueType } from './pickIssueType'
import { isDemoMode } from '../../config/demoMode'
import {
  mockCreateReport,
  mockGetAdminReport,
  mockListReports,
  mockTrackReport,
  mockUpdateReportStatus,
} from '../mock/mockApi'
import type { IssueSeverity, IssueStatus } from '../../types/issue'

export class ReportApiError extends ApiRequestError {
  constructor(code: ApiRequestErrorCode, retryAfterSeconds?: number) {
    super(code, retryAfterSeconds)
    this.name = 'ReportApiError'
  }
}

function errorFromResponse(response: Response) {
  const mapped = apiRequestErrorFromResponse(response)
  return new ReportApiError(mapped.code, mapped.retryAfterSeconds)
}

export type CreateReportBody = {
  type: 'report'
  issue_type: string
  title: string
  description: string
  severity: string
  location: {
    description: string
    latitude: number
    longitude: number
  }
  recommended_action: string
  transcript?: string
  photo_url?: string
  audio_url?: string
}

export type CreateReportInput = {
  issueType?: string
  title?: string
  description?: string
  severity?: string
  locationDescription?: string
  latitude?: number
  longitude?: number
  transcript?: string
  recommendedAction?: string
  photoUrl?: string
  audioUrl?: string
}

export type RemoteReport = {
  remoteId?: string
  trackingId: string
  title: string
  description: string
  transcript: string
  summary: string
  issueType: string
  severity: IssueSeverity
  status: IssueStatus
  locationLabel: string
  latitude?: number
  longitude?: number
  photoUrl?: string
  audioUrl?: string
  recommendedAction: string
  createdAt?: string
  updatedAt?: string
  partial?: boolean
}

function asList(value: unknown): unknown[] | null {
  if (Array.isArray(value)) {
    return value
  }
  const record = asRecord(value)
  if (!record) {
    return null
  }
  const nested =
    record.reports ?? record.data ?? record.items ?? record.results ?? record.rows
  if (Array.isArray(nested)) {
    return nested
  }
  const nestedRecord = asRecord(nested)
  if (nestedRecord) {
    const inner = nestedRecord.reports ?? nestedRecord.data ?? nestedRecord.items
    if (Array.isArray(inner)) {
      return inner
    }
  }
  return null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null
  }
  return value as Record<string, unknown>
}

function pickString(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = source[key]
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }
  return ''
}

function pickNumber(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = source[key]
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value
    }
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value)
      if (Number.isFinite(parsed)) {
        return parsed
      }
    }
  }
  return undefined
}

function filled(value: string | undefined, fallback: string) {
  const trimmed = value?.trim() ?? ''
  return trimmed || fallback
}

function remoteMediaUrl(value: string | undefined) {
  const trimmed = value?.trim() ?? ''
  return /^https?:\/\//i.test(trimmed) ? trimmed : ''
}

function isPublicTrackingId(value: string) {
  return /^CF-/i.test(value.trim())
}

function readRemoteId(records: Record<string, unknown>[]) {
  for (const source of records) {
    const id = pickString(source, ['id', 'reportId', 'report_id'])
    if (id && !isPublicTrackingId(id)) {
      return id
    }
  }
  return ''
}

function readTrackingId(records: Record<string, unknown>[]) {
  for (const source of records) {
    const explicit = pickString(source, ['trackingId', 'tracking_id', 'trackingID'])
    if (explicit) {
      return explicit
    }
  }
  for (const source of records) {
    const id = pickString(source, ['id', 'reference', 'reference_id'])
    if (isPublicTrackingId(id)) {
      return id
    }
  }
  return ''
}

function readLocation(source: Record<string, unknown>) {
  const nested = asRecord(source.location)
  if (nested) {
    return {
      description: pickString(nested, ['description', 'label', 'name', 'address', 'place']),
      latitude: pickNumber(nested, ['latitude', 'lat']),
      longitude: pickNumber(nested, ['longitude', 'lng', 'lon']),
    }
  }
  return {
    description: pickString(source, [
      'location_description',
      'locationLabel',
      'location_label',
      'place',
      'address',
    ]),
    latitude: pickNumber(source, ['latitude', 'lat']),
    longitude: pickNumber(source, ['longitude', 'lng', 'lon']),
  }
}

export function buildCreateReportBody(input: CreateReportInput): CreateReportBody {
  const latitude = input.latitude
  const longitude = input.longitude
  const body: CreateReportBody = {
    type: 'report',
    issue_type: filled(input.issueType, defaultIssueType),
    title: filled(input.title, ''),
    description: filled(input.description, ''),
    severity: filled(input.severity, 'medium'),
    location: {
      description: filled(input.locationDescription, ''),
      latitude: latitude ?? 0,
      longitude: longitude ?? 0,
    },
    recommended_action: filled(input.recommendedAction, ''),
  }
  const transcript = input.transcript?.trim()
  if (transcript) {
    body.transcript = transcript
  }
  const photoUrl = remoteMediaUrl(input.photoUrl)
  if (photoUrl) {
    body.photo_url = photoUrl
  }
  const audioUrl = remoteMediaUrl(input.audioUrl)
  if (audioUrl) {
    body.audio_url = audioUrl
  }
  return body
}

function parseReportEnvelope(payload: unknown) {
  const top = asRecord(payload)
  const envelope = top ? asRecord(top.data) ?? asRecord(top.result) ?? top : null
  const source = envelope ? asRecord(envelope.report) ?? envelope : null
  return { top, envelope, source }
}

export function parseRemoteReport(payload: unknown): RemoteReport {
  const { top, envelope, source } = parseReportEnvelope(payload)
  if (!envelope || !source) {
    throw new ReportApiError('failed')
  }
  const records = [top ?? {}, envelope, source]
  const trackingId = readTrackingId(records)
  if (!trackingId) {
    throw new ReportApiError('failed')
  }
  const location = readLocation(source)
  const transcript = pickString(source, ['transcript', 'text', 'voiceText', 'voice_text'])
  const description = pickString(source, ['description', 'note']) || transcript
  const title = pickString(source, ['title']) || description
  const summary = pickString(source, ['summary']) || description || title
  const issueType = pickIssueType(payload, [top, envelope, source])
  const severity = normalizeSeverity(pickString(source, ['severity']))
  const status = normalizeStatus(pickString(source, ['status', 'current_status', 'currentStatus']))
  const recommendedAction =
    pickString(source, ['recommended_action', 'recommendedAction']) ||
    pickString(envelope, ['recommended_action', 'recommendedAction'])
  const photoUrl = remoteMediaUrl(pickString(source, ['photo_url', 'photoUrl', 'photo'])) || undefined
  const audioUrl = remoteMediaUrl(pickString(source, ['audio_url', 'audioUrl', 'audio'])) || undefined
  return {
    remoteId: readRemoteId(records) || undefined,
    trackingId,
    title,
    description: description || title,
    transcript,
    summary,
    issueType,
    severity,
    status,
    locationLabel: location.description,
    latitude: location.latitude,
    longitude: location.longitude,
    photoUrl,
    audioUrl,
    recommendedAction,
    createdAt: pickString(source, ['created_at', 'createdAt', 'timestamp']) || undefined,
    updatedAt: pickString(source, ['updated_at', 'updatedAt']) || undefined,
  }
}

export function parseRemoteStatusUpdate(payload: unknown): RemoteReport {
  const { top, envelope, source } = parseReportEnvelope(payload)
  if (!envelope || !source) {
    throw new ReportApiError('failed')
  }
  const records = [top ?? {}, envelope, source]
  const trackingId = readTrackingId(records)
  const remoteId = readRemoteId(records)
  if (!trackingId && !remoteId) {
    throw new ReportApiError('failed')
  }
  const statusRaw = pickString(source, ['status', 'current_status', 'currentStatus'])
  if (!statusRaw) {
    throw new ReportApiError('failed')
  }
  return {
    remoteId: remoteId || undefined,
    trackingId,
    title: '',
    description: '',
    transcript: '',
    summary: '',
    issueType: defaultIssueType,
    severity: 'medium',
    status: normalizeStatus(statusRaw),
    locationLabel: '',
    recommendedAction: '',
    updatedAt: pickString(source, ['updated_at', 'updatedAt']) || undefined,
    partial: true,
  }
}

async function readPayload(response: Response) {
  const text = await response.text()
  if (!text.trim()) {
    return null
  }
  return JSON.parse(text) as unknown
}

function adminHeaders(accessToken: string): HeadersInit {
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
  }
}

export async function listReports(accessToken: string): Promise<RemoteReport[]> {
  if (isDemoMode()) {
    return mockListReports()
  }
  const url = adminReportsUrl
  if (!url) {
    throw new ReportApiError('unavailable')
  }
  const token = accessToken.trim()
  if (!token) {
    throw new ReportApiError('unauthorized')
  }
  const response = await fetch(url, {
    method: 'GET',
    headers: adminHeaders(token),
  })
  if (!response.ok) {
    throw errorFromResponse(response)
  }
  const payload = await readPayload(response)
  const items = asList(payload)
  if (!items) {
    throw new ReportApiError('failed')
  }
  const reports: RemoteReport[] = []
  for (const item of items) {
    try {
      reports.push(parseRemoteReport(item))
    } catch {
      continue
    }
  }
  return reports
}

export async function getAdminReport(
  reportId: string,
  accessToken: string,
): Promise<RemoteReport> {
  if (isDemoMode()) {
    return mockGetAdminReport(reportId)
  }
  const url = adminReportUrl(reportId)
  if (!url) {
    throw new ReportApiError('unavailable')
  }
  const token = accessToken.trim()
  if (!token) {
    throw new ReportApiError('unauthorized')
  }
  const response = await fetch(url, {
    method: 'GET',
    headers: adminHeaders(token),
  })
  if (!response.ok) {
    throw errorFromResponse(response)
  }
  return parseRemoteReport(await readPayload(response))
}

export async function updateReportStatus(
  reportId: string,
  status: IssueStatus,
  accessToken: string,
): Promise<RemoteReport | null> {
  if (isDemoMode()) {
    return mockUpdateReportStatus(reportId, status)
  }
  const url = adminReportStatusUrl(reportId)
  if (!url) {
    throw new ReportApiError('unavailable')
  }
  const token = accessToken.trim()
  if (!token) {
    throw new ReportApiError('unauthorized')
  }
  const response = await fetch(url, {
    method: 'PATCH',
    headers: adminHeaders(token),
    body: JSON.stringify({ status }),
  })
  if (!response.ok) {
    throw errorFromResponse(response)
  }
  const payload = await readPayload(response)
  if (payload === null) {
    return null
  }
  try {
    return parseRemoteStatusUpdate(payload)
  } catch {
    try {
      return parseRemoteReport(payload)
    } catch {
      return null
    }
  }
}

export async function createReport(input: CreateReportInput): Promise<RemoteReport> {
  if (isDemoMode()) {
    return mockCreateReport(input)
  }
  const url = reportsCollectionUrl
  if (!url) {
    throw new ReportApiError('unavailable')
  }
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(buildCreateReportBody(input)),
  })
  if (!response.ok) {
    throw errorFromResponse(response)
  }
  return parseRemoteReport(await readPayload(response))
}

export async function trackReport(trackingId: string): Promise<RemoteReport> {
  if (isDemoMode()) {
    return mockTrackReport(trackingId)
  }
  const url = reportTrackUrl(trackingId)
  if (!url) {
    throw new ReportApiError('unavailable')
  }
  const response = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) {
    throw errorFromResponse(response)
  }
  return parseRemoteReport(await readPayload(response))
}
