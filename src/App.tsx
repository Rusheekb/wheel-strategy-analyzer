import { useEffect, useState } from 'react'
import { IconBook, IconChart, IconJournal, IconMoon, IconSettings, IconSun, IconWheel } from './components/Icons'
import { Journal } from './pages/Journal'
import { Playbook } from './pages/Playbook'
import { Research } from './pages/Research'
import { SettingsPage } from './pages/SettingsPage'
import { JournalProvider } from './state/journal'
import { SettingsProvider, useSettings } from './state/settings'

type Page = 'research' | 'journal' | 'playbook' | 'settings'
const PAGES: Array<{ id: Page; label: string; icon: typeof IconChart }> = [
  { id: 'research', label: 'Research', icon: IconChart },
  { id: 'journal', label: 'Journal', icon: IconJournal },
  { id: 'playbook', label: 'Playbook', icon: IconBook },
  { id: 'settings', label: 'Settings', icon: IconSettings },
]

function pageFromHash(): Page {
  const h = window.location.hash.replace('#/', '').replace('#', '') as Page
  return PAGES.some((p) => p.id === h) ? h : 'research'
}

function Shell() {
  const [page, setPage] = useState<Page>(pageFromHash)
  const { settings, update } = useSettings()
  useEffect(() => {
    const onHash = () => setPage(pageFromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  const go = (p: Page) => {
    window.location.hash = `/${p}`
    setPage(p)
    window.scrollTo({ top: 0 })
  }
  const isDark = settings.theme === 'dark' || (settings.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <a className="brand" href="#/research" onClick={() => go('research')}>
            <span className="brand-mark">
              <IconWheel width={18} height={18} />
            </span>
            <span>Wheelhouse</span>
          </a>
          <nav className="nav" aria-label="Primary">
            {PAGES.map((p) => (
              <button key={p.id} className={page === p.id ? 'active' : ''} onClick={() => go(p.id)}>
                {p.label}
              </button>
            ))}
          </nav>
          <div className="topbar-right">
            <button className="btn btn-ghost icon-btn" type="button" aria-label="Toggle theme" onClick={() => update({ theme: isDark ? 'light' : 'dark' })}>
              {isDark ? <IconSun /> : <IconMoon />}
            </button>
          </div>
        </div>
      </header>
      <main className="shell">
        {page === 'research' && <Research onGoSettings={() => go('settings')} />}
        {page === 'journal' && <Journal />}
        {page === 'playbook' && <Playbook />}
        {page === 'settings' && <SettingsPage />}
        <footer className="footer">
          <div>Wheelhouse is a research and education tool. It does not place trades and nothing here is investment advice. Options involve risk and are not suitable for every investor.</div>
          <div>Scores are a structured opinion built from your own thresholds. Verify quotes with your broker before acting.</div>
        </footer>
      </main>
      <nav className="nav-mobile" aria-label="Primary mobile">
        {PAGES.map((p) => (
          <button key={p.id} className={page === p.id ? 'active' : ''} onClick={() => go(p.id)}>
            <p.icon width={18} height={18} />
            {p.label}
          </button>
        ))}
      </nav>
    </>
  )
}

export default function App() {
  return (
    <SettingsProvider>
      <JournalProvider>
        <Shell />
      </JournalProvider>
    </SettingsProvider>
  )
}
