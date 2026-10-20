export const fmtMoney = (x: number, digits = 2) =>
  Number.isFinite(x) ? x.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: digits, maximumFractionDigits: digits }) : '—'

export const fmtPct = (x: number, digits = 1) => (Number.isFinite(x) ? `${(x * 100).toFixed(digits)}%` : '—')

export const fmtNum = (x: number, digits = 2) => (Number.isFinite(x) ? x.toFixed(digits) : '—')

export const fmtInt = (x: number) => (Number.isFinite(x) ? Math.round(x).toLocaleString('en-US') : '—')

export const fmtDate = (iso: string | null | undefined) => {
  if (!iso) return '—'
  const d = new Date(iso + (iso.length === 10 ? 'T00:00:00' : ''))
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export const fmtShortDate = (iso: string) => {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export const todayISO = () => new Date().toISOString().slice(0, 10)

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
