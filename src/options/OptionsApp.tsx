import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react'
import '../extension.css'
import {
  countMatchedRules,
  countEnabledRules,
  countSyncedRules,
  createDraftFromRule,
  deleteRule,
  exportAppStateText,
  getAppState,
  getDiagnosticsForState,
  getDynamicRulesForState,
  getRuleMatchRecord,
  getSyncSummary,
  importAppStateText,
  isRuleMatched,
  saveRule,
  setExtensionEnabled,
  setRuleEnabled,
  subscribeToState,
  type AppState,
} from '../core/storage'
import {
  defaultRuleDraft,
  resourceTypeOptions,
  validateRuleDraft,
  type MatchType,
  type RedirectRule,
  type RedirectType,
  type RuleDraft,
  type ResourceType,
} from '../core/rules'

const getMatchLabel = (rule: RedirectRule) =>
  rule.matchType === 'regexFilter' ? 'Regex filter' : 'URL filter'

const getRedirectLabel = (rule: RedirectRule) =>
  rule.redirectType === 'regexSubstitution' ? 'Regex substitution' : 'Redirect URL'

function OptionsApp() {
  const [state, setState] = useState<AppState | null>(null)
  const [draftOverride, setDraftOverride] = useState<RuleDraft | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [importText, setImportText] = useState('')
  const [transferMessage, setTransferMessage] = useState<string | null>(null)
  const [transferError, setTransferError] = useState<string | null>(null)

  const closeEditor = () => {
    setEditorOpen(false)
    setDraftOverride(null)
    setEditingId(null)
    setErrors([])
  }

  useEffect(() => {
    const load = async () => {
      const nextState = await getAppState()
      setState(nextState)
    }

    load()
    return subscribeToState(() => {
      load()
    })
  }, [])

  useEffect(() => {
    if (!editorOpen) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeEditor()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [editorOpen])

  const dynamicRulesPreview = useMemo(() => {
    if (!state) {
      return 'Loading...'
    }

    return JSON.stringify(getDynamicRulesForState(state), null, 2)
  }, [state])

  const diagnostics = useMemo(() => {
    if (!state) {
      return []
    }

    return getDiagnosticsForState(state)
  }, [state])

  const selectedRule = useMemo(
    () => state?.rules.find((rule) => rule.id === editingId) ?? null,
    [editingId, state?.rules],
  )

  const draft = useMemo(() => {
    if (draftOverride) {
      return draftOverride
    }

    if (selectedRule) {
      return createDraftFromRule(selectedRule)
    }

    return defaultRuleDraft()
  }, [draftOverride, selectedRule])

  const updateDraft = (updater: (draft: RuleDraft) => RuleDraft) => {
    setDraftOverride((current) =>
      updater(current ?? (selectedRule ? createDraftFromRule(selectedRule) : defaultRuleDraft())),
    )
  }

  const resetEditorDraft = () => {
    setDraftOverride(editingId ? null : defaultRuleDraft())
    setErrors([])
  }

  const openCreateEditor = () => {
    setDraftOverride(defaultRuleDraft())
    setEditingId(null)
    setErrors([])
    setEditorOpen(true)
  }

  const openEditEditor = (rule: RedirectRule) => {
    setEditingId(rule.id)
    setDraftOverride(createDraftFromRule(rule))
    setErrors([])
    setEditorOpen(true)
  }

  const clearTransferStatus = () => {
    setTransferMessage(null)
    setTransferError(null)
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const result = validateRuleDraft(draft)
    if (!result.valid) {
      setErrors(result.errors)
      return
    }

    clearTransferStatus()
    const nextState = await saveRule(draft, editingId ?? undefined)
    setState(nextState)
    closeEditor()
  }

  const handleDelete = async (id: string) => {
    clearTransferStatus()
    const nextState = await deleteRule(id)
    setState(nextState)

    if (editingId === id) {
      closeEditor()
    }
  }

  const toggleRuleType = (resourceType: ResourceType) => {
    updateDraft((current) => {
      const exists = current.resourceTypes.includes(resourceType)
      return {
        ...current,
        resourceTypes: exists
          ? current.resourceTypes.filter((item) => item !== resourceType)
          : [...current.resourceTypes, resourceType],
      }
    })
  }

  const toggleGlobalEngine = async () => {
    if (!state) {
      return
    }

    clearTransferStatus()
    const nextState = await setExtensionEnabled(!state.extensionEnabled)
    setState(nextState)
  }

  const handleExport = async () => {
    clearTransferStatus()

    const contents = await exportAppStateText()
    const blob = new Blob([contents], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    const date = new Date().toISOString().slice(0, 10)
    link.href = url
    link.download = `request-forwarder-rules-${date}.json`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
    setTransferMessage('Exported the current ruleset as JSON.')
  }

  const handleImport = async (mode: 'replace' | 'merge') => {
    clearTransferStatus()

    if (!importText.trim()) {
      setTransferError('Paste exported JSON before importing.')
      return
    }

    try {
      const result = await importAppStateText(importText, mode)
      setState(result.state)
      setTransferMessage(
        `Imported ${result.importedCount} rule(s) with ${result.rejectedCount} rejected item(s) using ${mode} mode.`,
      )
      setImportText('')
    } catch (error) {
      setTransferError(
        error instanceof Error ? error.message : 'Import failed due to invalid JSON.',
      )
    }
  }

  const handleFileImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    clearTransferStatus()
    setImportText(await file.text())
    event.target.value = ''
  }

  return (
    <>
      <main className="app-shell app-shell--wide">
        <section className="hero-panel">
          <div className="compact-hero compact-hero--stack">
            <div className="compact-hero__body">
              <p className="eyebrow">Rules studio</p>
              <h1 className="hero-title hero-title--inline">Manage DNR redirect rules</h1>
              <p className="hero-copy hero-copy--compact">
                Supports both simple `urlFilter` redirects and regex substitutions.
              </p>
            </div>
            <div className="pill-row">
              <span className="pill">
                {state ? `${state.rules.length} configured` : '0 configured'}
              </span>
              <span className="pill">
                {state ? `${countEnabledRules(state.rules)} enabled` : '0 enabled'}
              </span>
              <span className="pill">
                {state ? `${countSyncedRules(state)} synced` : '0 synced'}
              </span>
              <span className="pill">
                {state ? `${countMatchedRules(state.matches)} matched` : '0 matched'}
              </span>
            </div>
          </div>
          <div className="stat-grid">
            <article className="stat-card">
              <span className="stat-label">Engine</span>
              <strong>{state?.extensionEnabled ? 'Enabled' : 'Paused'}</strong>
            </article>
            <article className="stat-card">
              <span className="stat-label">Configured rules</span>
              <strong>{state?.rules.length ?? 0}</strong>
            </article>
            <article className="stat-card">
              <span className="stat-label">Enabled / synced</span>
              <strong>
                {state ? `${countEnabledRules(state.rules)} / ${countSyncedRules(state)}` : '0 / 0'}
              </strong>
            </article>
          </div>
        </section>

        <section className="content-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Control plane</p>
              <h2>Manage the stored rule set</h2>
            </div>
            <div className="button-row">
              <button className="button" onClick={openCreateEditor}>
                New rule
              </button>
              <button
                className="toggle-button"
                data-active={String(Boolean(state?.extensionEnabled))}
                onClick={toggleGlobalEngine}
              >
                {state?.extensionEnabled ? 'Pause engine' : 'Enable engine'}
              </button>
              <span className="pill">{state ? getSyncSummary(state.sync) : 'Loading...'}</span>
            </div>
          </div>

          <section className="panel-card">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Stored rules</p>
                <h3>Current redirect inventory</h3>
              </div>
              <span className="chip">{state?.rules.length ?? 0} records</span>
            </div>

            {state?.rules.length ? (
              <div className="table-shell">
                <table className="rule-table">
                  <thead>
                    <tr>
                      <th>Rule</th>
                      <th>Match</th>
                      <th>Redirect</th>
                      <th>Types</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.rules.map((rule) => {
                      const matchRecord = getRuleMatchRecord(state.matches, rule.id)

                      return (
                      <tr data-matched={String(isRuleMatched(state.matches, rule.id))} key={rule.id}>
                        <td>
                          <div className="rule-cell">
                            <strong>{rule.name}</strong>
                            <span className="microcopy">p{rule.priority} · dnr #{rule.dnrId}</span>
                            {matchRecord ? (
                              <span className="rule-hit-badge">
                                {matchRecord.count} hit · {new Date(matchRecord.lastMatchedAt).toLocaleString()}
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td>
                          <div className="rule-cell">
                            <span className="microcopy">{getMatchLabel(rule)}</span>
                            <code className="rule-snippet">{rule.matchValue}</code>
                          </div>
                        </td>
                        <td>
                          <div className="rule-cell">
                            <span className="microcopy">{getRedirectLabel(rule)}</span>
                            <code className="rule-snippet">{rule.redirectValue}</code>
                          </div>
                        </td>
                        <td>
                          <span className="rule-types">{rule.resourceTypes.join(', ')}</span>
                        </td>
                        <td>
                          <button
                            className="toggle-button toggle-button--table"
                            data-active={String(rule.enabled)}
                            onClick={async () => {
                              const nextState = await setRuleEnabled(rule.id, !rule.enabled)
                              setState(nextState)
                            }}
                          >
                            {rule.enabled ? 'Enabled' : 'Disabled'}
                          </button>
                        </td>
                        <td>
                          <div className="table-actions">
                            <button className="ghost-button" onClick={() => openEditEditor(rule)}>
                              Edit
                            </button>
                            <button className="danger-button" onClick={() => handleDelete(rule.id)}>
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty-state">
                No rules yet. Create one to start syncing redirect behavior into the browser.
              </div>
            )}
          </section>

          <div className="split-layout" style={{ marginTop: 18 }}>
            <section className="panel-card">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Dynamic output</p>
                  <h3>What the browser receives</h3>
                </div>
                <span className="chip">{state?.rules.length ?? 0} stored rules</span>
              </div>
              <p className="helper-text">
                Enabled records become Chrome dynamic rules. Current output:
                {' '}
                {state
                  ? `${countSyncedRules(state)} synced rule(s) from ${state.rules.length} configured item(s).`
                  : 'Loading current counts.'}
              </p>
              <pre className="code-block">{dynamicRulesPreview}</pre>

              <div className="section-heading" style={{ marginTop: 20 }}>
                <div>
                  <p className="eyebrow">Diagnostics</p>
                  <h3>Rule health checks</h3>
                </div>
                <span className="chip">{diagnostics.length} signals</span>
              </div>

              {diagnostics.length > 0 ? (
                <div className="stack">
                  {diagnostics.map((diagnostic) => (
                    <div
                      key={diagnostic.id}
                      className={
                        diagnostic.level === 'warning' ? 'error-banner' : 'notice'
                      }
                    >
                      <strong>{diagnostic.title}</strong>
                      <p className="helper-text">{diagnostic.detail}</p>
                      {diagnostic.ruleIds.length > 0 ? (
                        <div className="microcopy">
                          Affected rules: {diagnostic.ruleIds.join(', ')}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="notice">
                  No obvious rule conflicts detected in the current ruleset.
                </div>
              )}
            </section>

            <section className="panel-card">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Transfer</p>
                  <h3>Import and export rulesets</h3>
                </div>
                <div className="button-row">
                  <button className="ghost-button" onClick={handleExport}>
                    Export JSON
                  </button>
                  <label className="ghost-button file-button">
                    Load file
                    <input type="file" accept="application/json" onChange={handleFileImport} />
                  </label>
                </div>
              </div>

              <div className="field">
                <label htmlFor="import-json">Import payload</label>
                <textarea
                  id="import-json"
                  className="text-input text-area"
                  value={importText}
                  onChange={(event) => setImportText(event.target.value)}
                  placeholder="Paste exported JSON or an array of redirect rules here."
                />
                <p className="helper-text">
                  `Replace` overwrites the stored ruleset. `Merge` appends imported rules
                  and reassigns dynamic rule IDs to keep the final set consistent.
                </p>
              </div>

              <div className="button-row">
                <button className="button" onClick={() => handleImport('merge')}>
                  Merge import
                </button>
                <button className="ghost-button" onClick={() => handleImport('replace')}>
                  Replace import
                </button>
              </div>

              {transferMessage ? <div className="notice">{transferMessage}</div> : null}
              {transferError ? <div className="error-banner">{transferError}</div> : null}
            </section>
          </div>
        </section>
      </main>

      {editorOpen ? (
        <div className="modal-backdrop" onClick={closeEditor}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <p className="eyebrow">Rule editor</p>
                <h3>{editingId ? 'Edit redirect rule' : 'Create redirect rule'}</h3>
              </div>
              <button className="ghost-button" onClick={closeEditor}>
                Close
              </button>
            </div>

            <form className="form-grid" onSubmit={handleSubmit}>
              <div className="field">
                <label htmlFor="name">Rule name</label>
                <input
                  id="name"
                  className="text-input"
                  value={draft.name}
                  onChange={(event) =>
                    updateDraft((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  placeholder="Mock catalog API"
                />
              </div>

              <div className="field">
                <label htmlFor="match-type">Match type</label>
                <select
                  id="match-type"
                  className="text-input"
                  value={draft.matchType}
                  onChange={(event) =>
                    updateDraft((current) => ({
                      ...current,
                      matchType: event.target.value as MatchType,
                      redirectType:
                        event.target.value === 'regexFilter'
                          ? current.redirectType
                          : 'url',
                    }))
                  }
                >
                  <option value="urlFilter">urlFilter</option>
                  <option value="regexFilter">regexFilter</option>
                </select>
              </div>

              <div className="field">
                <label htmlFor="match-value">
                  {draft.matchType === 'regexFilter' ? 'Regex filter' : 'DNR urlFilter'}
                </label>
                <input
                  id="match-value"
                  className="text-input"
                  value={draft.matchValue}
                  onChange={(event) =>
                    updateDraft((current) => ({
                      ...current,
                      matchValue: event.target.value,
                    }))
                  }
                  placeholder={
                    draft.matchType === 'regexFilter'
                      ? '^https://rc\\.cvte\\.com/api/resource/([^/]+)/(.*)$'
                      : '||api.example.com/v1/'
                  }
                />
                <p className="helper-text">
                  {draft.matchType === 'regexFilter'
                    ? 'Use a JavaScript-compatible regex. Capture groups can be reused in regexSubstitution redirects.'
                    : "This value is passed directly to Chrome's declarativeNetRequest urlFilter."}
                </p>
              </div>

              <div className="field">
                <label htmlFor="redirect-type">Redirect type</label>
                <select
                  id="redirect-type"
                  className="text-input"
                  value={draft.redirectType}
                  onChange={(event) =>
                    updateDraft((current) => ({
                      ...current,
                      redirectType: event.target.value as RedirectType,
                    }))
                  }
                  disabled={draft.matchType !== 'regexFilter'}
                >
                  <option value="url">Fixed URL</option>
                  <option value="regexSubstitution">Regex substitution</option>
                </select>
              </div>

              <div className="field">
                <label htmlFor="redirect-value">
                  {draft.redirectType === 'regexSubstitution'
                    ? 'Regex substitution target'
                    : 'Redirect URL'}
                </label>
                <input
                  id="redirect-value"
                  className="text-input"
                  value={draft.redirectValue}
                  onChange={(event) =>
                    updateDraft((current) => ({
                      ...current,
                      redirectValue: event.target.value,
                    }))
                  }
                  placeholder={
                    draft.redirectType === 'regexSubstitution'
                      ? 'http://127.0.0.1:9999/$2'
                      : 'https://staging.example.com/v1/'
                  }
                />
                <p className="helper-text">
                  {draft.redirectType === 'regexSubstitution'
                    ? 'You can type `$1`, `$2` here. The extension will normalize them to Chrome DNR regex substitution syntax.'
                    : 'Use an absolute http(s) URL.'}
                </p>
              </div>

              <div className="row">
                <div className="field" style={{ flex: 1 }}>
                  <label htmlFor="priority">Priority</label>
                  <input
                    id="priority"
                    className="number-input"
                    type="number"
                    min={1}
                    value={draft.priority}
                    onChange={(event) =>
                      updateDraft((current) => ({
                        ...current,
                        priority: Number(event.target.value) || 1,
                      }))
                    }
                  />
                </div>

                <button
                  type="button"
                  className="toggle-button"
                  data-active={String(draft.enabled)}
                  onClick={() =>
                    updateDraft((current) => ({
                      ...current,
                      enabled: !current.enabled,
                    }))
                  }
                >
                  {draft.enabled ? 'Rule enabled' : 'Rule disabled'}
                </button>
              </div>

              <div className="field">
                <div className="fieldset-title">Resource types</div>
                <div className="checkbox-grid">
                  {resourceTypeOptions.map((resourceType) => (
                    <label className="checkbox-card" key={resourceType}>
                      <input
                        type="checkbox"
                        checked={draft.resourceTypes.includes(resourceType)}
                        onChange={() => toggleRuleType(resourceType)}
                      />
                      <span>{resourceType}</span>
                    </label>
                  ))}
                </div>
              </div>

              {errors.length > 0 ? (
                <div className="error-banner">
                  {errors.map((error) => (
                    <div key={error}>{error}</div>
                  ))}
                </div>
              ) : null}

              <div className="button-row">
                <button className="button" type="submit">
                  {editingId ? 'Save rule' : 'Create rule'}
                </button>
                <button className="ghost-button" type="button" onClick={resetEditorDraft}>
                  {editingId ? 'Restore' : 'Reset'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  )
}

export default OptionsApp
