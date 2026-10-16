import { reportTranscribeUrl } from '../../config/apiConfig'
import { appendFormFile, audioFileName } from '../media/formFile'
import { ApiRequestError, apiRequestErrorFromResponse } from './apiRequestError'
import { isDemoMode } from '../../config/demoMode'
import { mockTranscribeReport } from '../mock/mockApi'

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

function firstRecord(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const nested = asRecord(source[key])
    if (nested) {
      return nested
    }
  }
  return null
}

export function parseTranscribeResponse(payload: unknown): string {
  const top = asRecord(payload)
  if (!top) {
    throw new ApiRequestError('failed')
  }
  const nested = firstRecord(top, ['data', 'result', 'draft']) ?? top
  const transcript =
    pickString(nested, ['transcript', 'text']) || pickString(top, ['transcript', 'text'])
  if (!transcript) {
    throw new ApiRequestError('failed')
  }
  return transcript
}

export async function transcribeReport(audio: Blob, signal?: AbortSignal): Promise<string> {
  if (isDemoMode()) {
    return mockTranscribeReport(audio)
  }
  const url = reportTranscribeUrl
  if (!url) {
    throw new ApiRequestError('unavailable')
  }
  if (audio.size < 1) {
    throw new ApiRequestError('failed')
  }
  const body = new FormData()
  appendFormFile(body, 'file', audio, audioFileName(audio))
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
    },
    body,
    signal,
  })
  let payload: unknown
  try {
    payload = (await response.json()) as unknown
  } catch {
    if (!response.ok) {
      throw apiRequestErrorFromResponse(response)
    }
    throw new ApiRequestError('failed')
  }
  if (!response.ok) {
    throw apiRequestErrorFromResponse(response)
  }
  return parseTranscribeResponse(payload)
}
