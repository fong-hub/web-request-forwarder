import {
  getAppState,
  getDynamicRulesForState,
  initializeStorage,
  setSyncState,
  type AppState,
} from '../core/storage'
import { checkForUpdate, saveUpdateInfo } from '../core/update'

const ICON_PATHS = {
  16: 'src/assets/icon-16.png',
  48: 'src/assets/icon-48.png',
  128: 'src/assets/icon-128.png',
} as const

type TabMatchState = {
  total: number
  rules: Record<string, number>
}

const tabMatches = new Map<number, TabMatchState>()
const TAB_MATCHES_SESSION_KEY = 'request-forwarder.tab-matches'

const hydrateTabMatches = (async () => {
  const stored = await chrome.storage.session.get(TAB_MATCHES_SESSION_KEY)
  const entries = stored[TAB_MATCHES_SESSION_KEY]
  if (!Array.isArray(entries)) {
    return
  }

  entries.forEach((entry) => {
    if (!Array.isArray(entry) || typeof entry[0] !== 'number' || !entry[1] || typeof entry[1] !== 'object') {
      return
    }
    tabMatches.set(entry[0], entry[1] as TabMatchState)
  })
})()

const persistTabMatches = () => chrome.storage.session.set({
  [TAB_MATCHES_SESSION_KEY]: [...tabMatches.entries()],
})

let disabledIconCache: Promise<Record<number, ImageData>> | null = null

const performSyncDynamicRules = async () => {
  const state = await getAppState()

  if (
    typeof chrome === 'undefined' ||
    !chrome.declarativeNetRequest ||
    !chrome.declarativeNetRequest.getDynamicRules
  ) {
    return state
  }

  try {
    const currentRules = await chrome.declarativeNetRequest.getDynamicRules()
    const removeRuleIds = currentRules.map((rule: { id: number }) => rule.id)
    const addRules = getDynamicRulesForState(state)

    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds,
      addRules,
    })

    const nextSync = {
      lastSyncedAt: new Date().toISOString(),
      lastError: null,
    }

    await setSyncState(nextSync)
    return {
      ...state,
      sync: nextSync,
    }
  } catch (error) {
    const nextSync = {
      lastSyncedAt: new Date().toISOString(),
      lastError: error instanceof Error ? error.message : 'Unknown DNR error',
    }

    await setSyncState(nextSync)
    return {
      ...state,
      sync: nextSync,
    }
  }
}

const syncDynamicRules = async () => {
  const state = await performSyncDynamicRules()

  await hydrateAutoRefresh
  if (autoRefreshEnabled) {
    await refreshAffectedTabs()
  }

  return state
}

const syncActionState = async (state: AppState) => {
  if (!chrome.action) {
    return
  }

  await hydrateTabMatches

  await chrome.action.setBadgeText({ text: '' })
  const tabs = await chrome.tabs?.query({}) ?? []
  await Promise.all(tabs.flatMap((tab) => {
    if (typeof tab.id !== 'number') {
      return []
    }

    const count = tabMatches.get(tab.id)?.total ?? 0
    return [chrome.action!.setBadgeText({
      text: state.extensionEnabled && count > 0 ? String(count) : '',
      tabId: tab.id,
    })]
  }))
  await chrome.action.setBadgeBackgroundColor({
    color: state.extensionEnabled ? '#246b45' : '#7a7a7a',
  })
  await chrome.action.setTitle({
    title: state.extensionEnabled
      ? '请求转发器'
      : '请求转发器 · 全局已禁用',
  })

  if (state.extensionEnabled) {
    await chrome.action.setIcon({ path: ICON_PATHS })
    return
  }

  try {
    await chrome.action.setIcon({ imageData: await getDisabledIcons() })
  } catch {
    await chrome.action.setIcon({ path: ICON_PATHS })
  }
}

const getDisabledIcons = async () => {
  if (!disabledIconCache) {
    disabledIconCache = createDisabledIcons()
  }

  return disabledIconCache
}

const createDisabledIcons = async (): Promise<Record<number, ImageData>> => {
  const entries = await Promise.all(
    Object.entries(ICON_PATHS).map(async ([size, path]) => {
      const numericSize = Number(size)
      return [numericSize, await buildDisabledIcon(path, numericSize)] as const
    }),
  )

  return Object.fromEntries(entries)
}

const buildDisabledIcon = async (path: string, size: number) => {
  const response = await fetch(chrome.runtime.getURL(path))
  const blob = await response.blob()
  const bitmap = await createImageBitmap(blob)
  const canvas = new OffscreenCanvas(size, size)
  const context = canvas.getContext('2d')

  if (!context) {
    throw new Error('Unable to render grayscale icon.')
  }

  context.drawImage(bitmap, 0, 0, size, size)
  const imageData = context.getImageData(0, 0, size, size)
  const { data } = imageData

  for (let index = 0; index < data.length; index += 4) {
    const luminance =
      data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114
    const toned = Math.round(luminance * 0.78 + 28)
    data[index] = toned
    data[index + 1] = toned
    data[index + 2] = toned
    data[index + 3] = Math.round(data[index + 3] * 0.92)
  }

  return imageData
}

const initialize = async () => {
  await initializeStorage()
  const state = await syncDynamicRules()
  await syncActionState(state)
  await runUpdateCheck()
}

const runUpdateCheck = async () => {
  const info = await checkForUpdate()
  await saveUpdateInfo(info)
}

chrome.runtime.onInstalled.addListener(async () => {
  await initialize()
})

chrome.runtime.onStartup.addListener(async () => {
  await initialize()
})

chrome.alarms?.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'check-update') {
    await runUpdateCheck()
  }
})

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.alarms?.create('check-update', { periodInMinutes: 60 * 24 })
})

chrome.storage.onChanged.addListener(
  async (changes: Record<string, unknown>, areaName: string) => {
    if (areaName !== 'local') {
      return
    }

    const needsRuleSync =
      'request-forwarder.extension-enabled' in changes ||
      'request-forwarder.rules' in changes

    const needsActionSync =
      needsRuleSync || 'request-forwarder.matches' in changes || 'request-forwarder.sync' in changes

    if (needsRuleSync) {
      const state = await syncDynamicRules()
      await syncActionState(state)
      return
    }

    if (needsActionSync) {
      await syncActionState(await getAppState())
    }
  },
)

chrome.declarativeNetRequest.onRuleMatchedDebug?.addListener(async (info) => {
  await hydrateTabMatches
  const state = await getAppState()
  const matchedRule = state.rules.find((rule) => rule.dnrId === info.rule.ruleId)
  if (!matchedRule) {
    return
  }

  const tabId = info.request?.tabId
  if (typeof tabId === 'number' && tabId >= 0) {
    const current = tabMatches.get(tabId) ?? { total: 0, rules: {} }
    const next = {
      total: current.total + 1,
      rules: {
        ...current.rules,
        [matchedRule.id]: (current.rules[matchedRule.id] ?? 0) + 1,
      },
    }
    tabMatches.set(tabId, next)
    await persistTabMatches()
    await chrome.action?.setBadgeText({ text: String(next.total), tabId })
  }
})

chrome.tabs?.onUpdated.addListener(async (tabId, changeInfo) => {
  if (changeInfo.status !== 'loading') {
    return
  }

  await hydrateTabMatches
  tabMatches.delete(tabId)
  await persistTabMatches()
  await chrome.action?.setBadgeText({ text: '', tabId })
})

chrome.tabs?.onRemoved.addListener(async (tabId) => {
  await hydrateTabMatches
  tabMatches.delete(tabId)
  await persistTabMatches()
})

type ChromeTab = {
  id?: number
  url?: string
}

const getAffectedTabs = async (): Promise<ChromeTab[]> => {
  if (!chrome.tabs?.query) {
    return []
  }

  const state = await getAppState()
  const enabledRules = state.rules.filter((rule) => rule.enabled)

  if (enabledRules.length === 0) {
    return []
  }

  const tabs = await chrome.tabs.query({}) as ChromeTab[]

  return tabs.filter((tab) => {
    if (!tab.url) {
      return false
    }

    return enabledRules.some((rule) => {
      if (rule.matchType === 'urlFilter') {
        return tab.url!.includes(rule.matchValue.replace(/^\|+/, '').replace(/\|+$/, ''))
      }

      try {
        const regex = new RegExp(rule.matchValue)
        return regex.test(tab.url!)
      } catch {
        return false
      }
    })
  })
}

export const refreshAffectedTabs = async (): Promise<number> => {
  const tabs = await getAffectedTabs()

  if (chrome.tabs?.reload) {
    for (const tab of tabs) {
      if (tab.id) {
        await chrome.tabs.reload(tab.id, { bypassCache: true })
      }
    }
  }

  return tabs.length
}

const AUTO_REFRESH_KEY = 'request-forwarder.auto-refresh'
let autoRefreshEnabled = false
const hydrateAutoRefresh = (async () => {
  const stored = await chrome.storage.local.get(AUTO_REFRESH_KEY)
  autoRefreshEnabled = stored[AUTO_REFRESH_KEY] === true
})()

export const setAutoRefresh = async (enabled: boolean) => {
  await hydrateAutoRefresh
  autoRefreshEnabled = enabled
  await chrome.storage.local.set({ [AUTO_REFRESH_KEY]: enabled })
}

export const getAutoRefresh = async () => {
  await hydrateAutoRefresh
  return autoRefreshEnabled
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    if (message.type === 'refreshAffectedTabs') {
      const count = await refreshAffectedTabs()
      sendResponse({ count })
    } else if (message.type === 'getAffectedTabsCount') {
      const tabs = await getAffectedTabs()
      sendResponse({ count: tabs.length })
    } else if (message.type === 'setAutoRefresh') {
      await setAutoRefresh(message.enabled ?? false)
      sendResponse({ enabled: autoRefreshEnabled })
    } else if (message.type === 'getAutoRefresh') {
      sendResponse({ enabled: await getAutoRefresh() })
    } else if (message.type === 'getCurrentTabMatches') {
      await hydrateTabMatches
      const [activeTab] = await chrome.tabs?.query({ active: true, currentWindow: true }) ?? []
      const matches = typeof activeTab?.id === 'number' ? tabMatches.get(activeTab.id) : null
      sendResponse(matches ?? { total: 0, rules: {} })
    } else if (message.type === 'getCurrentTabContext') {
      const [activeTab] = await chrome.tabs?.query({ active: true, currentWindow: true }) ?? []
      sendResponse({ url: activeTab?.url ?? null })
    }
  })()
  return true
})
