import { useEffect, useState } from 'react'
import '../extension.css'
import {
  countEnabledRules,
  countSyncedRules,
  getAppState,
  getSyncSummary,
  setExtensionEnabled,
  subscribeToState,
  type AppState,
} from '../core/storage'

function PopupApp() {
  const [state, setState] = useState<AppState | null>(null)

  useEffect(() => {
    const load = () => {
      getAppState().then(setState)
    }

    load()
    return subscribeToState(load)
  }, [])

  const toggleExtension = async () => {
    if (!state) {
      return
    }

    const nextState = await setExtensionEnabled(!state.extensionEnabled)
    setState(nextState)
  }

  const openOptionsPage = async () => {
    if (typeof chrome !== 'undefined' && chrome.runtime?.openOptionsPage) {
      await chrome.runtime.openOptionsPage()
    }
  }

  return (
    <main className="app-shell">
      <section className="hero-panel">
        <div className="compact-hero">
          <div>
            <p className="eyebrow">Quick control</p>
            <h2>Request Forwarder</h2>
          </div>
          <span className="pill">
            {state ? `${countSyncedRules(state)} synced / ${state.rules.length} configured` : 'Loading'}
          </span>
        </div>
      </section>

      <section className="content-panel popup-grid">
        <div className="toolbar">
          <div>
            <p className="eyebrow">Engine</p>
            <h3>{state?.extensionEnabled ? 'Redirects enabled' : 'Redirects paused'}</h3>
          </div>
          <button
            className="toggle-button"
            data-active={String(Boolean(state?.extensionEnabled))}
            onClick={toggleExtension}
          >
            {state?.extensionEnabled ? 'Pause all' : 'Enable all'}
          </button>
        </div>

        <div className="stat-grid">
          <article className="mini-card">
            <span className="stat-label">Configured rules</span>
            <strong>{state?.rules.length ?? 0}</strong>
          </article>
          <article className="mini-card">
            <span className="stat-label">Enabled rules</span>
            <strong>{state ? countEnabledRules(state.rules) : 0}</strong>
          </article>
          <article className="mini-card">
            <span className="stat-label">Synced to browser</span>
            <strong>{state ? countSyncedRules(state) : 0}</strong>
          </article>
        </div>

        <div className="notice">
          <div className="rule-meta">Background sync</div>
          <p>{state ? getSyncSummary(state.sync) : 'Loading sync state...'}</p>
        </div>

        <div className="button-row">
          <button className="button" onClick={openOptionsPage}>
            Open rules studio
          </button>
        </div>
      </section>
    </main>
  )
}

export default PopupApp
