export const resourceTypeOptions = [
  'main_frame',
  'sub_frame',
  'xmlhttprequest',
  'script',
  'image',
  'stylesheet',
] as const

export type ResourceType = (typeof resourceTypeOptions)[number]
export type MatchType = 'urlFilter' | 'regexFilter'
export type RedirectType = 'url' | 'regexSubstitution'

export type RedirectRule = {
  id: string
  dnrId: number
  name: string
  enabled: boolean
  priority: number
  matchType: MatchType
  matchValue: string
  redirectType: RedirectType
  redirectValue: string
  resourceTypes: ResourceType[]
  createdAt: string
  updatedAt: string
}

export type RuleDraft = {
  name: string
  enabled: boolean
  priority: number
  matchType: MatchType
  matchValue: string
  redirectType: RedirectType
  redirectValue: string
  resourceTypes: ResourceType[]
}

export type RuleValidationResult = {
  valid: boolean
  errors: string[]
}

export type DynamicRedirectRule = {
  id: number
  priority: number
  action: {
    type: 'redirect'
    redirect: {
      url?: string
      regexSubstitution?: string
    }
  }
  condition: {
    urlFilter?: string
    regexFilter?: string
    resourceTypes: ResourceType[]
  }
}

export type RuleDiagnostic = {
  id: string
  level: 'info' | 'warning'
  title: string
  detail: string
  ruleIds: string[]
}

export const defaultRuleDraft = (): RuleDraft => ({
  name: '',
  enabled: true,
  priority: 1,
  matchType: 'urlFilter',
  matchValue: '||api.example.com/v1/',
  redirectType: 'url',
  redirectValue: 'https://staging.example.com/v1/',
  resourceTypes: ['xmlhttprequest'],
})

export const createExampleRule = (): RedirectRule => {
  const now = new Date().toISOString()

  return {
    id: createClientId(),
    dnrId: 1,
    name: 'Example staging redirect',
    enabled: false,
    priority: 1,
    matchType: 'urlFilter',
    matchValue: '||api.example.com/v1/',
    redirectType: 'url',
    redirectValue: 'https://staging.example.com/v1/',
    resourceTypes: ['xmlhttprequest'],
    createdAt: now,
    updatedAt: now,
  }
}

export const validateRuleDraft = (draft: RuleDraft): RuleValidationResult => {
  const errors: string[] = []

  if (!draft.name.trim()) {
    errors.push('Rule name is required.')
  }

  if (!draft.matchValue.trim()) {
    errors.push(
      draft.matchType === 'regexFilter'
        ? 'A regexFilter is required.'
        : 'A DNR urlFilter is required.',
    )
  }

  if (draft.matchType === 'regexFilter') {
    const regexError = validateRegexPattern(draft.matchValue)
    if (regexError) {
      errors.push(`regexFilter is invalid: ${regexError}`)
    }
  }

  if (!draft.redirectValue.trim()) {
    errors.push(
      draft.redirectType === 'regexSubstitution'
        ? 'A regex substitution target is required.'
        : 'A redirect URL is required.',
    )
  } else if (draft.redirectType === 'url' && !isHttpUrl(draft.redirectValue)) {
    errors.push('Redirect URL must be an absolute http(s) URL.')
  }

  if (draft.redirectType === 'regexSubstitution' && draft.matchType !== 'regexFilter') {
    errors.push('regexSubstitution can only be used together with regexFilter.')
  }

  if (draft.priority < 1) {
    errors.push('Priority must be at least 1.')
  }

  if (draft.resourceTypes.length === 0) {
    errors.push('Select at least one resource type.')
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

export const createRuleFromDraft = (
  draft: RuleDraft,
  nextDnrId: number,
): RedirectRule => {
  const now = new Date().toISOString()

  return {
    id: createClientId(),
    dnrId: nextDnrId,
    name: draft.name.trim(),
    enabled: draft.enabled,
    priority: draft.priority,
    matchType: draft.matchType,
    matchValue: draft.matchValue.trim(),
    redirectType: draft.redirectType,
    redirectValue: draft.redirectValue.trim(),
    resourceTypes: [...draft.resourceTypes],
    createdAt: now,
    updatedAt: now,
  }
}

export const updateRuleFromDraft = (
  rule: RedirectRule,
  draft: RuleDraft,
): RedirectRule => ({
  ...rule,
  name: draft.name.trim(),
  enabled: draft.enabled,
  priority: draft.priority,
  matchType: draft.matchType,
  matchValue: draft.matchValue.trim(),
  redirectType: draft.redirectType,
  redirectValue: draft.redirectValue.trim(),
  resourceTypes: [...draft.resourceTypes],
  updatedAt: new Date().toISOString(),
})

export const toDynamicRule = (rule: RedirectRule): DynamicRedirectRule => ({
  id: rule.dnrId,
  priority: rule.priority,
  action: {
    type: 'redirect',
    redirect:
      rule.redirectType === 'regexSubstitution'
        ? {
            regexSubstitution: normalizeRegexSubstitution(rule.redirectValue),
          }
        : {
            url: rule.redirectValue,
          },
  },
  condition: {
    ...(rule.matchType === 'regexFilter'
      ? { regexFilter: rule.matchValue }
      : { urlFilter: rule.matchValue }),
    resourceTypes: rule.resourceTypes,
  },
})

export const normalizeImportedRules = (value: unknown) => {
  if (!Array.isArray(value)) {
    return {
      rules: [] as RedirectRule[],
      rejectedCount: 0,
    }
  }

  const seenIds = new Set<string>()
  const accepted: RedirectRule[] = []
  let rejectedCount = 0

  for (const item of value) {
    const normalized = normalizeImportedRule(item)

    if (!normalized) {
      rejectedCount += 1
      continue
    }

    let nextId = normalized.id
    while (seenIds.has(nextId)) {
      nextId = createClientId()
    }

    seenIds.add(nextId)
    accepted.push({
      ...normalized,
      id: nextId,
    })
  }

  const sorted = sortRules(accepted).map((rule, index) => ({
    ...rule,
    dnrId: index + 1,
  }))

  return {
    rules: sorted,
    rejectedCount,
  }
}

export const analyzeRules = (rules: RedirectRule[]): RuleDiagnostic[] => {
  const diagnostics: RuleDiagnostic[] = []
  const enabledRules = rules.filter((rule) => rule.enabled)

  if (enabledRules.length === 0) {
    diagnostics.push({
      id: 'no-enabled-rules',
      level: 'info',
      title: 'No active redirect rules',
      detail: 'The engine is enabled, but every stored rule is currently disabled.',
      ruleIds: [],
    })
  }

  const byMatch = new Map<string, RedirectRule[]>()
  for (const rule of enabledRules) {
    const key = `${rule.matchType}:${rule.matchValue}`
    const group = byMatch.get(key) ?? []
    group.push(rule)
    byMatch.set(key, group)
  }

  for (const [matchKey, groupedRules] of byMatch.entries()) {
    if (groupedRules.length < 2) {
      continue
    }

    diagnostics.push({
      id: `duplicate-match:${matchKey}`,
      level: 'warning',
      title: 'Multiple enabled rules share the same matcher',
      detail: `The matcher "${matchKey}" appears on ${groupedRules.length} enabled rules. Higher priority rules will win, so this set deserves review.`,
      ruleIds: groupedRules.map((rule) => rule.id),
    })

    const samePriority = new Map<number, RedirectRule[]>()
    for (const rule of groupedRules) {
      const items = samePriority.get(rule.priority) ?? []
      items.push(rule)
      samePriority.set(rule.priority, items)
    }

    for (const [priority, samePriorityRules] of samePriority.entries()) {
      if (samePriorityRules.length < 2) {
        continue
      }

      diagnostics.push({
        id: `same-priority:${matchKey}:${priority}`,
        level: 'warning',
        title: 'Conflicting rules have the same priority',
        detail: `Enabled rules with matcher "${matchKey}" all use priority ${priority}. Their execution order is harder to reason about.`,
        ruleIds: samePriorityRules.map((rule) => rule.id),
      })
    }
  }

  const invalidUrlTargets = enabledRules.filter(
    (rule) => rule.redirectType === 'url' && !isHttpUrl(rule.redirectValue),
  )
  if (invalidUrlTargets.length > 0) {
    diagnostics.push({
      id: 'invalid-enabled-targets',
      level: 'warning',
      title: 'Some enabled rules have invalid redirect URLs',
      detail: 'These rules should be fixed before relying on background sync.',
      ruleIds: invalidUrlTargets.map((rule) => rule.id),
    })
  }

  const invalidRegexTargets = enabledRules.filter(
    (rule) => rule.redirectType === 'regexSubstitution' && rule.matchType !== 'regexFilter',
  )
  if (invalidRegexTargets.length > 0) {
    diagnostics.push({
      id: 'invalid-regex-combinations',
      level: 'warning',
      title: 'regexSubstitution requires regexFilter',
      detail: 'These rules use regex substitution without a regex matcher and will not sync cleanly.',
      ruleIds: invalidRegexTargets.map((rule) => rule.id),
    })
  }

  return diagnostics
}

export const sortRules = (rules: RedirectRule[]) =>
  [...rules].sort((left, right) => {
    if (right.priority !== left.priority) {
      return right.priority - left.priority
    }

    return left.createdAt.localeCompare(right.createdAt)
  })

export const normalizeRegexSubstitution = (value: string) =>
  value.trim().replace(/\$(\d)/g, '\\$1')

const createClientId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }

  return `rule-${Date.now()}-${Math.round(Math.random() * 100000)}`
}

const normalizeImportedRule = (value: unknown): RedirectRule | null => {
  if (!value || typeof value !== 'object') {
    return null
  }

  const candidate = value as Record<string, unknown>
  const name = typeof candidate.name === 'string' ? candidate.name.trim() : ''
  const matchType = parseMatchType(candidate.matchType, candidate.urlFilter)
  const matchValue = getMatchValue(candidate, matchType)
  const redirectType = parseRedirectType(candidate.redirectType, candidate.redirectUrl)
  const redirectValue = getRedirectValue(candidate, redirectType)

  if (!name || !matchValue || !redirectValue) {
    return null
  }

  if (matchType === 'regexFilter' && validateRegexPattern(matchValue)) {
    return null
  }

  if (redirectType === 'url' && !isHttpUrl(redirectValue)) {
    return null
  }

  if (redirectType === 'regexSubstitution' && matchType !== 'regexFilter') {
    return null
  }

  const resourceTypes = Array.isArray(candidate.resourceTypes)
    ? candidate.resourceTypes.filter(isResourceType)
    : []
  const now = new Date().toISOString()

  return {
    id: typeof candidate.id === 'string' && candidate.id ? candidate.id : createClientId(),
    dnrId:
      typeof candidate.dnrId === 'number' && Number.isInteger(candidate.dnrId) && candidate.dnrId > 0
        ? candidate.dnrId
        : 1,
    name,
    enabled: typeof candidate.enabled === 'boolean' ? candidate.enabled : true,
    priority:
      typeof candidate.priority === 'number' &&
      Number.isInteger(candidate.priority) &&
      candidate.priority > 0
        ? candidate.priority
        : 1,
    matchType,
    matchValue,
    redirectType,
    redirectValue:
      redirectType === 'regexSubstitution'
        ? normalizeRegexSubstitution(redirectValue)
        : redirectValue,
    resourceTypes: resourceTypes.length > 0 ? resourceTypes : ['xmlhttprequest'],
    createdAt: typeof candidate.createdAt === 'string' ? candidate.createdAt : now,
    updatedAt: typeof candidate.updatedAt === 'string' ? candidate.updatedAt : now,
  }
}

const parseMatchType = (value: unknown, legacyUrlFilter: unknown): MatchType => {
  if (value === 'regexFilter' || value === 'urlFilter') {
    return value
  }

  return typeof legacyUrlFilter === 'string' ? 'urlFilter' : 'urlFilter'
}

const parseRedirectType = (
  value: unknown,
  legacyRedirectUrl: unknown,
): RedirectType => {
  if (value === 'regexSubstitution' || value === 'url') {
    return value
  }

  return typeof legacyRedirectUrl === 'string' ? 'url' : 'url'
}

const getMatchValue = (
  candidate: Record<string, unknown>,
  matchType: MatchType,
) => {
  const explicit =
    typeof candidate.matchValue === 'string' ? candidate.matchValue.trim() : ''

  if (explicit) {
    return explicit
  }

  if (matchType === 'urlFilter') {
    return typeof candidate.urlFilter === 'string' ? candidate.urlFilter.trim() : ''
  }

  return typeof candidate.regexFilter === 'string' ? candidate.regexFilter.trim() : ''
}

const getRedirectValue = (
  candidate: Record<string, unknown>,
  redirectType: RedirectType,
) => {
  const explicit =
    typeof candidate.redirectValue === 'string' ? candidate.redirectValue.trim() : ''

  if (explicit) {
    return explicit
  }

  if (redirectType === 'url') {
    return typeof candidate.redirectUrl === 'string' ? candidate.redirectUrl.trim() : ''
  }

  return typeof candidate.regexSubstitution === 'string'
    ? candidate.regexSubstitution.trim()
    : ''
}

const isResourceType = (value: unknown): value is ResourceType =>
  typeof value === 'string' &&
  resourceTypeOptions.includes(value as ResourceType)

const validateRegexPattern = (value: string) => {
  try {
    new RegExp(value)
    return null
  } catch (error) {
    return error instanceof Error ? error.message : 'Unknown regex error'
  }
}

const isHttpUrl = (value: string) => {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}
