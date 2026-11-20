import type { Answer } from './answer.js';
import { SurveyDefinition, type AnswerMap, type SurveyDefinitionInput } from './definition.js';
import type { Question, QuestionId } from './question.js';
import type { Rule } from './rules.js';
import { SurveySession, type SessionState } from './session.js';

/** Definition and session fields together, as accepted by the 2.x {@link Survey} constructor. */
export interface SurveyInput extends SurveyDefinitionInput, SessionState {}

/**
 * A definition and one session in a single object, as in 2.x.
 *
 * @deprecated Use {@link SurveyDefinition} for the survey and a {@link SurveySession} per respondent.
 * `Survey` will be removed in 4.0.
 */
export class Survey extends SurveySession {
  constructor(input: SurveyInput = {}) {
    super(new SurveyDefinition(input), input);
  }

  get id(): string | number | undefined {
    return this.definition.id;
  }

  get title(): string | undefined {
    return this.definition.title;
  }

  get description(): string | undefined {
    return this.definition.description;
  }

  override get questions(): Question[] {
    return this.definition.questions;
  }

  override set questions(questions: Question[]) {
    this.definition.questions = questions;
  }

  get answerMap(): AnswerMap {
    return this.definition.answerMap;
  }

  set answerMap(answerMap: AnswerMap) {
    this.definition.answerMap = answerMap;
  }

  get customKey(): string {
    return this.definition.customKey;
  }

  get keepAbandonedAnswers(): boolean {
    return this.definition.keepAbandonedAnswers;
  }

  set keepAbandonedAnswers(keep: boolean) {
    this.definition.keepAbandonedAnswers = keep;
  }

  /** Rebuilds the id → index lookup after changing `questions` directly, optionally moving to a question. */
  mapIndices(currentQuestionId?: QuestionId): this {
    this.definition.reindex();
    if (currentQuestionId !== undefined) {
      this.getQuestion(currentQuestionId);
    }
    return this;
  }

  mapAnswer(fromQuestion: Question, answer: Answer, toQuestion: Question): this {
    this.definition.mapAnswer(fromQuestion, answer, toQuestion);
    return this;
  }

  addRule(question: Question, rule: Rule): this {
    this.definition.addRule(question, rule);
    return this;
  }

  getAnswerKey(answer: Answer): string {
    return this.definition.getAnswerKey(answer);
  }
}
