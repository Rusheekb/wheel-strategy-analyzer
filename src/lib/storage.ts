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

// Cache for provider responses so request quotas are not wasted. Entries
// expire after `maxAgeMs`, or at the end of the calendar day when omitted.
export function cacheGet<T>(key: string, maxAgeMs?: number): T | null {
  const entry = loadRaw<{ day: string; at?: number; value: T } | null>('cache.' + key, null)
  if (!entry) return null
  if (maxAgeMs != null) {
    if (!entry.at || Date.now() - entry.at > maxAgeMs) return null
    return entry.value
  }
  if (entry.day !== new Date().toISOString().slice(0, 10)) return null
  return entry.value
}

export function cacheSet(key: string, value: unknown) {
  try {
    save('cache.' + key, { day: new Date().toISOString().slice(0, 10), at: Date.now(), value })
  } catch {
    /* quota exceeded: skip caching */
  }
}

export function cacheClear() {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(PREFIX + 'cache.'))
      .forEach((k) => localStorage.removeItem(k))
  } catch {
    /* ignore */
  }
}

// Small most-recent list helper.
export function pushRecent(key: string, value: string, max = 8): string[] {
  const list = loadRaw<string[]>(key, []).filter((x) => x !== value)
  list.unshift(value)
  const out = list.slice(0, max)
  save(key, out)
  return out
}
