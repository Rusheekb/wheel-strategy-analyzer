import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { loadRaw, save } from '../lib/storage'
import type { JournalEntry } from '../lib/types'

interface Ctx {
  entries: JournalEntry[]
  add: (e: JournalEntry) => void
  update: (id: string, patch: Partial<JournalEntry>) => void
  remove: (id: string) => void
  clear: () => void
}

const JournalContext = createContext<Ctx | null>(null)

export function JournalProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<JournalEntry[]>(() => loadRaw<JournalEntry[]>('journal', []))
  useEffect(() => save('journal', entries), [entries])
  const value = useMemo<Ctx>(
    () => ({
      entries,
      add: (e) => setEntries((xs) => [e, ...xs]),
      update: (id, patch) => setEntries((xs) => xs.map((x) => (x.id === id ? { ...x, ...patch } : x))),
      remove: (id) => setEntries((xs) => xs.filter((x) => x.id !== id)),
      clear: () => setEntries([]),
    }),
    [entries],
  )
  return <JournalContext.Provider value={value}>{children}</JournalContext.Provider>
}

export function useJournal() {
  const ctx = useContext(JournalContext)
  if (!ctx) throw new Error('useJournal outside provider')
  return ctx
}

export interface SymbolPosition {
  symbol: string
  shares: number
  costBasis: number // net of all premium collected on this symbol
  premiumCollected: number // total dollars
  realized: number // dollars from closed/expired options and share sales
  openContracts: JournalEntry[]
}

// Derive per-symbol wheel state from the journal.
export function positionsFrom(entries: JournalEntry[]): SymbolPosition[] {
  const by = new Map<string, SymbolPosition>()
  const get = (sym: string) => {
    if (!by.has(sym)) by.set(sym, { symbol: sym, shares: 0, costBasis: 0, premiumCollected: 0, realized: 0, openContracts: [] })
    return by.get(sym)!
  }
  let grossCost = new Map<string, number>()
  for (const e of entries.slice().reverse()) {
    const p = get(e.symbol)
    const mult = e.contracts * 100
    if (e.kind === 'csp' || e.kind === 'cc') {
      const credit = e.premium * mult
      p.premiumCollected += credit
      if (e.status === 'open') p.openContracts.push(e)
      else {
        const debit = (e.closePrice ?? 0) * mult
        p.realized += credit - debit
      }
      if (e.status === 'assigned' && e.kind === 'csp' && e.strike) {
        p.shares += mult
        grossCost.set(e.symbol, (grossCost.get(e.symbol) ?? 0) + e.strike * mult)
      }
      if (e.status === 'assigned' && e.kind === 'cc' && e.strike) {
        const basisPerShare = p.shares > 0 ? (grossCost.get(e.symbol) ?? 0) / p.shares : 0
        p.realized += (e.strike - basisPerShare) * mult
        p.shares -= mult
        grossCost.set(e.symbol, Math.max(0, (grossCost.get(e.symbol) ?? 0) - basisPerShare * mult))
      }
    } else if (e.kind === 'assigned' || e.kind === 'shares') {
      const px = e.sharePrice ?? e.strike ?? 0
      p.shares += mult
      grossCost.set(e.symbol, (grossCost.get(e.symbol) ?? 0) + px * mult)
    } else if (e.kind === 'called_away') {
      const px = e.sharePrice ?? e.strike ?? 0
      const basisPerShare = p.shares > 0 ? (grossCost.get(e.symbol) ?? 0) / p.shares : 0
      p.realized += (px - basisPerShare) * mult
      p.shares -= mult
      grossCost.set(e.symbol, Math.max(0, (grossCost.get(e.symbol) ?? 0) - basisPerShare * mult))
    }
  }
  for (const p of by.values()) {
    const gross = grossCost.get(p.symbol) ?? 0
    // Net basis: shares cost less every premium dollar collected on the name.
    p.costBasis = p.shares > 0 ? Math.max(0, (gross - p.premiumCollected) / p.shares) : 0
  }
  grossCost = new Map()
  return [...by.values()].sort((a, b) => a.symbol.localeCompare(b.symbol))
}
