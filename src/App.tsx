import { useEffect, useState } from 'react'
import './extension.css'
import {
  countEnabledRules,
  getAppState,
  getSyncSummary,
  type AppState,
} from './core/storage'

function App() {
  const [state, setState] = useState<AppState | null>(null)

  useEffect(() => {
    getAppState().then(setState)
  }, [])

  const enabledRules = state ? countEnabledRules(state.rules) : 0
  const syncSummary = state ? getSyncSummary(state.sync) : 'Loading extension state...'

  return (
    <main className="app-shell app-shell--wide">
      <section className="hero-panel">
        <p className="eyebrow">MV3 extension preview</p>
        <h1>Request Forwarder now runs on DNR rules.</h1>
        <p className="hero-copy">
          This workspace page mirrors the extension data model: rule storage,
          global enablement, and the latest background sync status.
        </p>
        <div className="stat-grid">
          <article className="stat-card">
            <span className="stat-label">Global switch</span>
            <strong>{state?.extensionEnabled ? 'Enabled' : 'Disabled'}</strong>
          </article>
          <article className="stat-card">
            <span className="stat-label">Active redirects</span>
            <strong>{enabledRules}</strong>
          </article>
          <article className="stat-card">
            <span className="stat-label">Sync status</span>
            <strong>{state?.sync.lastError ? 'Needs attention' : 'Ready'}</strong>
          </article>
        </div>
      </section>

      <section className="content-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">How it works</p>
            <h2>Storage to transformer to browser dynamic rules</h2>
          </div>
          <span className="pill">{syncSummary}</span>
        </div>

        <div className="stack">
          <div className="note-card">
            <h3>Current MVP scope</h3>
            <ul className="feature-list">
              <li>Stores redirect rules in extension storage</li>
              <li>Converts enabled rules into dynamic DNR entries</li>
              <li>Syncs on install, startup, and storage changes</li>
              <li>Provides popup and options pages for quick control</li>
            </ul>
          </div>

          <div className="note-card">
            <h3>Next likely upgrades</h3>
            <ul className="feature-list">
              <li>Add import/export for rule sets</li>
              <li>Add per-site pause and hit logging</li>
              <li>Support richer conditions beyond urlFilter</li>
              <li>Introduce rule conflict diagnostics in the UI</li>
            </ul>
          </div>
        </div>
      </section>
    </main>
  )
}

export default App
