import { Answer, type AnswerInput } from './answer';
import { Question, type QuestionId, type QuestionInput } from './question';
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
}

export class Survey {
  id: string | number | undefined;
  title: string | undefined;
  description: string | undefined;
  questions: Question[];
  answers: Record<string, Answer>;
  answerMap: AnswerMap;
  customKey: string;
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
      this.answers[String(q.id)] = Answer.from(answer);
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
    const visited = new Set<number>();
    let q = this.getQuestion();
    while (q) {
      if (visited.has(this.index)) {
        this.index = this.questions.length;
        return null;
      }
      visited.add(this.index);
      this.index = this.nextIndexFrom(q);
      q = this.getQuestion();
      if (!q || !this.answers[String(q.id)]?.isValid()) {
        return q;
      }
    }
    return null;
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

  private indexOf(id: QuestionId): number | undefined {
    return this.idMap.get(String(id));
  }

  private nextIndexFrom(q: Question): number {
    const answer = this.answers[String(q.id)];
    const targetId = answer?.isValid() ? this.answerMap[String(q.id)]?.[this.getAnswerKey(answer)] : undefined;
    const target = targetId === undefined ? undefined : this.indexOf(targetId);
    return target ?? this.index + 1;
  }
}
