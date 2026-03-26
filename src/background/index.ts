import {
  getAppState,
  getDynamicRulesForState,
  initializeStorage,
  setSyncState,
} from '../core/storage'

const syncDynamicRules = async () => {
  const state = await getAppState()

  if (
    typeof chrome === 'undefined' ||
    !chrome.declarativeNetRequest ||
    !chrome.declarativeNetRequest.getDynamicRules
  ) {
    return
  }

  try {
    const currentRules = await chrome.declarativeNetRequest.getDynamicRules()
    const removeRuleIds = currentRules.map((rule: { id: number }) => rule.id)
    const addRules = getDynamicRulesForState(state)

    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds,
      addRules,
    })

    await setSyncState({
      lastSyncedAt: new Date().toISOString(),
      lastError: null,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown DNR error'
    await setSyncState({
      lastSyncedAt: new Date().toISOString(),
      lastError: message,
    })
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  await initializeStorage()
  await syncDynamicRules()
})

chrome.runtime.onStartup.addListener(async () => {
  await initializeStorage()
  await syncDynamicRules()
})

chrome.storage.onChanged.addListener(
  async (changes: Record<string, unknown>, areaName: string) => {
    if (areaName !== 'local') {
      return
    }

    if (
      'request-forwarder.extension-enabled' in changes ||
      'request-forwarder.rules' in changes
    ) {
      await syncDynamicRules()
    }
  },
)
