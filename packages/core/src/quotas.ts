import type { Condition } from './rules.js';
import { SurveyDefinition, type SurveyDefinitionInput } from './definition.js';
import { SurveySession, type SessionState } from './session.js';

/**
 * A cap on how many completed responses can match a condition. Once `limit` completed sessions match `if`, a new
 * respondent who matches it is finished with the `end` ending (default `over_quota`).
 */
export interface Quota {
  id: string;
  /** Which responses count toward the quota, as JsonLogic over the session's data. Unset counts every response. */
  if?: Condition;
  limit: number;
  /** The ending a respondent who lands in a full quota finishes on. Default `over_quota`. */
  end?: string;
}

/** The default ending for respondents screened out by a full quota. */
export const OVER_QUOTA = 'over_quota';

/** One quota's state, from {@link quotaStatus}. */
export interface QuotaStatus {
  id: string;
  limit: number;
  count: number;
  full: boolean;
}

/**
 * Counts completed sessions toward each of the definition's quotas. Sessions that finished on a quota's ending (screened
 * out) don't count. Pass the result to sessions as the `quotaCounts` option.
 */
export function countQuotas(
  definition: SurveyDefinition | SurveyDefinitionInput,
  sessions: (SurveySession | SessionState)[],
): Record<string, number> {
  const def = SurveyDefinition.from(definition);
  const counts: Record<string, number> = Object.fromEntries(def.quotas.map((q) => [q.id, 0]));
  if (def.quotas.length === 0) {
    return counts;
  }
  const screenedOut = new Set(def.quotas.map((q) => q.end ?? OVER_QUOTA));
  for (const input of sessions) {
    const session = input instanceof SurveySession ? input : new SurveySession(def, input);
    const state = input instanceof SurveySession ? input.toJSON() : input;
    if (!state.finished || (state.ending !== undefined && screenedOut.has(state.ending))) {
      continue;
    }
    for (const quota of def.quotas) {
      if (session.matchesQuota(quota)) {
        counts[quota.id] = (counts[quota.id] ?? 0) + 1;
      }
    }
  }
  return counts;
}

/** Each quota's limit, count and whether it is full. */
export function quotaStatus(
  definition: SurveyDefinition | SurveyDefinitionInput,
  sessions: (SurveySession | SessionState)[],
): QuotaStatus[] {
  const def = SurveyDefinition.from(definition);
  const counts = countQuotas(def, sessions);
  return def.quotas.map((q) => {
    const count = counts[q.id] ?? 0;
    return { id: q.id, limit: q.limit, count, full: count >= q.limit };
  });
}
