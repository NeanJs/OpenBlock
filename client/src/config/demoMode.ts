export const demoModeEnabled = (import.meta.env.VITE_DEMO_MODE ?? '').trim() === 'true'

export function isDemoMode(): boolean {
  return demoModeEnabled
}
