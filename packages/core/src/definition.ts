import { isMatrix, type Answer } from './answer.js';
import { Question, type QuestionId, type QuestionInput } from './question.js';
import type { Quota } from './quotas.js';
import { assertRuleShape, type Condition, type Rule } from './rules.js';
import { isNil } from './utils.js';

/** The version of the JSON shapes produced by `toJSON()`. Bumped when they change incompatibly. */
export const SCHEMA_VERSION = 1;

/**
 * Value-based jumps: `answerMap[fromQuestionId][answerKey] = toQuestionId`.
 * The answer key is the answer's value, or the definition's `customKey` for custom answers.
 * Rules on questions are checked first; see {@link Rule}.
 */
export type AnswerMap = Record<string, Record<string, QuestionId>>;

/** Whether a survey takes new responses. Unset behaves like `open`. */
export type SurveyStatus = 'draft' | 'open' | 'closed';

/** Why a survey is not taking new responses. */
export type ClosedReason = 'draft' | 'closed' | 'not_yet_open' | 'past_close' | 'full';

/** What {@link SurveyDefinition.availability} returns. */
export interface Availability {
  accepting: boolean;
  /** Set when `accepting` is false. */
  reason?: ClosedReason;
}

export interface SurveyDefinitionInput {
  /** The `toJSON()` schema version the input was written with. Newer than {@link SCHEMA_VERSION} is rejected. */
  schemaVersion?: number;
  id?: string | number;
  /** The definition's own version, recorded on each session that runs against it. */
  version?: string | number;
  title?: string;
  description?: string;
  /** Plain objects are wrapped in {@link Question}. */
  questions?: (Question | QuestionInput)[];
  answerMap?: AnswerMap;
  /** Key used in the answer map for custom answers. Defaults to `'*'`. */
  customKey?: string;
  /**
   * When a respondent goes back and takes a different route, keep the answers left on the old route in the
   * session's `abandonedAnswers` (`true`, the default) or discard them (`false`).
   */
  keepAbandonedAnswers?: boolean;
  /**
   * Computed variables: JsonLogic expressions evaluated in order against the session's data, readable as `vars.<name>`
   * in conditions and piped text. Later variables can use earlier ones.
   */
  variables?: Record<string, Condition>;
  /** The locale the plain `text`, `title` and `description` are written in. */
  defaultLocale?: string;
  /** Title and description in other languages, keyed by locale. Question text is translated on each question. */
  translations?: Record<string, { title?: string; description?: string }>;
  /** `draft` and `closed` surveys take no new responses. Unset behaves like `open`. */
  status?: SurveyStatus;
  /** ISO 8601 date-time before which the survey takes no new responses. */
  opensAt?: string;
  /** ISO 8601 date-time from which the survey takes no new responses. */
  closesAt?: string;
  /** The survey stops taking new responses once this many have been completed. */
  maxResponses?: number;
  /**
   * Settings for sections, keyed by the questions' `section` name. `randomize: true` asks the section's questions in
   * a random order, fixed per session. Rules that `goTo` the section's first question enter it at its shuffled start.
   */
  sections?: Record<string, SectionSettings>;
  /** Caps on how many completed responses can match a condition. See {@link Quota}. */
  quotas?: Quota[];
}

export interface SectionSettings {
  /** Ask this section's consecutive questions in a random order, fixed per session. */
  randomize?: boolean;
}

/** What {@link SurveyDefinition.toJSON} returns. Pass it back to `new SurveyDefinition(...)` to restore. */
export interface SurveyDefinitionJSON extends SurveyDefinitionInput {
  schemaVersion: number;
  questions: QuestionInput[];
  answerMap: AnswerMap;
  customKey: string;
  keepAbandonedAnswers: boolean;
}

/**
 * A survey as its creator defines it: questions, answer options, rules and settings. It holds no respondent
 * state, so one definition can be shared by any number of {@link SurveySession}s.
 */
export class SurveyDefinition {
  id: string | number | undefined;
  version: string | number | undefined;
  title: string | undefined;
  description: string | undefined;
  questions: Question[];
  answerMap: AnswerMap;
  customKey: string;
  keepAbandonedAnswers: boolean;
  variables: Record<string, Condition>;
  defaultLocale: string | undefined;
  translations: Record<string, { title?: string; description?: string }>;
  status: SurveyStatus | undefined;
  opensAt: string | undefined;
  closesAt: string | undefined;
  maxResponses: number | undefined;
  sections: Record<string, SectionSettings>;
  quotas: Quota[];
  private readonly idMap = new Map<string, number>();

  constructor({
    schemaVersion,
    id,
    version,
    title,
    description,
    questions = [],
    answerMap = {},
    customKey,
    keepAbandonedAnswers = true,
    variables = {},
    defaultLocale,
    translations = {},
    status,
    opensAt,
    closesAt,
    maxResponses,
    sections = {},
    quotas = [],
  }: SurveyDefinitionInput = {}) {
    if (!isNil(schemaVersion) && schemaVersion > SCHEMA_VERSION) {
      throw new RangeError(
        `Survey schema version ${String(schemaVersion)} is newer than this library supports (${String(SCHEMA_VERSION)})`,
      );
    }
    this.id = id;
    this.version = version;
    this.title = title;
    this.description = description;
    this.questions = questions.map((q) => Question.from(q));
    this.answerMap = answerMap;
    this.customKey = customKey?.length ? customKey : '*';
    this.keepAbandonedAnswers = keepAbandonedAnswers;
    this.variables = { ...variables };
    this.defaultLocale = defaultLocale;
    this.translations = { ...translations };
    for (const [name, value] of [['opensAt', opensAt], ['closesAt', closesAt]] as const) {
      if (value !== undefined && Number.isNaN(Date.parse(value))) {
        throw new TypeError(`${name} must be an ISO 8601 date-time, got "${value}"`);
      }
    }
    this.status = status;
    this.opensAt = opensAt;
    this.closesAt = closesAt;
    this.maxResponses = maxResponses;
    this.sections = { ...sections };
    this.quotas = quotas.map((q) => ({ ...q }));
    this.reindex();
  }

  /** Wraps plain input in a SurveyDefinition; passes definitions through. */
  static from(input: SurveyDefinition | SurveyDefinitionInput): SurveyDefinition {
    return input instanceof SurveyDefinition ? input : new SurveyDefinition(input);
  }

  /** Rebuilds the id → position lookup. Call after changing `questions` directly. */
  reindex(): this {
    this.idMap.clear();
    this.questions.forEach((q, i) => {
      this.idMap.set(String(q.id), i);
    });
    return this;
  }

  /** The position of a question in `questions`, or `undefined` if it is not part of this survey. */
  indexOf(id: QuestionId): number | undefined {
    return this.idMap.get(String(id));
  }

  getQuestionById(id: QuestionId): Question | undefined {
    const index = this.indexOf(id);
    return index === undefined ? undefined : this.questions[index];
  }

  /** The answer-map key for an answer: its value (list values joined with `,`), or `customKey` for custom answers. */
  getAnswerKey(answer: Answer): string {
    if (answer.isCustom) {
      return this.customKey;
    }
    const value = answer.value;
    if (isMatrix(value)) {
      return Object.entries(value)
        .map(([row, column]) => `${row}=${String(column)}`)
        .join(',');
    }
    return Array.isArray(value) ? value.map(String).join(',') : String(value);
  }

  /**
   * Routes `answer` on `fromQuestion` to `toQuestion` in the answer map.
   * Throws a `TypeError` for an empty answer value and a `RangeError` if `toQuestion` is not part of this survey.
   */
  mapAnswer(fromQuestion: Question, answer: Answer, toQuestion: Question): this {
    if (!answer.isValid()) {
      throw new TypeError('Answer value is invalid for mapping');
    }
    this.assertMember(toQuestion.id);
    const key = String(fromQuestion.id);
    this.answerMap[key] ??= {};
    this.answerMap[key][this.getAnswerKey(answer)] = toQuestion.id;
    return this;
  }

  /**
   * Adds a branching rule to `question`, after its existing rules.
   * Throws a `TypeError` unless the rule has exactly one of `goTo` or `end`, and a `RangeError` if either
   * question is not part of this survey.
   */
  addRule(question: Question, rule: Rule): this {
    assertRuleShape(rule);
    const own = this.getQuestionById(question.id);
    if (!own) {
      throw new RangeError(`Question "${String(question.id)}" is not part of this survey`);
    }
    if (!isNil(rule.goTo)) {
      this.assertMember(rule.goTo);
    }
    own.rules.push({ ...rule });
    return this;
  }

  /**
   * Whether the survey takes new responses now: its `status` is not `draft` or `closed`, `now` is inside
   * `opensAt`..`closesAt`, and fewer than `maxResponses` have been completed. Pass `responses` (the number of
   * completed responses so far) to check `maxResponses`; it is ignored otherwise.
   */
  availability({ now = new Date(), responses }: { now?: Date; responses?: number } = {}): Availability {
    if (this.status === 'draft' || this.status === 'closed') {
      return { accepting: false, reason: this.status };
    }
    const time = now.getTime();
    if (this.opensAt !== undefined && time < Date.parse(this.opensAt)) {
      return { accepting: false, reason: 'not_yet_open' };
    }
    if (this.closesAt !== undefined && time >= Date.parse(this.closesAt)) {
      return { accepting: false, reason: 'past_close' };
    }
    if (this.maxResponses !== undefined && responses !== undefined && responses >= this.maxResponses) {
      return { accepting: false, reason: 'full' };
    }
    return { accepting: true };
  }

  /** Shorthand for `availability(options).accepting`. */
  isAcceptingResponses(options: { now?: Date; responses?: number } = {}): boolean {
    return this.availability(options).accepting;
  }

  toJSON(): SurveyDefinitionJSON {
    return {
      schemaVersion: SCHEMA_VERSION,
      id: this.id,
      version: this.version,
      title: this.title,
      description: this.description,
      questions: this.questions,
      answerMap: this.answerMap,
      customKey: this.customKey,
      keepAbandonedAnswers: this.keepAbandonedAnswers,
      ...(Object.keys(this.variables).length > 0 ? { variables: this.variables } : {}),
      ...(this.defaultLocale === undefined ? {} : { defaultLocale: this.defaultLocale }),
      ...(Object.keys(this.translations).length > 0 ? { translations: this.translations } : {}),
      ...(this.status === undefined ? {} : { status: this.status }),
      ...(this.opensAt === undefined ? {} : { opensAt: this.opensAt }),
      ...(this.closesAt === undefined ? {} : { closesAt: this.closesAt }),
      ...(this.maxResponses === undefined ? {} : { maxResponses: this.maxResponses }),
      ...(Object.keys(this.sections).length > 0 ? { sections: this.sections } : {}),
      ...(this.quotas.length > 0 ? { quotas: this.quotas } : {}),
    };
  }

  private assertMember(id: QuestionId): void {
    if (this.indexOf(id) === undefined) {
      throw new RangeError(`Question "${String(id)}" is not part of this survey`);
    }
  }
}
