import { Answer, type AnswerInput, type AnswerValue } from './answer';
import { SCHEMA_VERSION, SurveyDefinition, type SurveyDefinitionInput } from './definition';
import type { Question, QuestionId } from './question';
import { evaluate, type RuleData } from './rules';
import { validateAnswer, type ValidationError } from './validation';
import { isNil } from './utils';

/** A respondent's progress through a survey. Restores a {@link SurveySession}; {@link SurveySession.toJSON} produces it. */
export interface SessionState {
  /** The `toJSON()` schema version the state was written with. Newer than {@link SCHEMA_VERSION} is rejected. */
  schemaVersion?: number;
  /** The id of the definition the session ran against, for your own bookkeeping. */
  definitionId?: string | number;
  /** The version of the definition the session ran against, for your own bookkeeping. */
  definitionVersion?: string | number;
  /** Answers keyed by question id. Plain objects are wrapped in {@link Answer}. */
  answers?: Record<string, Answer | AnswerInput>;
  /** Answers left behind on a route the respondent no longer takes. */
  abandonedAnswers?: Record<string, Answer | AnswerInput>;
  /** Questions already shown and moved past, oldest first. */
  history?: QuestionId[];
  /** Questions stepped back over, next one last. */
  forward?: QuestionId[];
  /** The question to resume at. */
  currentQuestionId?: QuestionId;
  /** Whether the respondent has finished. Takes precedence over `currentQuestionId`. */
  finished?: boolean;
  /** Facts about the respondent or situation that rules can read as `context.*`. */
  context?: Record<string, unknown>;
  /** The named ending the session finished on, if any. */
  ending?: string;
}

/** What {@link SurveySession.toJSON} returns. */
export interface SessionJSON extends SessionState {
  schemaVersion: number;
  answers: Record<string, Answer>;
  abandonedAnswers: Record<string, Answer>;
  history: QuestionId[];
  forward: QuestionId[];
  finished: boolean;
  context: Record<string, unknown>;
}

/**
 * One respondent working through a {@link SurveyDefinition}: their answers, context, position and history.
 * Many sessions can share one definition.
 */
export class SurveySession {
  readonly definition: SurveyDefinition;
  answers: Record<string, Answer>;
  /**
   * Answers to questions that are no longer on the respondent's path, keyed by question id. They are not used
   * for routing or skipping. If the respondent reaches the question again, it is asked again, and answering it
   * removes the entry here. Only filled when the definition's `keepAbandonedAnswers` is on.
   */
  abandonedAnswers: Record<string, Answer>;
  /** Questions the respondent was shown and moved past, oldest first. Questions routed past unasked are not included. */
  history: QuestionId[];
  /**
   * Questions stepped back over with {@link back}, the next one last. Moving forward along the same route
   * consumes them; taking a different route abandons them.
   */
  forward: QuestionId[];
  /** Facts about the respondent or situation that rules can read as `context.*`. Can change mid-survey. */
  context: Record<string, unknown>;
  /** The named ending a rule finished the session on, or `undefined` if it is unfinished or ran off the end. */
  ending: string | undefined;
  /** Position of the current question in the definition's questions. Equal to their count once finished. */
  index = 0;
  /**
   * Whether the starting question has been checked against `showIf`, `skipIf` and pre-answers. That check
   * waits until the session is first read, so context set after construction still counts.
   */
  private settled: boolean;

  constructor(definition: SurveyDefinition | SurveyDefinitionInput, state: SessionState = {}) {
    if (!isNil(state.schemaVersion) && state.schemaVersion > SCHEMA_VERSION) {
      throw new RangeError(
        `Session schema version ${String(state.schemaVersion)} is newer than this library supports (${String(SCHEMA_VERSION)})`,
      );
    }
    this.definition = SurveyDefinition.from(definition);
    this.answers = wrapAnswers(state.answers);
    this.abandonedAnswers = wrapAnswers(state.abandonedAnswers);
    this.history = [...(state.history ?? [])];
    this.forward = [...(state.forward ?? [])];
    this.context = { ...state.context };
    this.ending = state.ending;
    if (state.finished) {
      this.index = this.questions.length;
    } else if (!isNil(state.currentQuestionId)) {
      this.index = this.definition.indexOf(state.currentQuestionId) ?? 0;
    }
    this.settled =
      !!state.finished || !isNil(state.currentQuestionId) || this.history.length > 0 || this.forward.length > 0;
  }

  /** The definition's questions. */
  get questions(): Question[] {
    return this.definition.questions;
  }

  /** Replaces the context. Later routing decisions use the new values. */
  setContext(context: Record<string, unknown>): this {
    this.context = { ...context };
    return this;
  }

  /** The data rules are evaluated against when leaving `question`. Abandoned answers are not included. */
  getRuleData(question?: Question | null): RuleData {
    const answers: Record<string, AnswerValue> = {};
    for (const [id, answer] of Object.entries(this.answers)) {
      if (answer.isValid()) {
        answers[id] = answer.value;
      }
    }
    const own = question ? answers[String(question.id)] : undefined;
    return { answers, context: this.context, answer: own ?? null };
  }

  /**
   * Whether `question` would be asked: its `showIf` holds (or is unset) and its `skipIf` does not hold (or is unset).
   */
  isShown(question: Question): boolean {
    const data = this.getRuleData(question);
    return evaluate(question.showIf, data) && (question.skipIf === undefined || !evaluate(question.skipIf, data));
  }

  /**
   * Returns the current question, or `null` when the session is finished.
   * Passing a known `id` first moves the session to that question.
   * The first time it is read, a starting question that is hidden or already answered is routed past.
   */
  getQuestion(id?: QuestionId): Question | null {
    if (!isNil(id)) {
      this.settled = true;
      this.index = this.definition.indexOf(id) ?? this.index;
    } else {
      this.settle();
    }
    return this.questions[this.index] ?? null;
  }

  /**
   * Validates and stores an answer to the current question, or to `question` when given. Invalid answers are not
   * stored. Returns the validation errors, which are empty on success. Use {@link setAnswer} to store without
   * checking.
   */
  answer(answer: Answer | AnswerInput, question?: Question): { ok: boolean; errors: ValidationError[] } {
    this.settle();
    const target = question ?? this.getQuestion();
    if (!target) {
      return { ok: false, errors: [] };
    }
    const errors = validateAnswer(target, answer);
    if (errors.length === 0) {
      this.setAnswer(answer, target);
    }
    return { ok: errors.length === 0, errors };
  }

  /** Validates the stored answer to the current question, or to `question` when given. */
  validate(question?: Question): ValidationError[] {
    const target = question ?? this.getQuestion();
    return target ? validateAnswer(target, this.answers[String(target.id)]) : [];
  }

  /** Answers the current question, or `futureQuestion` when given (a pre-answer), without validating. */
  setAnswer(answer: Answer | AnswerInput, futureQuestion?: Question): this {
    this.settle();
    const q = futureQuestion ?? this.getQuestion();
    if (q) {
      const key = String(q.id);
      this.answers[key] = Answer.from(answer);
      Reflect.deleteProperty(this.abandonedAnswers, key);
    }
    return this;
  }

  /**
   * Advances past the current question, following its rules, then the answer map, then question order, and
   * routing past questions that are hidden or already answered. Returns `null` when the session is finished
   * (including when answered questions route in a loop with nowhere left to go).
   */
  getNextQuestion(): Question | null {
    const start = this.getQuestion();
    if (start) {
      this.history.push(start.id);
      this.ending = undefined;
    }
    const next = this.advance(start);
    this.reconcileForward(next);
    return next;
  }

  /**
   * Advances like {@link getNextQuestion} and returns up to `num` consecutive questions
   * starting at the next one, or `null` when the session is finished.
   */
  getNextQuestions(num = 1): Question[] | null {
    const nextQuestion = this.getNextQuestion();
    if (!nextQuestion) {
      return null;
    }
    return this.questions.slice(this.index, this.index + Math.max(1, num));
  }

  /**
   * Answers consecutive questions starting at the current one (as returned by
   * {@link getNextQuestions}). Only the last answer's routing affects what comes next.
   */
  setAnswers(answers: (Answer | AnswerInput)[]): this {
    this.settle();
    answers.forEach((answer, offset) => {
      const question = this.questions[this.index + offset];
      if (question) {
        this.setAnswer(answer, question);
      }
    });
    return this;
  }

  /** Whether {@link back} has a question to return to. */
  canGoBack(): boolean {
    return this.history.length > 0;
  }

  /**
   * Returns to the previous question the respondent was shown and makes it current. Its answer, and the answers
   * after it, are kept until the respondent takes a different route. Returns `null`, without moving, when there is
   * nothing to go back to.
   */
  back(): Question | null {
    const previousId = this.history.pop();
    if (previousId === undefined) {
      return null;
    }
    const current = this.getQuestion();
    if (current) {
      this.forward.push(current.id);
    }
    this.ending = undefined;
    return this.getQuestion(previousId);
  }

  /** The questions shown so far, in order, ending with the current question if there is one. */
  getPath(): Question[] {
    const current = this.getQuestion();
    const ids = current ? [...this.history, current.id] : this.history;
    return ids.flatMap((id) => {
      const q = this.definition.getQuestionById(id);
      return q ? [q] : [];
    });
  }

  toJSON(): SessionJSON {
    const current = this.getQuestion();
    return {
      schemaVersion: SCHEMA_VERSION,
      definitionId: this.definition.id,
      definitionVersion: this.definition.version,
      answers: this.answers,
      abandonedAnswers: this.abandonedAnswers,
      history: this.history,
      forward: this.forward,
      currentQuestionId: current?.id,
      finished: !current,
      context: this.context,
      ending: this.ending,
    };
  }

  private settle(): void {
    if (this.settled) {
      return;
    }
    this.settled = true;
    const first = this.questions[this.index];
    if (first && (!this.isShown(first) || this.isPreAnswered(first))) {
      this.advance(first);
    }
  }

  private advance(start: Question | null): Question | null {
    const visited = new Set<number>();
    let q = start;
    while (q) {
      if (visited.has(this.index)) {
        this.index = this.questions.length;
        return null;
      }
      visited.add(this.index);
      this.index = this.nextIndexFrom(q);
      q = this.questions[this.index] ?? null;
      if (!q) {
        return null;
      }
      if (this.isShown(q) && !this.isPreAnswered(q)) {
        return q;
      }
    }
    return null;
  }

  /** A question with a valid answer the respondent has not been shown yet is routed past. */
  private isPreAnswered(q: Question): boolean {
    return !!this.answers[String(q.id)]?.isValid() && !this.forward.some((id) => String(id) === String(q.id));
  }

  /** Follows the stepped-back route while it matches, and abandons it once the route changes. */
  private reconcileForward(next: Question | null): void {
    if (this.forward.length === 0) {
      return;
    }
    const expected = this.forward.at(-1);
    if (next && expected !== undefined && String(expected) === String(next.id)) {
      this.forward.pop();
      return;
    }
    for (const id of this.forward) {
      const key = String(id);
      if (next && key === String(next.id)) {
        continue;
      }
      const answer = this.answers[key];
      if (answer) {
        if (this.definition.keepAbandonedAnswers) {
          this.abandonedAnswers[key] = answer;
        }
        Reflect.deleteProperty(this.answers, key);
      }
    }
    this.forward = [];
  }

  /**
   * Where to go after `q`: the first matching rule (rules with an unknown target are ignored), then the answer map,
   * then the next question in order. An `end` rule moves past the last question and records the ending.
   */
  private nextIndexFrom(q: Question): number {
    if (q.rules.length > 0) {
      const data = this.getRuleData(q);
      for (const rule of q.rules) {
        if (!evaluate(rule.if, data)) {
          continue;
        }
        if (typeof rule.end === 'string' && rule.end.length > 0) {
          this.ending = rule.end;
          return this.questions.length;
        }
        const target = isNil(rule.goTo) ? undefined : this.definition.indexOf(rule.goTo);
        if (target !== undefined) {
          return target;
        }
      }
    }
    const answer = this.answers[String(q.id)];
    const targetId = answer?.isValid()
      ? this.definition.answerMap[String(q.id)]?.[this.definition.getAnswerKey(answer)]
      : undefined;
    const target = targetId === undefined ? undefined : this.definition.indexOf(targetId);
    return target ?? this.index + 1;
  }
}

function wrapAnswers(answers: Record<string, Answer | AnswerInput> | undefined): Record<string, Answer> {
  return Object.fromEntries(Object.entries(answers ?? {}).map(([id, answer]) => [id, Answer.from(answer)]));
}
