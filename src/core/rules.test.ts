import { describe, expect, it } from 'vitest'
import {
  analyzeRules,
  createRuleFromDraft,
  defaultRuleDraft,
  normalizeImportedRules,
  toDynamicRule,
  validateRuleDraft,
} from './rules'

describe('rules', () => {
  it('validates a basic redirect draft', () => {
    const result = validateRuleDraft({
      ...defaultRuleDraft(),
      name: 'Mock catalog API',
    })

    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('rejects invalid redirect urls', () => {
    const result = validateRuleDraft({
      ...defaultRuleDraft(),
      redirectValue: '/relative/path',
    })

    expect(result.valid).toBe(false)
    expect(result.errors).toContain('Redirect URL must be an absolute http(s) URL.')
  })

  it('converts a stored rule into a DNR rule', () => {
    const rule = createRuleFromDraft(defaultRuleDraft(), 7)
    const dynamicRule = toDynamicRule(rule)

    expect(dynamicRule.id).toBe(7)
    expect(dynamicRule.action.type).toBe('redirect')
    expect(dynamicRule.condition.urlFilter).toBe('||api.example.com/v1/')
  })

  it('converts regex substitution rules into DNR regex rules', () => {
    const rule = createRuleFromDraft(
      {
        ...defaultRuleDraft(),
        name: 'Regex redirect',
        matchType: 'regexFilter',
        matchValue: '^https://rc\\.cvte\\.com/api/resource/([^/]+)/(.*)$',
        redirectType: 'regexSubstitution',
        redirectValue: 'http://127.0.0.1:9999/$2',
        resourceTypes: ['script'],
      },
      8,
    )

    const dynamicRule = toDynamicRule(rule)

    expect(dynamicRule.id).toBe(8)
    expect(dynamicRule.condition.regexFilter).toBe(
      '^https://rc\\.cvte\\.com/api/resource/([^/]+)/(.*)$',
    )
    expect(dynamicRule.action.redirect.regexSubstitution).toBe(
      'http://127.0.0.1:9999/\\2',
    )
  })

  it('normalizes imported rules and rejects malformed items', () => {
    const imported = normalizeImportedRules([
      {
        id: 'kept-id',
        dnrId: 99,
        name: 'Import one',
        enabled: true,
        priority: 3,
        matchType: 'urlFilter',
        matchValue: '||one.example.com/',
        redirectType: 'url',
        redirectValue: 'https://target.example.com/',
        resourceTypes: ['xmlhttprequest'],
      },
      {
        name: '',
        matchType: 'urlFilter',
        matchValue: '||bad.example.com/',
        redirectType: 'url',
        redirectValue: 'https://target.example.com/',
      },
    ])

    expect(imported.rules).toHaveLength(1)
    expect(imported.rules[0]?.dnrId).toBe(1)
    expect(imported.rejectedCount).toBe(1)
  })

  it('reports diagnostics for conflicting enabled rules', () => {
    const left = createRuleFromDraft(
      {
        ...defaultRuleDraft(),
        name: 'Conflict A',
      },
      1,
    )
    const right = createRuleFromDraft(
      {
        ...defaultRuleDraft(),
        name: 'Conflict B',
      },
      2,
    )

    const diagnostics = analyzeRules([left, right])

    expect(diagnostics.some((item) => item.id.startsWith('duplicate-match:'))).toBe(
      true,
    )
    expect(diagnostics.some((item) => item.id.startsWith('same-priority:'))).toBe(
      true,
    )
  })
})
