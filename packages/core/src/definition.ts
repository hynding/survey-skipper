import type { Answer } from './answer';
import { Question, type QuestionId, type QuestionInput } from './question';
import { assertRuleShape, type Rule } from './rules';
import { isNil } from './utils';

/** The version of the JSON shapes produced by `toJSON()`. Bumped when they change incompatibly. */
export const SCHEMA_VERSION = 1;

/**
 * Value-based jumps: `answerMap[fromQuestionId][answerKey] = toQuestionId`.
 * The answer key is the answer's value, or the definition's `customKey` for custom answers.
 * Rules on questions are checked first; see {@link Rule}.
 */
export type AnswerMap = Record<string, Record<string, QuestionId>>;

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
    return Array.isArray(answer.value) ? answer.value.map(String).join(',') : String(answer.value);
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
    };
  }

  private assertMember(id: QuestionId): void {
    if (this.indexOf(id) === undefined) {
      throw new RangeError(`Question "${String(id)}" is not part of this survey`);
    }
  }
}
