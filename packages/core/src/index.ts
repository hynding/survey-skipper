export { Answer } from './answer.js';
export type { AnswerInput, AnswerValue, ScalarValue } from './answer.js';
export { Question } from './question.js';
export type { QuestionId, QuestionInput, QuestionType, ValidationRules } from './question.js';
export { validateAnswer } from './validation.js';
export type { ValidationCode, ValidationError } from './validation.js';
export { SCHEMA_VERSION, SurveyDefinition } from './definition.js';
export type { AnswerMap, SurveyDefinitionInput, SurveyDefinitionJSON } from './definition.js';
export { SurveySession } from './session.js';
export type { SessionEvents, SessionJSON, SessionListener, SessionState } from './session.js';
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
