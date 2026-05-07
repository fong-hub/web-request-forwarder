import {
  countMatchedRules,
  getAppState,
  getDynamicRulesForState,
  initializeStorage,
  recordRuleMatch,
  setSyncState,
  type AppState,
} from '../core/storage'

const ICON_PATHS = {
  16: 'src/assets/icon-16.png',
  48: 'src/assets/icon-48.png',
  128: 'src/assets/icon-128.png',
} as const

let disabledIconCache: Promise<Record<number, ImageData>> | null = null

const syncDynamicRules = async () => {
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

const syncActionState = async (state: AppState) => {
  if (!chrome.action) {
    return
  }

  const matchedCount = countMatchedRules(state)
  const badgeText = state.extensionEnabled && matchedCount > 0 ? String(matchedCount) : ''

  await chrome.action.setBadgeText({ text: badgeText })
  await chrome.action.setBadgeBackgroundColor({
    color: state.extensionEnabled ? '#246b45' : '#7a7a7a',
  })
  await chrome.action.setTitle({
    title: state.extensionEnabled
      ? `请求转发器${matchedCount > 0 ? ` · ${matchedCount} 条规则已匹配` : ''}`
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
}

chrome.runtime.onInstalled.addListener(async () => {
  await initialize()
})

chrome.runtime.onStartup.addListener(async () => {
  await initialize()
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
  const nextState = await recordRuleMatch(info.rule.ruleId, info.request?.url ?? null)

  if (!nextState) {
    return
  }

  await syncActionState(await getAppState())
})
