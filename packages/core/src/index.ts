export { Answer, formatAnswerValue, isMatrix, valueKey } from './answer.js';
export type { AnswerInput, AnswerValue, MatrixValue, ScalarValue } from './answer.js';
export { Question } from './question.js';
export type {
  AnswersFrom,
  BuiltInQuestionType,
  QuestionId,
  QuestionInput,
  QuestionTranslation,
  QuestionType,
  ValidationRules,
} from './question.js';
export { validateAnswer } from './validation.js';
export type { ValidationCode, ValidationError } from './validation.js';
export { SCHEMA_VERSION, SurveyDefinition } from './definition.js';
export type {
  AnswerMap,
  Availability,
  ClosedReason,
  SurveyDefinitionInput,
  SurveyDefinitionJSON,
  SurveyStatus,
} from './definition.js';
export { SurveySession } from './session.js';
export type {
  SessionEvents,
  SessionJSON,
  SessionListener,
  SessionOptions,
  SessionState,
  TimelineEvent,
} from './session.js';
// eslint-disable-next-line @typescript-eslint/no-deprecated -- kept for 2.x callers until 4.0
export { Survey } from './survey.js';
export type { SurveyInput } from './survey.js';
export type { Condition, Rule, RuleData } from './rules.js';
export { getEdges } from './graph.js';
export type { Edge } from './graph.js';
export { lintDefinition, reachableIds } from './lint.js';
export type { LintCode, LintIssue } from './lint.js';
export { runScript, simulatePaths } from './paths.js';
export type { ScriptResult, SimulatedPath } from './paths.js';
export { toDot, toMermaid } from './export.js';
export {
  and,
  answered,
  eq,
  gt,
  gte,
  includes,
  lt,
  lte,
  matches,
  ne,
  not,
  oneOf,
  or,
  QuestionBuilder,
  survey,
  SurveyBuilder,
  v,
} from './builder.js';
export type { QuestionOptions } from './builder.js';
export { aggregate, timeOnQuestions } from './analytics.js';
export type { QuestionStats, ScoreStats, SurveyStats } from './analytics.js';
export { scoreAnswers } from './scoring.js';
export type { Score } from './scoring.js';
export { toCSV, toRows } from './responses.js';
export type { CellValue, ExportableSession, ExportOptions, ResponseRow, ResponseTable } from './responses.js';
export { countQuotas, OVER_QUOTA, quotaStatus } from './quotas.js';
export type { Quota, QuotaStatus } from './quotas.js';
export { diffDefinitions } from './diff.js';
export type { DefinitionChange } from './diff.js';
export { migrateSession } from './versioning.js';
export type { MigrationReport } from './versioning.js';
export {
  registerOperator,
  registerQuestionType,
  registerValidator,
  resetPlugins,
} from './plugins.js';
export type { TypeCheck, Validator } from './plugins.js';
export { MemoryStore, resumeSession, WebStorageStore } from './storage.js';
export type { KeyValueStorage, SurveyStore } from './storage.js';
