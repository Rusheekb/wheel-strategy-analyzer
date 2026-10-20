const PREFIX = 'wheel.'

export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (raw == null) return fallback
    return { ...fallback, ...(JSON.parse(raw) as T) }
  } catch {
    return fallback
  }
}

export function loadRaw<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    return raw == null ? fallback : (JSON.parse(raw) as T)
  } catch {
    return fallback
  }
}

export function save(key: string, value: unknown) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value))
  } catch {
    /* storage unavailable: ignore */
  }
}

export function remove(key: string) {
  try {
    localStorage.removeItem(PREFIX + key)
  } catch {
    /* ignore */
  }
}

// Daily cache for provider responses, keyed by date so quotas are not wasted.
export function cacheGet<T>(key: string): T | null {
  const entry = loadRaw<{ day: string; value: T } | null>('cache.' + key, null)
  if (!entry) return null
  if (entry.day !== new Date().toISOString().slice(0, 10)) return null
  return entry.value
}

export function cacheSet(key: string, value: unknown) {
  save('cache.' + key, { day: new Date().toISOString().slice(0, 10), value })
}
