import { reportIngestUrl } from '../../config/apiConfig'
import { ApiRequestError, apiRequestErrorFromResponse } from './apiRequestError'
import { defaultIssueType } from '../report/issueType'
import { normalizeSeverity } from '../report/severity'
import { normalizeStatus } from '../report/statusFlow'
import { pickIssueType } from './pickIssueType'
import { appendFormFile, fileFromDataUrl, isAnalyzeImage, photoFileName } from '../media/formFile'
import { isDemoMode } from '../../config/demoMode'
import { mockIngestReport } from '../mock/mockApi'
import type { ReportIngestDraft, ReportIngestInput } from '../../types/reportIngest'

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null
  }
  return value as Record<string, unknown>
}

function unwrapCollectedValue(value: unknown, depth = 0): string {
  if (depth > 3) {
    return ''
  }
  if (typeof value === 'string' && value.trim()) {
    return value.trim()
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value)
  }
  const record = asRecord(value)
  if (!record) {
    return ''
  }
  return (
    unwrapCollectedValue(record.value, depth + 1) ||
    unwrapCollectedValue(record.data, depth + 1) ||
    unwrapCollectedValue(record.text, depth + 1)
  )
}

function pickString(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const next = unwrapCollectedValue(source[key])
    if (next) {
      return next
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
    const raw = unwrapCollectedValue(value)
    if (raw) {
      const parsed = Number(raw)
      if (Number.isFinite(parsed)) {
        return parsed
      }
    }
  }
  return undefined
}

function flattenCollected(source: Record<string, unknown> | null) {
  if (!source) {
    return {}
  }
  const flattened: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(source)) {
    const unwrapped = unwrapCollectedValue(value)
    flattened[key] = unwrapped || value
  }
  return flattened
}

function analyzePhoto(input: ReportIngestInput) {
  return isAnalyzeImage(input.photo) ? input.photo : undefined
}

function analyzeText(input: ReportIngestInput) {
  return input.text?.trim() || ''
}

function toFormData(input: ReportIngestInput) {
  const body = new FormData()
  const photo = analyzePhoto(input)
  if (photo) {
    appendFormFile(body, 'file', photo, photoFileName(photo))
  }
  const place = input.locationLabel?.trim()
  if (place) {
    body.append('locationLabel', place)
  }
  if (input.latitude !== undefined) {
    body.append('latitude', String(input.latitude))
  }
  if (input.longitude !== undefined) {
    body.append('longitude', String(input.longitude))
  }
  body.append('confirmed', input.confirmed ? 'true' : 'false')
  if (input.draft) {
    const photoUrl = input.draft.photoUrl?.trim() ?? ''
    const draft = /^https?:\/\//i.test(photoUrl) ? input.draft : { ...input.draft, photoUrl: undefined }
    body.append('report', JSON.stringify(draft))
  }
  return body
}

function emptyDraft(overrides: Partial<ReportIngestDraft> = {}): ReportIngestDraft {
  return {
    title: '',
    description: '',
    transcript: '',
    summary: '',
    issueType: defaultIssueType,
    severity: 'medium',
    locationLabel: '',
    status: 'queued',
    ...overrides,
  }
}

function firstRecord(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const nested = asRecord(source[key])
    if (nested) {
      return nested
    }
  }
  return null
}

function resolveIngestSource(payload: unknown): Record<string, unknown> | null {
  const top = asRecord(payload)
  if (!top) {
    return null
  }
  const envelope =
    firstRecord(top, ['data', 'result', 'analysis', 'draft', 'issue']) ?? top
  const nested = firstRecord(envelope, ['draft', 'report', 'analysis', 'issue'])
  const collected = flattenCollected(
    firstRecord(top, [
      'data_collection_results',
      'dataCollectionResults',
      'collected_data',
      'extracted',
      'datapoints',
      'fields',
    ]) ??
      firstRecord(envelope, [
        'data_collection_results',
        'dataCollectionResults',
        'collected_data',
        'extracted',
        'datapoints',
        'fields',
      ]) ??
      firstRecord(nested ?? {}, [
        'data_collection_results',
        'dataCollectionResults',
        'collected_data',
        'extracted',
        'datapoints',
        'fields',
      ]),
  )
  return { ...top, ...envelope, ...(nested ?? {}), ...collected }
}

function hasMeaningfulAnalysisText(draft: ReportIngestDraft) {
  return Boolean(
    draft.title.trim() ||
      draft.summary.trim() ||
      draft.description.trim() ||
      draft.transcript.trim(),
  )
}

export function parseReportIngestResponse(payload: unknown): ReportIngestDraft {
  const source = resolveIngestSource(payload)
  if (!source) {
    throw new ApiRequestError('failed')
  }
  const statusRaw = pickString(source, ['status']).toLowerCase()
  const transcript = pickString(source, ['transcript', 'text', 'voiceText', 'voice_text'])
  const description =
    pickString(source, ['description', 'note', 'details', 'summary_text']) || transcript
  const locationRecord = asRecord(source.location)
  const locationLabel =
    pickString(source, [
      'locationLabel',
      'location_label',
      'location_description',
      'location',
      'place',
      'address',
    ]) ||
    (locationRecord
      ? pickString(locationRecord, ['description', 'label', 'name', 'address', 'place'])
      : '')
  const issueType = pickIssueType(payload, [source])
  const title =
    pickString(source, ['title', 'issue_title', 'report_title', 'headline']) ||
    pickString(source, ['summary']) ||
    description
  const summary = pickString(source, ['summary']) || description || title
  const recommendedAction = pickString(source, ['recommended_action', 'recommendedAction'])
  const draft = emptyDraft({
    title,
    description,
    transcript,
    summary,
    issueType,
    severity: normalizeSeverity(pickString(source, ['severity'])),
    locationLabel,
    latitude:
      pickNumber(source, ['latitude', 'lat']) ??
      (locationRecord ? pickNumber(locationRecord, ['latitude', 'lat']) : undefined),
    longitude:
      pickNumber(source, ['longitude', 'lng', 'lon']) ??
      (locationRecord ? pickNumber(locationRecord, ['longitude', 'lng', 'lon']) : undefined),
    photoUrl: pickString(source, ['photoUrl', 'photo_url', 'photo']),
    recommendedAction,
    trackingId: pickString(source, ['trackingId', 'tracking_id']),
    status: statusRaw ? normalizeStatus(statusRaw) : 'queued',
    createdAt: pickString(source, ['createdAt', 'created_at', 'timestamp']),
  })
  if (!hasMeaningfulAnalysisText(draft)) {
    throw new ApiRequestError('failed')
  }
  return draft
}

async function readJsonPayload(response: Response) {
  try {
    return (await response.json()) as unknown
  } catch {
    if (!response.ok) {
      throw apiRequestErrorFromResponse(response)
    }
    throw new ApiRequestError('failed')
  }
}

async function parseOkDraft(response: Response) {
  const payload = await readJsonPayload(response)
  if (!response.ok) {
    throw apiRequestErrorFromResponse(response)
  }
  return parseReportIngestResponse(payload)
}

export async function ingestReport(input: ReportIngestInput): Promise<ReportIngestDraft> {
  if (isDemoMode()) {
    return mockIngestReport(input)
  }
  const url = reportIngestUrl
  if (!url) {
    throw new ApiRequestError('unavailable')
  }
  const photo = analyzePhoto(input)
  if (photo) {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
      },
      body: toFormData(input),
    })
    return parseOkDraft(response)
  }
  const text = analyzeText(input)
  if (text) {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text }),
    })
    return parseOkDraft(response)
  }
  throw new ApiRequestError('failed')
}

export async function blobFromDataUrl(dataUrl: string) {
  return fileFromDataUrl(dataUrl, 'photo.jpg')
}
