import type { User as SupabaseUser } from '@supabase/supabase-js'
import { isDemoMode } from '../../config/demoMode'
import { isSupabaseConfigured } from '../../config/supabaseConfig'
import type { PublicUser, UserRole } from '../../types/user'
import { readStoreItem, writeStoreItem } from '../storage/persistentStore'
import { getSupabaseClient } from './supabaseClient'

export type AuthErrorCode = 'invalidCredentials' | 'unavailable'

export class AuthError extends Error {
  readonly code: AuthErrorCode

  constructor(code: AuthErrorCode) {
    super(code)
    this.code = code
    this.name = 'AuthError'
  }
}

const guestReporterKey = 'cityfix.guestReporter.v1'

let currentUser: PublicUser | null = null
let guestReporterId = ''
let hydrated = false
let bootstrapPromise: Promise<void> | null = null

function createId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `user-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function pickDisplayName(user: SupabaseUser) {
  const metadata = user.user_metadata ?? {}
  const candidates = [metadata.displayName, metadata.full_name, metadata.name, metadata.display_name]
  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }
  return user.email?.trim() || user.id
}

function toPublicUser(user: SupabaseUser): PublicUser {
  return {
    id: user.id,
    email: user.email?.trim() || '',
    displayName: pickDisplayName(user),
    role: 'staff',
    createdAt: user.created_at,
  }
}

async function ensureGuestReporter() {
  try {
    const existing = await readStoreItem(guestReporterKey)
    if (existing?.trim()) {
      guestReporterId = existing.trim()
      return
    }
  } catch {
    guestReporterId = ''
  }
  guestReporterId = isDemoMode() ? 'demo-user' : `guest-${createId()}`
  await writeStoreItem(guestReporterKey, guestReporterId)
}

export async function bootstrapAuth() {
  if (bootstrapPromise) {
    return bootstrapPromise
  }
  bootstrapPromise = (async () => {
    if (hydrated) {
      return
    }
    hydrated = true
    await ensureGuestReporter()
    if (!isSupabaseConfigured()) {
      currentUser = null
      return
    }
    try {
      const client = getSupabaseClient()
      const { data } = await client.auth.getSession()
      const user = data.session?.user ?? null
      currentUser = user ? toPublicUser(user) : null
    } catch {
      currentUser = null
    }
  })()
  return bootstrapPromise
}

export function getGuestReporterId(): string {
  return guestReporterId
}

export function getCurrentUser(): PublicUser | null {
  return currentUser
}

export async function getAccessToken(): Promise<string> {
  if (!isSupabaseConfigured()) {
    return ''
  }
  const client = getSupabaseClient()
  const { data } = await client.auth.getSession()
  const session = data.session
  if (!session?.access_token || !session.user) {
    return ''
  }
  return session.access_token
}

export async function login(email: string, password: string): Promise<PublicUser> {
  if (isDemoMode()) {
    const trimmed = email.trim()
    if (!trimmed || !password) {
      throw new AuthError('invalidCredentials')
    }
    const demoUser = createDemoStaffUser(trimmed)
    currentUser = demoUser
    return demoUser
  }
  if (!isSupabaseConfigured()) {
    throw new AuthError('unavailable')
  }
  const client = getSupabaseClient()
  const { data, error } = await client.auth.signInWithPassword({
    email: email.trim(),
    password,
  })
  if (error || !data.session?.user) {
    throw new AuthError('invalidCredentials')
  }
  currentUser = toPublicUser(data.session.user)
  return currentUser
}

function createDemoStaffUser(email: string): PublicUser {
  const seed = `${email.toLowerCase()}:${Math.random().toString(36).slice(2, 10)}`
  const suffix = seed.slice(-6)
  const name = seed
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
  const base = name || 'City Staff'
  return {
    id: `staff-${suffix}`,
    email,
    displayName: `${base} ${suffix}`,
    role: 'staff',
    createdAt: new Date().toISOString(),
  }
}

export async function logout(): Promise<void> {
  currentUser = null
  if (!isSupabaseConfigured()) {
    return
  }
  const client = getSupabaseClient()
  await client.auth.signOut()
}

export function homePathForRole(role: UserRole) {
  return role === 'staff' ? '/admin' : '/'
}
