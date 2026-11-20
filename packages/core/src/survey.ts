import { Answer, type AnswerInput } from './answer';
import { Question, type QuestionId, type QuestionInput } from './question';
import { assertRuleShape, evaluate, type Rule, type RuleData } from './rules';
import { isNil } from './utils';

/**
 * Branching rules: `answerMap[fromQuestionId][answerKey] = toQuestionId`.
 * The answer key is the answer's value, or the survey's `customKey` for custom answers.
 */
export type AnswerMap = Record<string, Record<string, QuestionId>>;

export interface SurveyInput {
  id?: string | number;
  title?: string;
  description?: string;
  questions?: (Question | QuestionInput)[];
  /** Answers keyed by question id. Plain objects are wrapped in {@link Answer}. */
  answers?: Record<string, Answer | AnswerInput>;
  currentQuestionId?: QuestionId;
  answerMap?: AnswerMap;
  /** Key used in the answer map for custom answers. Defaults to `'*'`. */
  customKey?: string;
  /** Questions already shown and moved past, oldest first. Restores {@link Survey.history}. */
  history?: QuestionId[];
  /** Questions stepped back over, next one last. Restores {@link Survey.forward}. */
  forward?: QuestionId[];
  /** Answers left behind on a path the respondent no longer takes. Restores {@link Survey.abandonedAnswers}. */
  abandonedAnswers?: Record<string, Answer | AnswerInput>;
  /**
   * When going back and taking a different route leaves answered questions off the path, keep those answers in
   * {@link Survey.abandonedAnswers} (`true`, the default) or discard them (`false`).
   */
  keepAbandonedAnswers?: boolean;
  /** Facts about the respondent or situation that rules can read as `context.*`. */
  context?: Record<string, unknown>;
  /** The named ending the survey finished on, if any. Restores {@link Survey.ending}. */
  ending?: string;
}

export class Survey {
  id: string | number | undefined;
  title: string | undefined;
  description: string | undefined;
  questions: Question[];
  answers: Record<string, Answer>;
  answerMap: AnswerMap;
  customKey: string;
  /** Questions the respondent was shown and moved past, oldest first. Pre-answered questions that were skipped are not included. */
  history: QuestionId[];
  /**
   * Questions stepped back over with {@link back}, the next one last. Moving forward along the same route
   * consumes them; taking a different route abandons them.
   */
  forward: QuestionId[];
  /**
   * Answers to questions that are no longer on the respondent's path, keyed by question id. They are not used
   * for routing or skipping. If the respondent reaches the question again, it is asked again, and answering it
   * removes the entry here.
   */
  abandonedAnswers: Record<string, Answer>;
  keepAbandonedAnswers: boolean;
  /** Facts about the respondent or situation that rules can read as `context.*`. Can change mid-survey. */
  context: Record<string, unknown>;
  /** The named ending a rule finished the survey on, or `undefined` if it is unfinished or ran off the end. */
  ending: string | undefined;
  /** Position of the current question in `questions`. Equal to `questions.length` once finished. */
  index = 0;
  private readonly idMap = new Map<string, number>();

  constructor({
    id,
    title,
    description,
    questions = [],
    answers = {},
    currentQuestionId,
    answerMap = {},
    customKey,
    history = [],
    forward = [],
    abandonedAnswers = {},
    keepAbandonedAnswers = true,
    context = {},
    ending,
  }: SurveyInput = {}) {
    this.id = id;
    this.title = title;
    this.description = description;
    this.questions = questions.map((q) => (q instanceof Question ? q : new Question(q)));
    this.answers = Object.fromEntries(
      Object.entries(answers).map(([questionId, answer]) => [questionId, Answer.from(answer)]),
    );
    this.answerMap = answerMap;
    this.customKey = customKey?.length ? customKey : '*';
    this.history = [...history];
    this.forward = [...forward];
    this.abandonedAnswers = Object.fromEntries(
      Object.entries(abandonedAnswers).map(([questionId, answer]) => [questionId, Answer.from(answer)]),
    );
    this.keepAbandonedAnswers = keepAbandonedAnswers;
    this.context = { ...context };
    this.ending = ending;

    this.mapIndices(currentQuestionId);
  }

  /** Rebuilds the id → index lookup. Call after changing `questions` directly. */
  mapIndices(currentQuestionId?: QuestionId): this {
    this.idMap.clear();
    this.questions.forEach((q, i) => {
      this.idMap.set(String(q.id), i);
    });
    if (!isNil(currentQuestionId)) {
      this.index = this.indexOf(currentQuestionId) ?? this.index;
    }
    return this;
  }

  /** Routes `answer` on `fromQuestion` to `toQuestion`. */
  mapAnswer(fromQuestion: Question, answer: Answer, toQuestion: Question): this {
    if (!answer.isValid()) {
      throw new TypeError('Answer value is invalid for mapping');
    }
    if (this.indexOf(toQuestion.id) === undefined) {
      throw new RangeError(`Question "${String(toQuestion.id)}" is not part of this survey`);
    }
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
    const index = this.indexOf(question.id);
    const own = index === undefined ? undefined : this.questions[index];
    if (!own) {
      throw new RangeError(`Question "${String(question.id)}" is not part of this survey`);
    }
    if (!isNil(rule.goTo) && this.indexOf(rule.goTo) === undefined) {
      throw new RangeError(`Question "${String(rule.goTo)}" is not part of this survey`);
    }
    own.rules.push({ ...rule });
    return this;
  }

  /** Replaces the survey's context. Later routing decisions use the new values. */
  setContext(context: Record<string, unknown>): this {
    this.context = { ...context };
    return this;
  }

  /** The data rules are evaluated against when leaving `question`. Abandoned answers are not included. */
  getRuleData(question?: Question | null): RuleData {
    const answers: Record<string, string | number> = {};
    for (const [id, answer] of Object.entries(this.answers)) {
      if (answer.isValid()) {
        answers[id] = answer.value;
      }
    }
    const own = question ? answers[String(question.id)] : undefined;
    return { answers, context: this.context, answer: own ?? null };
  }

  /**
   * Returns the current question, or `null` when the survey is finished.
   * Passing a known `id` first moves the survey to that question.
   */
  getQuestion(id?: QuestionId): Question | null {
    if (!isNil(id)) {
      this.index = this.indexOf(id) ?? this.index;
    }
    return this.questions[this.index] ?? null;
  }

  /** Answers the current question, or `futureQuestion` when given (a pre-answer). */
  setAnswer(answer: Answer | AnswerInput, futureQuestion?: Question): this {
    const q = futureQuestion ?? this.getQuestion();
    if (q) {
      const key = String(q.id);
      this.answers[key] = Answer.from(answer);
      Reflect.deleteProperty(this.abandonedAnswers, key);
    }
    return this;
  }

  getAnswerKey(answer: Answer): string {
    return answer.isCustom ? this.customKey : String(answer.value);
  }

  /**
   * Advances past the current question, following the answer map, and skipping any
   * question that already has a valid answer. Returns `null` when the survey is finished
   * (including when pre-answered questions route in a loop with nowhere left to go).
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
      const index = this.indexOf(id);
      const q = index === undefined ? undefined : this.questions[index];
      return q ? [q] : [];
    });
  }

  /**
   * Advances like {@link getNextQuestion} and returns up to `num` consecutive questions
   * starting at the next one, or `null` when the survey is finished.
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
   * {@link getNextQuestions}). Only the last answer's mapping affects what comes next.
   */
  setAnswers(answers: (Answer | AnswerInput)[]): this {
    answers.forEach((answer, offset) => {
      const question = this.questions[this.index + offset];
      if (question) {
        this.setAnswer(answer, question);
      }
    });
    return this;
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
      q = this.getQuestion();
      if (!q) {
        return null;
      }
      if (this.isShown(q) && !this.isPreAnswered(q)) {
        return q;
      }
    }
    return null;
  }

  /** A question whose `showIf` condition fails is routed past without being asked. */
  private isShown(q: Question): boolean {
    return evaluate(q.showIf, this.getRuleData(q));
  }

  /** A question with a valid answer the respondent has not been shown yet is skipped. */
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
        if (this.keepAbandonedAnswers) {
          this.abandonedAnswers[key] = answer;
        }
        Reflect.deleteProperty(this.answers, key);
      }
    }
    this.forward = [];
  }

  private indexOf(id: QuestionId): number | undefined {
    return this.idMap.get(String(id));
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
        const target = isNil(rule.goTo) ? undefined : this.indexOf(rule.goTo);
        if (target !== undefined) {
          return target;
        }
      }
    }
    const answer = this.answers[String(q.id)];
    const targetId = answer?.isValid() ? this.answerMap[String(q.id)]?.[this.getAnswerKey(answer)] : undefined;
    const target = targetId === undefined ? undefined : this.indexOf(targetId);
    return target ?? this.index + 1;
  }
}
