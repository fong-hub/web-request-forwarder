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
  const syncSummary = state ? getSyncSummary(state.sync) : '正在加载扩展状态...'

  return (
    <main className="app-shell app-shell--wide">
      <section className="hero-panel">
        <p className="eyebrow">MV3 扩展预览</p>
        <h1>请求转发器现已基于 DNR 规则运行。</h1>
        <p className="hero-copy">
          此工作区页面展示了扩展的数据模型：规则存储、全局启用状态和最新的后台同步状态。
        </p>
        <div className="stat-grid">
          <article className="stat-card">
            <span className="stat-label">全局开关</span>
            <strong>{state?.extensionEnabled ? '已启用' : '已禁用'}</strong>
          </article>
          <article className="stat-card">
            <span className="stat-label">活动重定向</span>
            <strong>{enabledRules}</strong>
          </article>
          <article className="stat-card">
            <span className="stat-label">同步状态</span>
            <strong>{state?.sync.lastError ? '需要关注' : '就绪'}</strong>
          </article>
        </div>
      </section>

      <section className="content-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">工作原理</p>
            <h2>从存储到转换器再到浏览器动态规则</h2>
          </div>
          <span className="pill">{syncSummary}</span>
        </div>

        <div className="stack">
          <div className="note-card">
            <h3>当前 MVP 范围</h3>
            <ul className="feature-list">
              <li>在扩展存储中保存重定向规则</li>
              <li>将已启用规则转换为动态 DNR 条目</li>
              <li>在安装、启动和存储变更时同步</li>
              <li>提供弹出面板和选项页面用于快速控制</li>
            </ul>
          </div>

          <div className="note-card">
            <h3>下一步可能的升级</h3>
            <ul className="feature-list">
              <li>增加规则集的导入/导出功能</li>
              <li>增加按站点暂停和命中日志功能</li>
              <li>支持 urlFilter 之外的更丰富条件</li>
              <li>在 UI 中引入规则冲突诊断</li>
            </ul>
          </div>
        </div>
      </section>
    </main>
  )
}

export default App
