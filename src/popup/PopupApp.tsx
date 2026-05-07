import { useEffect, useState } from 'react'
import '../extension.css'
import {
  countMatchedRules,
  getAppState,
  getRuleMatchRecord,
  isRuleMatched,
  setExtensionEnabled,
  setRuleEnabled,
  subscribeToState,
  type AppState,
} from '../core/storage'
import { type RedirectRule } from '../core/rules'

const getMatchLabel = (rule: RedirectRule) =>
  rule.matchType === 'regexFilter' ? '正则' : 'URL'

const getRedirectLabel = (rule: RedirectRule) =>
  rule.redirectType === 'regexSubstitution' ? '替换' : 'URL'

function PopupApp() {
  const [state, setState] = useState<AppState | null>(null)

  useEffect(() => {
    document.documentElement.dataset.surface = 'popup'
    document.body.dataset.surface = 'popup'
    document.documentElement.style.width = '800px'
    document.body.style.width = '800px'

    const load = () => {
      getAppState().then(setState)
    }

    load()
    const unsubscribe = subscribeToState(load)

    return () => {
      unsubscribe()
      delete document.documentElement.dataset.surface
      delete document.body.dataset.surface
      document.documentElement.style.width = ''
      document.body.style.width = ''
    }
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
    <main className="app-shell app-shell--popup app-shell--popup-compact">
      <section className="popup-board">
        <div className="popup-board__header">
          <div className="popup-board__title">
            <strong>Request Forwarder</strong>
            <span className="microcopy">
              {state?.rules.length ?? 0} 条规则 · {state ? countMatchedRules(state) : 0} 次匹配
            </span>
          </div>
          <div className="popup-board__actions">
            <button
              className="toggle-button toggle-button--compact"
              data-active={String(Boolean(state?.extensionEnabled))}
              onClick={toggleExtension}
            >
              {state?.extensionEnabled ? '开' : '关'}
            </button>
            <button className="button button--compact" onClick={openOptionsPage}>
              打开应用
            </button>
          </div>
        </div>

        {state?.rules.length ? (
          <div className="table-shell table-shell--popup table-shell--popup-compact">
            <table className="rule-table rule-table--popup-compact rule-table--popup-head">
              <thead>
                <tr>
                  <th>规则</th>
                  <th>匹配</th>
                  <th>重定向</th>
                  <th>状态</th>
                </tr>
              </thead>
            </table>

            <div className="rule-table-scroll">
              <table className="rule-table rule-table--popup-compact rule-table--popup-body">
                <tbody>
                  {state.rules.map((rule) => {
                    const matchRecord = getRuleMatchRecord(state.matches, rule.id)

                    return (
                      <tr data-matched={String(isRuleMatched(state.matches, rule.id))} key={rule.id}>
                        <td title={rule.name}>
                          <div className="rule-cell rule-cell--compact">
                            <strong className="text-truncate">{rule.name}</strong>
                            <span className="microcopy text-truncate">
                              p{rule.priority} · {rule.resourceTypes.join(', ')}
                            </span>
                            {matchRecord ? (
                              <span className="rule-hit-badge">{matchRecord.count} hit</span>
                            ) : null}
                          </div>
                        </td>
                        <td title={rule.matchValue}>
                          <div className="rule-cell rule-cell--compact">
                            <span className="microcopy">{getMatchLabel(rule)}</span>
                            <code className="rule-snippet rule-snippet--compact text-truncate">
                              {rule.matchValue}
                            </code>
                          </div>
                        </td>
                        <td title={rule.redirectValue}>
                          <div className="rule-cell rule-cell--compact">
                            <span className="microcopy">{getRedirectLabel(rule)}</span>
                            <code className="rule-snippet rule-snippet--compact text-truncate">
                              {rule.redirectValue}
                            </code>
                          </div>
                        </td>
                        <td>
                          <button
                            className="toggle-button toggle-button--table toggle-button--compact"
                            data-active={String(rule.enabled)}
                            onClick={async () => {
                              const nextState = await setRuleEnabled(rule.id, !rule.enabled)
                              setState(nextState)
                            }}
                          >
                            {rule.enabled ? '开' : '关'}
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="empty-state empty-state--compact">尚未配置任何规则。</div>
        )}
      </section>
    </main>
  )
}

export default PopupApp
