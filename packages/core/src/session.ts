import { Answer, valueKey, type AnswerInput, type AnswerValue } from './answer.js';
import { SCHEMA_VERSION, SurveyDefinition, type SurveyDefinitionInput } from './definition.js';
import type { Question, QuestionId } from './question.js';
import { compute, evaluate, type RuleData } from './rules.js';
import { OVER_QUOTA, type Quota } from './quotas.js';
import { scoreAnswers, type Score } from './scoring.js';
import { validateAnswer, type ValidationError } from './validation.js';

/** Events a session emits, with the payload each listener receives. */
export interface SessionEvents {
  /** An answer was stored. */
  answer: { question: Question; answer: Answer };
  /** `session.answer()` rejected an answer. */
  invalid: { question: Question; errors: ValidationError[] };
  /** The session moved forward. `to` is `null` when it finished. */
  navigate: { from: Question | null; to: Question | null };
  /** The session went back. */
  back: { from: Question | null; to: Question };
  /** The session finished, on a named ending or by running past the last question. */
  complete: { ending: string | undefined };
}

export type SessionListener<K extends keyof SessionEvents> = (event: SessionEvents[K]) => void;

const TEMPLATE = /\{\{\s*([^{}\s]+)\s*\}\}/g;
import { isNil } from './utils.js';

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
  /** What happened so far, oldest first. */
  timeline?: TimelineEvent[];
  /** Seeds the session's shuffled option and section order, so it stays the same across back, resume and reload. */
  seed?: number;
}

/** Something that happened in a session, with when it happened. */
export interface TimelineEvent {
  type: 'shown' | 'answered' | 'changed' | 'skipped' | 'back' | 'complete';
  /** The question involved, for every type except `complete`. */
  questionId?: QuestionId;
  /** The stored value, for `answered` and `changed`. */
  value?: AnswerValue | null;
  /** The named ending, for `complete`. */
  ending?: string;
  /** ISO 8601 timestamp. */
  at: string;
}

/** Options that are not part of a session's saved state. */
export interface SessionOptions {
  /** The clock used for timeline timestamps. Defaults to the system clock. */
  now?: () => Date;
  /** Makes the seed for a new session's shuffled order. Defaults to `Math.random`-based. */
  random?: () => number;
  /**
   * Completed responses counted toward each of the definition's quotas so far, by quota id (see `countQuotas`).
   * Without it, quotas are not enforced.
   */
  quotaCounts?: Record<string, number>;
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
  timeline: TimelineEvent[];
  seed: number;
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
  /**
   * What happened so far, oldest first: questions shown, answered, changed or routed past, steps back, and completion.
   * Saved with the session.
   */
  timeline: TimelineEvent[];
  /** Seeds this session's shuffled order. Saved with the session. */
  readonly seed: number;
  /**
   * The order questions are asked in when no rule or answer map says otherwise: the definition's order, with
   * randomized sections shuffled. `order[position]` is a question index; `positions[index]` is the reverse.
   */
  private readonly order: number[];
  private readonly positions: number[];
  /** For each randomized section block, the definition index of its first question → the shuffled first. */
  private readonly blockEntry = new Map<number, number>();
  /** Completed responses per quota, from the `quotaCounts` option. Update it when counts change. */
  quotaCounts: Record<string, number> | undefined;
  private readonly now: () => Date;
  private readonly listeners = new Map<keyof SessionEvents, Set<(event: never) => void>>();

  constructor(definition: SurveyDefinition | SurveyDefinitionInput, state: SessionState = {}, options: SessionOptions = {}) {
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
    this.timeline = (state.timeline ?? []).map((event) => ({ ...event }));
    this.now = options.now ?? (() => new Date());
    this.quotaCounts = options.quotaCounts === undefined ? undefined : { ...options.quotaCounts };
    this.seed = state.seed ?? Math.floor((options.random ?? Math.random)() * 2 ** 32);
    this.order = this.questions.map((_q, i) => i);
    this.shuffleSections();
    this.positions = [];
    this.order.forEach((index, position) => {
      this.positions[index] = position;
    });
    if (state.finished) {
      this.index = this.questions.length;
    } else if (!isNil(state.currentQuestionId)) {
      this.index = this.definition.indexOf(state.currentQuestionId) ?? this.order[0] ?? 0;
    } else {
      this.index = this.order[0] ?? 0;
    }
    this.settled =
      !!state.finished || !isNil(state.currentQuestionId) || this.history.length > 0 || this.forward.length > 0;
  }

  /** Listens for a session event. Returns a function that removes the listener. */
  on<K extends keyof SessionEvents>(event: K, listener: SessionListener<K>): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener);
    return () => {
      set.delete(listener);
    };
  }

  /**
   * Fills `{{path}}` placeholders in `template` from the rule data: `{{answers.q1}}`, `{{context.name}}`, or
   * `{{answer}}` for `question`'s own answer. Lists are joined with `, `; missing values become empty text.
   */
  renderText(template: string, question?: Question | null): string {
    const data = this.getRuleData(question ?? this.getQuestion());
    return template.replace(TEMPLATE, (_match, path: string) => formatValue(lookup(data, path)));
  }

  /**
   * The question's text in the session's locale, with placeholders filled in. Defaults to the current question.
   * Falls back from `fr-CA` to `fr` to the plain `text`.
   */
  getQuestionText(question?: Question | null): string {
    const q = question ?? this.getQuestion();
    if (!q) {
      return '';
    }
    const text = this.pick(q.translations, (t) => t.text) ?? q.text;
    return text === undefined ? '' : this.renderText(text, q);
  }

  /** An answer option's text in the session's locale, falling back to its own `text`. */
  getAnswerText(answer: Answer, question?: Question | null): string {
    const q = question ?? this.getQuestion();
    const key = valueKey(answer.value);
    const translated = q ? this.pick(q.translations, (t) => t.answers?.[key]) : undefined;
    return translated ?? answer.text ?? '';
  }

  /**
   * The question's answer options in the order this respondent sees them: shuffled when the question has
   * `randomize`, with `fixed` and custom options kept in place. The order is the same every time for a session.
   */
  getOptions(question?: Question | null): Answer[] {
    const q = question ?? this.getQuestion();
    if (!q) {
      return [];
    }
    const all = [...this.carriedOptions(q), ...q.answers];
    if (!q.randomize) {
      return all;
    }
    const movable = all.filter((a) => !a.fixed && !a.isCustom);
    shuffle(movable, random(this.seed ^ hash(String(q.id))));
    let next = 0;
    return all.map((a) => (a.fixed || a.isCustom ? a : (movable[next++] ?? a)));
  }

  /** The options `q` carries forward from an earlier question (`answersFrom`), in that question's order. */
  private carriedOptions(q: Question, seen = new Set<string>()): Answer[] {
    const from = q.answersFrom;
    if (!from || seen.has(String(q.id))) {
      return [];
    }
    seen.add(String(q.id));
    const source = this.definition.getQuestionById(from.question);
    if (!source) {
      return [];
    }
    const sourceOptions = [...this.carriedOptions(source, seen), ...source.answers].filter((a) => !a.isCustom);
    const include = from.include ?? 'selected';
    if (include === 'all') {
      return sourceOptions;
    }
    const answer = this.answers[String(source.id)];
    const picked = answer?.isValid() ? (Array.isArray(answer.value) ? answer.value : [answer.value]).map(String) : [];
    return sourceOptions.filter((a) => picked.includes(valueKey(a.value)) === (include === 'selected'));
  }

  /** The survey title in the session's locale. */
  getTitle(): string | undefined {
    return this.pick(this.definition.translations, (t) => t.title) ?? this.definition.title;
  }

  /** The survey description in the session's locale. */
  getDescription(): string | undefined {
    return this.pick(this.definition.translations, (t) => t.description) ?? this.definition.description;
  }

  /** The session's locale: `context.locale` when it is a string, otherwise the definition's `defaultLocale`. */
  get locale(): string | undefined {
    const fromContext = this.context.locale;
    return typeof fromContext === 'string' ? fromContext : this.definition.defaultLocale;
  }

  /**
   * The current page: the current question, then the following questions in the same `section` along the route
   * the current answers lead to, leaving out hidden ones. Questions without a section are a page of their own.
   * Call it again after each answer, because answers can change which questions the page holds.
   */
  getPage(): Question[] {
    const first = this.getQuestion();
    if (!first) {
      return [];
    }
    const page = [first];
    if (first.section === undefined) {
      return page;
    }
    const seen = new Set<number>([this.index]);
    let index = this.index;
    let q: Question = first;
    for (;;) {
      const route = this.routeFrom(q, index);
      if (route.ending !== undefined || seen.has(route.index)) {
        break;
      }
      index = route.index;
      seen.add(index);
      const nextQuestion = this.questions[index];
      if (!nextQuestion || nextQuestion.section !== first.section) {
        break;
      }
      q = nextQuestion;
      if (this.isShown(q)) {
        page.push(q);
      }
    }
    return page;
  }

  /**
   * Moves past the current page and returns the next one, or `null` when the session is finished. Answer the page's
   * questions first (with `answer()` or `setAnswer(answer, question)`). Going back from the new page returns to the
   * first question of this one.
   */
  nextPage(): Question[] | null {
    const start = this.getQuestion();
    if (!start) {
      return null;
    }
    const historyLength = this.history.length;
    let next = this.getNextQuestion();
    while (next && start.section !== undefined && next.section === start.section) {
      next = this.getNextQuestion();
    }
    this.history.splice(historyLength + 1);
    return next ? this.getPage() : null;
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
    const score = scoreAnswers(this.definition, this.answers);
    const data: RuleData = {
      answers,
      context: this.context,
      answer: own ?? null,
      vars: {},
      score: score.total,
      scores: score.sections,
      skipped: this.getSkipped().map(String),
    };
    for (const [name, expression] of Object.entries(this.definition.variables)) {
      data.vars[name] = compute(expression, data);
    }
    return data;
  }

  /**
   * The respondent's score: the `score`s of the options they picked, in total and by section. Readable in conditions
   * and piped text as `score` and `scores.<section>`.
   */
  getScore(): Score {
    return scoreAnswers(this.definition, this.answers);
  }

  /** The definition's computed variables, evaluated against the current answers and context. */
  getVariables(): Record<string, unknown> {
    return this.getRuleData(null).vars;
  }

  /**
   * Whether `question` would be asked: its `showIf` holds (or is unset) and its `skipIf` does not hold (or is unset).
   * A question with `answersFrom` is also routed past when no options carry forward.
   */
  isShown(question: Question): boolean {
    if (question.answersFrom && this.carriedOptions(question).length === 0) {
      return false;
    }
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
    const errors = validateAnswer(target, answer, this.getOptions(target));
    if (errors.length === 0) {
      this.setAnswer(answer, target);
    } else {
      this.emit('invalid', { question: target, errors });
    }
    return { ok: errors.length === 0, errors };
  }

  /** Validates the stored answer to the current question, or to `question` when given. */
  validate(question?: Question): ValidationError[] {
    const target = question ?? this.getQuestion();
    return target ? validateAnswer(target, this.answers[String(target.id)], this.getOptions(target)) : [];
  }

  /** Answers the current question, or `futureQuestion` when given (a pre-answer), without validating. */
  setAnswer(answer: Answer | AnswerInput, futureQuestion?: Question): this {
    this.settle();
    const q = futureQuestion ?? this.getQuestion();
    if (q) {
      const key = String(q.id);
      const stored = Answer.from(answer);
      const previous = this.answers[key];
      this.answers[key] = stored;
      this.record({
        type: previous?.isValid() ? 'changed' : 'answered',
        questionId: q.id,
        value: stored.value ?? null,
      });
      Reflect.deleteProperty(this.abandonedAnswers, key);
      this.emit('answer', { question: q, answer: stored });
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
    let next = this.advance(start);
    const full = next ? this.fullQuota() : undefined;
    if (full) {
      this.index = this.questions.length;
      this.ending = full.end ?? OVER_QUOTA;
      next = null;
    }
    this.reconcileForward(next);
    if (start) {
      if (next) {
        this.record({ type: 'shown', questionId: next.id });
      } else {
        this.record({ type: 'complete', ...(this.ending === undefined ? {} : { ending: this.ending }) });
      }
      this.emit('navigate', { from: start, to: next });
      if (!next) {
        this.emit('complete', { ending: this.ending });
      }
    }
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

  /**
   * Questions routed past without being asked (hidden, pre-answered, or with no options to carry forward) on the
   * respondent's current route, oldest first. Stepping back past the point where a question was routed past removes
   * it again. Rules read this with the `skipped` operator.
   */
  getSkipped(): QuestionId[] {
    const skips: { id: QuestionId; at: number }[] = [];
    const lastShown = new Map<string, number>();
    this.timeline.forEach((event, i) => {
      const key = event.questionId === undefined ? undefined : String(event.questionId);
      if (event.type === 'skipped' && event.questionId !== undefined && key !== undefined) {
        if (!skips.some((s) => String(s.id) === key)) {
          skips.push({ id: event.questionId, at: i });
        }
      } else if (event.type === 'shown' && key !== undefined) {
        lastShown.set(key, i);
        const at = skips.findIndex((s) => String(s.id) === key);
        if (at !== -1) {
          skips.splice(at, 1);
        }
      } else if (event.type === 'back' && key !== undefined) {
        const since = lastShown.get(key) ?? -1;
        for (let j = skips.length - 1; j >= 0; j--) {
          if ((skips[j]?.at ?? 0) > since) {
            skips.splice(j, 1);
          }
        }
      }
    });
    return skips.map((s) => s.id);
  }

  /** Whether this respondent's answers and context so far match a quota's condition. */
  matchesQuota(quota: Quota): boolean {
    return evaluate(quota.if, this.getRuleData(null));
  }

  /** The first full quota (by `quotaCounts`) this respondent matches, if any. */
  fullQuota(): Quota | undefined {
    const counts = this.quotaCounts;
    if (!counts) {
      return undefined;
    }
    return this.definition.quotas.find((q) => (counts[q.id] ?? 0) >= q.limit && this.matchesQuota(q));
  }

  /**
   * Finishes the session on the quota's ending if the respondent matches a full quota, and returns that quota. Call
   * it after setting context on a new session, to screen respondents out before the first question. Moving forward
   * checks quotas on its own.
   */
  checkQuotas(): Quota | undefined {
    const full = this.fullQuota();
    const current = this.getQuestion();
    if (full && current) {
      this.index = this.questions.length;
      this.ending = full.end ?? OVER_QUOTA;
      this.record({ type: 'complete', ending: this.ending });
      this.emit('navigate', { from: current, to: null });
      this.emit('complete', { ending: this.ending });
    }
    return full;
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
    const to = this.getQuestion(previousId);
    if (to) {
      this.record({ type: 'back', questionId: to.id });
      this.emit('back', { from: current, to });
    }
    return to;
  }

  /**
   * Whether {@link goTo} can move to `id`: the current question, a question earlier on the respondent's route, or one
   * they stepped back past and can reach again with the answers they already gave.
   */
  canGoTo(id: QuestionId): boolean {
    const key = String(id);
    const current = this.getQuestion();
    if (current && String(current.id) === key) {
      return true;
    }
    if (this.history.some((h) => String(h) === key)) {
      return true;
    }
    return this.forwardSteps(key) !== undefined;
  }

  /**
   * Jumps to a question on the respondent's route, like pressing Back or Next several times. Earlier questions are
   * reached by stepping back, so later answers are kept until the route changes. Questions the respondent stepped
   * back past are reached by stepping forward through their stored answers. Any other question would skip the
   * survey's rules, so it throws a `RangeError`; check {@link canGoTo} first. Returns the question moved to.
   */
  goTo(id: QuestionId): Question | null {
    const key = String(id);
    const current = this.getQuestion();
    if (current && String(current.id) === key) {
      return current;
    }
    if (this.history.some((h) => String(h) === key)) {
      let q: Question | null = current;
      while (this.history.length > 0 && (!q || String(q.id) !== key)) {
        q = this.back();
      }
      return q;
    }
    const steps = this.forwardSteps(key);
    if (steps === undefined) {
      throw new RangeError(`Question "${key}" is not on the respondent's route`);
    }
    let q: Question | null = current;
    for (let i = 0; i < steps && q && String(q.id) !== key; i++) {
      q = this.getNextQuestion();
    }
    return q;
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
      timeline: this.timeline,
      ending: this.ending,
      seed: this.seed,
    };
  }

  /** Shuffles each run of consecutive questions that share a randomized section. */
  private shuffleSections(): void {
    const sections = this.definition.sections;
    let start = 0;
    while (start < this.questions.length) {
      const name = this.questions[start]?.section;
      let end = start + 1;
      while (name !== undefined && end < this.questions.length && this.questions[end]?.section === name) {
        end++;
      }
      if (name !== undefined && sections[name]?.randomize && end - start > 1) {
        const block = this.order.slice(start, end);
        shuffle(block, random(this.seed ^ hash(`section:${name}:${String(start)}`)));
        this.order.splice(start, end - start, ...block);
        this.blockEntry.set(start, block[0] ?? start);
      }
      start = end;
    }
  }

  /** The question after `index` in this session's order, or the question count past the last one. */
  private nextInOrder(index: number): number {
    const position = this.positions[index];
    return position === undefined ? index + 1 : (this.order[position + 1] ?? this.questions.length);
  }

  private pick<T>(translations: Record<string, T>, get: (t: T) => string | undefined): string | undefined {
    const locale = this.locale;
    if (locale === undefined) {
      return undefined;
    }
    const candidates = [locale, locale.split('-')[0] ?? locale];
    for (const candidate of candidates) {
      const t = translations[candidate];
      const value = t === undefined ? undefined : get(t);
      if (value !== undefined) {
        return value;
      }
    }
    return undefined;
  }

  private emit<K extends keyof SessionEvents>(event: K, payload: SessionEvents[K]): void {
    const set = this.listeners.get(event) as Set<SessionListener<K>> | undefined;
    set?.forEach((listener) => {
      listener(payload);
    });
  }

  private settle(): void {
    if (this.settled) {
      return;
    }
    this.settled = true;
    const first = this.questions[this.index];
    if (first && (!this.isShown(first) || this.isPreAnswered(first))) {
      this.record({ type: 'skipped', questionId: first.id });
      this.advance(first);
    }
    const current = this.questions[this.index];
    if (current) {
      this.record({ type: 'shown', questionId: current.id });
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
      const route = this.routeFrom(q, this.index);
      if (route.ending !== undefined) {
        this.ending = route.ending;
      }
      this.index = route.index;
      q = this.questions[this.index] ?? null;
      if (!q) {
        return null;
      }
      if (this.isShown(q) && !this.isPreAnswered(q)) {
        return q;
      }
      this.record({ type: 'skipped', questionId: q.id });
    }
    return null;
  }

  private record(event: Omit<TimelineEvent, 'at'>): void {
    this.timeline.push({ ...event, at: this.now().toISOString() });
  }

  /**
   * How many Next steps reach `key` along the stepped-back route, or `undefined` if it is not there or a question on
   * the way has no valid answer.
   */
  private forwardSteps(key: string): number | undefined {
    const ahead = [...this.forward].reverse();
    const position = ahead.findIndex((id) => String(id) === key);
    if (position === -1) {
      return undefined;
    }
    const current = this.getQuestion();
    const onTheWay = [current?.id, ...ahead.slice(0, position)];
    const answered = onTheWay.every((qid) => qid !== undefined && !!this.answers[String(qid)]?.isValid());
    return answered ? position + 1 : undefined;
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
  private routeFrom(q: Question, index: number): { index: number; ending?: string } {
    if (q.rules.length > 0) {
      const data = this.getRuleData(q);
      for (const rule of q.rules) {
        if (!evaluate(rule.if, data)) {
          continue;
        }
        if (typeof rule.end === 'string' && rule.end.length > 0) {
          return { index: this.questions.length, ending: rule.end };
        }
        const target = isNil(rule.goTo) ? undefined : this.definition.indexOf(rule.goTo);
        if (target !== undefined) {
          return { index: this.blockEntry.get(target) ?? target };
        }
      }
    }
    const answer = this.answers[String(q.id)];
    const targetId = answer?.isValid()
      ? this.definition.answerMap[String(q.id)]?.[this.definition.getAnswerKey(answer)]
      : undefined;
    const target = targetId === undefined ? undefined : this.definition.indexOf(targetId);
    return { index: target === undefined ? this.nextInOrder(index) : (this.blockEntry.get(target) ?? target) };
  }
}

/** A small seeded random number generator (mulberry32), returning numbers in [0, 1). */
function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A 32-bit string hash (FNV-1a). */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  }
  return h >>> 0;
}

/** Shuffles `items` in place (Fisher-Yates). */
function shuffle(items: unknown[], rand: () => number): void {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
}

function wrapAnswers(answers: Record<string, Answer | AnswerInput> | undefined): Record<string, Answer> {
  return Object.fromEntries(Object.entries(answers ?? {}).map(([id, answer]) => [id, Answer.from(answer)]));
}

function lookup(data: unknown, path: string): unknown {
  let value: unknown = data;
  for (const part of path.split('.')) {
    if (value === null || typeof value !== 'object') {
      return undefined;
    }
    value = (value as Record<string, unknown>)[part];
  }
  return value;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (Array.isArray(value)) {
    return value.map(formatValue).join(', ');
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return JSON.stringify(value);
}
