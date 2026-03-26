type ChromeStorageChangeListener = (
  changes: Record<string, unknown>,
  areaName: string,
) => void

type ChromeRuntimeListener = () => void | Promise<void>

declare const chrome: {
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
  }
  runtime: {
    onInstalled: {
      addListener(callback: ChromeRuntimeListener): void
    }
    onStartup: {
      addListener(callback: ChromeRuntimeListener): void
    }
    openOptionsPage(): Promise<void>
  }
}
