import {
  analyzeRules,
  createExampleRule,
  createRuleFromDraft,
  defaultRuleDraft,
  normalizeImportedRules,
  sortRules,
  toDynamicRule,
  updateRuleFromDraft,
  type DynamicRedirectRule,
  type RedirectRule,
  type RuleDraft,
  type RuleDiagnostic,
} from './rules'

const STORAGE_KEYS = {
  extensionEnabled: 'request-forwarder.extension-enabled',
  rules: 'request-forwarder.rules',
  sync: 'request-forwarder.sync',
} as const

export type SyncState = {
  lastSyncedAt: string | null
  lastError: string | null
}

export type AppState = {
  extensionEnabled: boolean
  rules: RedirectRule[]
  sync: SyncState
}

export type ExportPayload = {
  version: 1
  exportedAt: string
  extensionEnabled: boolean
  rules: RedirectRule[]
}

export type ImportMode = 'replace' | 'merge'

const defaultSyncState = (): SyncState => ({
  lastSyncedAt: null,
  lastError: null,
})

export const getAppState = async (): Promise<AppState> => {
  if (hasChromeStorage()) {
    const result = await chrome.storage.local.get(Object.values(STORAGE_KEYS))
    const extensionEnabledValue = result[STORAGE_KEYS.extensionEnabled]
    const rulesValue = result[STORAGE_KEYS.rules]
    const syncValue = result[STORAGE_KEYS.sync]
    const normalizedRules = normalizeImportedRules(rulesValue).rules

    return {
      extensionEnabled:
        typeof extensionEnabledValue === 'boolean' ? extensionEnabledValue : true,
      rules: normalizedRules.length > 0 ? normalizedRules : [createExampleRule()],
      sync: isSyncState(syncValue) ? syncValue : defaultSyncState(),
    }
  }

  const localRules = normalizeImportedRules(readLocalJson(STORAGE_KEYS.rules, [])).rules

  return {
    extensionEnabled: readLocalJson(STORAGE_KEYS.extensionEnabled, true),
    rules: localRules.length > 0 ? localRules : [createExampleRule()],
    sync: readLocalJson(STORAGE_KEYS.sync, defaultSyncState()),
  }
}

export const initializeStorage = async () => {
  const state = await getAppState()
  await persistState(state)
  return state
}

export const saveRule = async (
  draft: RuleDraft,
  existingId?: string,
): Promise<AppState> => {
  const state = await getAppState()
  const nextDnrId = state.rules.reduce((max, rule) => Math.max(max, rule.dnrId), 0) + 1

  const nextRules = existingId
    ? state.rules.map((rule) =>
        rule.id === existingId ? updateRuleFromDraft(rule, draft) : rule,
      )
    : [...state.rules, createRuleFromDraft(draft, nextDnrId)]

  const nextState = {
    ...state,
    rules: sortRules(nextRules),
  }

  await persistState(nextState)
  return nextState
}

export const deleteRule = async (id: string): Promise<AppState> => {
  const state = await getAppState()
  const nextState = {
    ...state,
    rules: sortRules(state.rules.filter((rule) => rule.id !== id)),
  }

  await persistState(nextState)
  return nextState
}

export const setRuleEnabled = async (
  id: string,
  enabled: boolean,
): Promise<AppState> => {
  const state = await getAppState()
  const nextState = {
    ...state,
    rules: sortRules(
      state.rules.map((rule) =>
        rule.id === id
          ? {
              ...rule,
              enabled,
              updatedAt: new Date().toISOString(),
            }
          : rule,
      ),
    ),
  }

  await persistState(nextState)
  return nextState
}

export const setExtensionEnabled = async (
  extensionEnabled: boolean,
): Promise<AppState> => {
  const state = await getAppState()
  const nextState = {
    ...state,
    extensionEnabled,
  }

  await persistState(nextState)
  return nextState
}

export const setSyncState = async (sync: SyncState) => {
  if (hasChromeStorage()) {
    await chrome.storage.local.set({
      [STORAGE_KEYS.sync]: sync,
    })
    return
  }

  localStorage.setItem(STORAGE_KEYS.sync, JSON.stringify(sync))
}

export const subscribeToState = (listener: () => void) => {
  if (hasChromeStorage()) {
    const handleChange = (changes: Record<string, unknown>, areaName: string) => {
      if (areaName !== 'local') {
        return
      }

      if (
        STORAGE_KEYS.extensionEnabled in changes ||
        STORAGE_KEYS.rules in changes ||
        STORAGE_KEYS.sync in changes
      ) {
        listener()
      }
    }

    chrome.storage.onChanged.addListener(handleChange)
    return () => chrome.storage.onChanged.removeListener(handleChange)
  }

  const handleStorage = (event: StorageEvent) => {
    if (event.key && Object.values(STORAGE_KEYS).includes(event.key as never)) {
      listener()
    }
  }

  window.addEventListener('storage', handleStorage)
  return () => window.removeEventListener('storage', handleStorage)
}

export const countEnabledRules = (rules: RedirectRule[]) =>
  rules.filter((rule) => rule.enabled).length

export const countSyncedRules = (state: AppState) => getDynamicRulesForState(state).length

export const getSyncSummary = (sync: SyncState) => {
  if (sync.lastError) {
    return `Last sync failed: ${sync.lastError}`
  }

  if (!sync.lastSyncedAt) {
    return 'Not synced yet'
  }

  return `Synced ${formatTime(sync.lastSyncedAt)}`
}

export const createDraftFromRule = (rule?: RedirectRule): RuleDraft =>
  rule
    ? {
        name: rule.name,
        enabled: rule.enabled,
        priority: rule.priority,
        matchType: rule.matchType,
        matchValue: rule.matchValue,
        redirectType: rule.redirectType,
        redirectValue: rule.redirectValue,
        resourceTypes: [...rule.resourceTypes],
      }
    : defaultRuleDraft()

export const getDynamicRulesForState = (state: AppState): DynamicRedirectRule[] => {
  if (!state.extensionEnabled) {
    return []
  }

  return state.rules.filter((rule) => rule.enabled).map(toDynamicRule)
}

export const getDiagnosticsForState = (state: AppState): RuleDiagnostic[] =>
  analyzeRules(state.rules)

export const exportAppState = async (): Promise<ExportPayload> => {
  const state = await getAppState()

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    extensionEnabled: state.extensionEnabled,
    rules: state.rules,
  }
}

export const exportAppStateText = async () =>
  JSON.stringify(await exportAppState(), null, 2)

export const importAppStateText = async (
  text: string,
  mode: ImportMode,
): Promise<{ state: AppState; rejectedCount: number; importedCount: number }> => {
  const raw = JSON.parse(text) as unknown
  const currentState = await getAppState()
  const isRuleArray = Array.isArray(raw)

  const payload =
    raw && typeof raw === 'object' && 'rules' in (raw as Record<string, unknown>)
      ? (raw as Record<string, unknown>)
      : null

  if (!payload && !isRuleArray) {
    throw new Error('Import JSON must be either an exported payload or an array of rules.')
  }

  const rulesSource = payload ? payload.rules : raw
  const importedEnabled = payload?.extensionEnabled
  const normalizedImport = normalizeImportedRules(rulesSource)
  const nextRules =
    mode === 'replace'
      ? normalizedImport.rules
      : normalizeImportedRules([...currentState.rules, ...normalizedImport.rules]).rules

  const nextState = {
    ...currentState,
    extensionEnabled:
      mode === 'replace' && typeof importedEnabled === 'boolean'
        ? importedEnabled
        : currentState.extensionEnabled,
    rules: nextRules,
  }

  await persistState(nextState)

  return {
    state: nextState,
    rejectedCount: normalizedImport.rejectedCount,
    importedCount: normalizedImport.rules.length,
  }
}

const persistState = async (state: AppState) => {
  if (hasChromeStorage()) {
    await chrome.storage.local.set({
      [STORAGE_KEYS.extensionEnabled]: state.extensionEnabled,
      [STORAGE_KEYS.rules]: state.rules,
      [STORAGE_KEYS.sync]: state.sync,
    })
    return
  }

  localStorage.setItem(STORAGE_KEYS.extensionEnabled, JSON.stringify(state.extensionEnabled))
  localStorage.setItem(STORAGE_KEYS.rules, JSON.stringify(state.rules))
  localStorage.setItem(STORAGE_KEYS.sync, JSON.stringify(state.sync))
}

const hasChromeStorage = () =>
  typeof chrome !== 'undefined' &&
  typeof chrome.storage !== 'undefined' &&
  typeof chrome.storage.local !== 'undefined'

const readLocalJson = <T,>(key: string, fallback: T): T => {
  const raw = localStorage.getItem(key)

  if (!raw) {
    return fallback
  }

  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

const formatTime = (value: string) =>
  new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))

const isSyncState = (value: unknown): value is SyncState => {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as Record<string, unknown>
  const hasLastSyncedAt =
    candidate.lastSyncedAt === null || typeof candidate.lastSyncedAt === 'string'
  const hasLastError =
    candidate.lastError === null || typeof candidate.lastError === 'string'

  return hasLastSyncedAt && hasLastError
}
