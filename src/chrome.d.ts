type ChromeStorageChangeListener = (
  changes: Record<string, unknown>,
  areaName: string,
) => void

type ChromeRuntimeListener = () => void | Promise<void>

type ChromeAlarmListener = (alarm: { name: string }) => void | Promise<void>

type ChromeDnrMatchedRuleListener = (info: {
  request?: {
    url?: string
  }
  rule: {
    ruleId: number
  }
}) => void | Promise<void>

type ChromeManifest = {
  version: string
}

declare const chrome: {
  action?: {
    setBadgeText(options: { text: string }): Promise<void>
    setBadgeBackgroundColor(options: { color: string }): Promise<void>
    setTitle(options: { title: string }): Promise<void>
    setIcon(options: {
      path?: Record<number, string>
      imageData?: Record<number, ImageData>
    }): Promise<void>
  }
  storage: {
    local: {
      get(keys?: string[] | string | null): Promise<Record<string, unknown>>
      set(items: Record<string, unknown>): Promise<void>
    }
    onChanged: {
      addListener(callback: ChromeStorageChangeListener): void
      removeListener(callback: ChromeStorageChangeListener): void
    }
  }
  declarativeNetRequest: {
    getDynamicRules(): Promise<Array<{ id: number }>>
    updateDynamicRules(options: {
      removeRuleIds: number[]
      addRules: unknown[]
    }): Promise<void>
    onRuleMatchedDebug?: {
      addListener(callback: ChromeDnrMatchedRuleListener): void
    }
  }
  runtime: {
    onInstalled: {
      addListener(callback: ChromeRuntimeListener): void
    }
    onStartup: {
      addListener(callback: ChromeRuntimeListener): void
    }
    openOptionsPage(): Promise<void>
    getURL(path: string): string
    getManifest(): ChromeManifest
  }
  alarms?: {
    onAlarm: {
      addListener(callback: ChromeAlarmListener): void
    }
    create(name: string, options: { periodInMinutes: number }): Promise<void>
  }
  tabs?: {
    create(options: { url: string }): Promise<void>
  }
}
