import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
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
  rule.matchType === 'regexFilter' ? '正则过滤' : 'URL 过滤'

const getRedirectLabel = (rule: RedirectRule) =>
  rule.redirectType === 'regexSubstitution' ? '正则替换' : '重定向 URL'

function CustomSelect({
  id,
  value,
  options,
  onChange,
  disabled,
}: {
  id?: string
  value: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const selected = options.find((opt) => opt.value === value)

  useEffect(() => {
    if (!open) return
    const handle = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open])

  return (
    <div className="custom-select" ref={ref} data-open={open} data-disabled={disabled}>
      <button
        type="button"
        id={id}
        className="custom-select__trigger text-input"
        onClick={() => !disabled && setOpen(!open)}
      >
        <span>{selected?.label ?? value}</span>
        <span className="custom-select__arrow">▼</span>
      </button>
      {open && (
        <div className="custom-select__dropdown">
          {options.map((opt) => (
            <div
              key={opt.value}
              className={`custom-select__option${opt.value === value ? ' custom-select__option--active' : ''}`}
              onClick={() => {
                onChange(opt.value)
                setOpen(false)
              }}
            >
              {opt.label}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

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
      return '加载中...'
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
    setTransferMessage('已将当前规则集导出为 JSON。')
  }

  const handleImport = async (mode: 'replace' | 'merge') => {
    clearTransferStatus()

    if (!importText.trim()) {
      setTransferError('导入前请先粘贴导出的 JSON。')
      return
    }

    try {
      const result = await importAppStateText(importText, mode)
      setState(result.state)
      setTransferMessage(
        `使用 ${mode} 模式导入了 ${result.importedCount} 条规则，拒绝了 ${result.rejectedCount} 条。`,
      )
      setImportText('')
    } catch (error) {
      setTransferError(
        error instanceof Error ? error.message : '导入失败：JSON 格式无效。',
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
              <p className="eyebrow">规则工作室</p>
              <h1 className="hero-title hero-title--inline">管理 DNR 重定向规则</h1>
              <p className="hero-copy hero-copy--compact">
                支持简单的 urlFilter 重定向和正则替换。
              </p>
            </div>
            <div className="pill-row">
              <span className="pill">
                {state ? `${state.rules.length} 条已配置` : '0 条已配置'}
              </span>
              <span className="pill">
                {state ? `${countEnabledRules(state.rules)} 条已启用` : '0 条已启用'}
              </span>
              <span className="pill">
                {state ? `${countSyncedRules(state)} 条已同步` : '0 条已同步'}
              </span>
              <span className="pill">
                {state ? `${countMatchedRules(state)} 条已匹配` : '0 条已匹配'}
              </span>
            </div>
          </div>
          <div className="stat-grid">
            <article className="stat-card">
              <span className="stat-label">引擎状态</span>
              <strong>{state?.extensionEnabled ? '已启用' : '已暂停'}</strong>
            </article>
            <article className="stat-card">
              <span className="stat-label">已配置规则</span>
              <strong>{state?.rules.length ?? 0}</strong>
            </article>
            <article className="stat-card">
              <span className="stat-label">已启用 / 已同步</span>
              <strong>
                {state ? `${countEnabledRules(state.rules)} / ${countSyncedRules(state)}` : '0 / 0'}
              </strong>
            </article>
          </div>
        </section>

        <section className="content-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">控制面板</p>
              <h2>管理已存储的规则集</h2>
            </div>
            <div className="button-row">
              <button className="button" onClick={openCreateEditor}>
                新建规则
              </button>
              <button
                className="toggle-button"
                data-active={String(Boolean(state?.extensionEnabled))}
                onClick={toggleGlobalEngine}
              >
                {state?.extensionEnabled ? '暂停引擎' : '启用引擎'}
              </button>
              <span className="pill">{state ? getSyncSummary(state.sync) : '加载中...'}</span>
            </div>
          </div>

          <section className="panel-card">
            <div className="section-heading">
              <div>
                <p className="eyebrow">已存储规则</p>
                <h3>当前重定向清单</h3>
              </div>
              <span className="chip">{state?.rules.length ?? 0} 条记录</span>
            </div>

            {state?.rules.length ? (
              <div className="table-shell">
                <table className="rule-table">
                  <thead>
                    <tr>
                      <th>规则</th>
                      <th>匹配</th>
                      <th>重定向</th>
                      <th>类型</th>
                      <th>状态</th>
                      <th>操作</th>
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
                            <span className="microcopy">优先级 {rule.priority} · DNR #{rule.dnrId}</span>
                            {matchRecord ? (
                              <span className="rule-hit-badge">
                                {matchRecord.count} 次命中 · {new Date(matchRecord.lastMatchedAt).toLocaleString()}
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
                            {rule.enabled ? '已启用' : '已禁用'}
                          </button>
                        </td>
                        <td>
                          <div className="table-actions">
                            <button className="ghost-button" onClick={() => openEditEditor(rule)}>
                              编辑
                            </button>
                            <button className="danger-button" onClick={() => handleDelete(rule.id)}>
                              删除
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
                暂无规则。创建一条规则以开始将重定向行为同步到浏览器。
              </div>
            )}
          </section>

          <div className="split-layout" style={{ marginTop: 18 }}>
            <section className="panel-card">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">动态输出</p>
                  <h3>浏览器接收的内容</h3>
                </div>
                <span className="chip">{state?.rules.length ?? 0} 条已存储规则</span>
              </div>
              <p className="helper-text">
                已启用的记录会成为 Chrome 动态规则。当前输出：
                {' '}
                {state
                  ? `${countSyncedRules(state)} 条已同步规则，来自 ${state.rules.length} 条已配置项。`
                  : '正在加载当前数量。'}
              </p>
              <pre className="code-block">{dynamicRulesPreview}</pre>

              <div className="section-heading" style={{ marginTop: 20 }}>
                <div>
                  <p className="eyebrow">诊断</p>
                  <h3>规则健康检查</h3>
                </div>
                <span className="chip">{diagnostics.length} 个信号</span>
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
                          受影响规则：{diagnostic.ruleIds.join(', ')}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="notice">
                  当前规则集中未检测到明显的规则冲突。
                </div>
              )}
            </section>

            <section className="panel-card">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">导入/导出</p>
                  <h3>导入和导出规则集</h3>
                </div>
                <div className="button-row">
                  <button className="ghost-button" onClick={handleExport}>
                    导出 JSON
                  </button>
                  <label className="ghost-button file-button">
                    加载文件
                    <input type="file" accept="application/json" onChange={handleFileImport} />
                  </label>
                </div>
              </div>

              <div className="field">
                <label htmlFor="import-json">导入内容</label>
                <textarea
                  id="import-json"
                  className="text-input text-area"
                  value={importText}
                  onChange={(event) => setImportText(event.target.value)}
                  placeholder="在此粘贴导出的 JSON 或重定向规则数组。"
                />
                <p className="helper-text">
                  「替换」会覆盖已存储的规则集。「合并」会将导入的规则追加到现有规则集，
                  并重新分配动态规则 ID，以保持最终规则集的一致性。
                </p>
              </div>

              <div className="button-row">
                <button className="button" onClick={() => handleImport('merge')}>
                  合并导入
                </button>
                <button className="ghost-button" onClick={() => handleImport('replace')}>
                  替换导入
                </button>
              </div>

              {transferMessage ? <div className="notice">{transferMessage}</div> : null}
              {transferError ? <div className="error-banner">{transferError}</div> : null}
            </section>
          </div>
        </section>
      </main>

      {editorOpen ? (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-header">
              <div>
                <p className="eyebrow">规则编辑器</p>
                <h3>{editingId ? '编辑重定向规则' : '创建重定向规则'}</h3>
              </div>
              <button className="icon-button" aria-label="关闭编辑器" onClick={closeEditor} type="button">
                ×
              </button>
            </div>

            <form className="form-grid" onSubmit={handleSubmit}>
              <div className="field">
                <label htmlFor="name">规则名称</label>
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
                  placeholder="模拟目录 API"
                />
              </div>

              <div className="row">
                <div className="field" style={{ flex: 1 }}>
                  <label htmlFor="match-type">匹配类型</label>
                  <CustomSelect
                    id="match-type"
                    value={draft.matchType}
                    options={[
                      { value: 'urlFilter', label: 'urlFilter' },
                      { value: 'regexFilter', label: 'regexFilter' },
                    ]}
                    onChange={(value) =>
                      updateDraft((current) => ({
                        ...current,
                        matchType: value as MatchType,
                        redirectType: value === 'regexFilter' ? current.redirectType : 'url',
                      }))
                    }
                  />
                </div>

                <div className="field" style={{ flex: 1 }}>
                  <label htmlFor="redirect-type">重定向类型</label>
                  <CustomSelect
                    id="redirect-type"
                    value={draft.redirectType}
                    options={[
                      { value: 'url', label: '固定 URL' },
                      { value: 'regexSubstitution', label: '正则替换' },
                    ]}
                    onChange={(value) =>
                      updateDraft((current) => ({
                        ...current,
                        redirectType: value as RedirectType,
                      }))
                    }
                    disabled={draft.matchType !== 'regexFilter'}
                  />
                </div>
              </div>

              <div className="field">
                <label htmlFor="match-value">
                  {draft.matchType === 'regexFilter' ? '正则过滤' : 'DNR urlFilter'}
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
                      ? '^https://example\\.com/api/(.*)$'
                      : '||api.example.com/v1/'
                  }
                />
                <p className="helper-text">
                  {draft.matchType === 'regexFilter'
                    ? '使用兼容 JavaScript 的正则表达式。捕获组可在正则替换重定向中复用。'
                    : '该值会直接传递给 Chrome 的 declarativeNetRequest urlFilter。'}
                </p>
              </div>

              <div className="field">
                <label htmlFor="redirect-value">
                  {draft.redirectType === 'regexSubstitution'
                    ? '正则替换目标'
                    : '重定向 URL'}
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
                    ? '您可以在此输入 `$1`、`$2` 等。扩展程序会将其规范化为 Chrome DNR 正则替换语法。'
                    : '请使用绝对 http(s) URL。'}
                </p>
              </div>

              <div className="row">
                <div className="field" style={{ flex: 1 }}>
                  <label htmlFor="priority">优先级</label>
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
                  {draft.enabled ? '规则已启用' : '规则已禁用'}
                </button>
              </div>

              <div className="field">
                <div className="fieldset-title">资源类型</div>
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
                  {editingId ? '保存规则' : '创建规则'}
                </button>
                <button className="ghost-button" type="button" onClick={resetEditorDraft}>
                  {editingId ? '恢复' : '重置'}
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
