import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createRuleFromDraft, defaultRuleDraft } from './rules'

const STORAGE_KEYS = {
  extensionEnabled: 'request-forwarder.extension-enabled',
  rules: 'request-forwarder.rules',
  sync: 'request-forwarder.sync',
  matches: 'request-forwarder.matches',
} as const

type StorageArea = Record<string, unknown>

type PendingWrite = {
  apply: () => void
}

const createStorageMock = (initial: StorageArea) => {
  const store: StorageArea = structuredClone(initial)
  const pendingWrites: PendingWrite[] = []

  return {
    chrome: {
      storage: {
        local: {
          get: vi.fn(async (keys?: string[] | string | null) => {
            const snapshot = structuredClone(store)

            if (!keys) {
              return snapshot
            }

            const keyList = Array.isArray(keys) ? keys : [keys]
            return Object.fromEntries(keyList.map((key) => [key, snapshot[key]]))
          }),
          set: vi.fn(
            async (items: Record<string, unknown>) =>
              new Promise<void>((resolve) => {
                const snapshot = structuredClone(items)
                pendingWrites.push({
                  apply: () => {
                    Object.assign(store, snapshot)
                    resolve()
                  },
                })
              }),
          ),
        },
        onChanged: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
      },
    },
    getStore: () => structuredClone(store),
    getPendingWritesCount: () => pendingWrites.length,
    flushWrite: (index: number) => pendingWrites[index]?.apply(),
  }
}

const waitForPendingWrites = async (
  getCount: () => number,
  expectedCount: number,
) => {
  for (let index = 0; index < 10; index += 1) {
    if (getCount() >= expectedCount) {
      return
    }

    await Promise.resolve()
  }

  throw new Error(`预期至少有 ${expectedCount} 个待写入操作。`)
}

describe('storage', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('keeps disabled rules excluded from matched count during concurrent updates', async () => {
    const firstRule = createRuleFromDraft(
      {
        ...defaultRuleDraft(),
        name: 'Enabled first',
        matchValue: '||one.example.com/',
        redirectValue: 'https://forward.example.com/one',
      },
      1,
    )
    const secondRule = createRuleFromDraft(
      {
        ...defaultRuleDraft(),
        name: 'Enabled second',
        matchValue: '||two.example.com/',
        redirectValue: 'https://forward.example.com/two',
      },
      2,
    )

    const storageMock = createStorageMock({
      [STORAGE_KEYS.extensionEnabled]: true,
      [STORAGE_KEYS.rules]: [firstRule, secondRule],
      [STORAGE_KEYS.sync]: {
        lastSyncedAt: null,
        lastError: null,
      },
      [STORAGE_KEYS.matches]: {
        records: {
          [secondRule.id]: {
            count: 1,
            lastMatchedAt: '2026-03-30T00:00:00.000Z',
            lastRequestUrl: 'https://two.example.com/api',
          },
        },
        updatedAt: '2026-03-30T00:00:00.000Z',
      },
    })

    vi.stubGlobal('chrome', storageMock.chrome)

    const storage = await import('./storage')

    const disablePromise = storage.setRuleEnabled(firstRule.id, false)
    const matchPromise = storage.recordRuleMatch(firstRule.dnrId, 'https://one.example.com/api')

    await waitForPendingWrites(storageMock.getPendingWritesCount, 2)

    storageMock.flushWrite(0)
    storageMock.flushWrite(1)

    await Promise.all([disablePromise, matchPromise])

    const finalState = await storage.getAppState()

    expect(finalState.rules.find((rule) => rule.id === firstRule.id)?.enabled).toBe(false)
    expect(storage.countMatchedRules(finalState)).toBe(1)
  })
})
