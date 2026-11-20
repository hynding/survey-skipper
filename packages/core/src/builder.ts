import type { AnswerValue, ScalarValue } from './answer.js';
import { SurveyDefinition, type SurveyDefinitionInput } from './definition.js';
import type { QuestionId, QuestionInput } from './question.js';
import type { Condition, Rule } from './rules.js';

/** A JsonLogic `var` reference, e.g. `v('answers.age')` or `v('context.role')`. */
export function v(path: string): Condition {
  return { var: path };
}

const ref = (path: string): Condition => v(path);

/** `path == value` (loose, like JsonLogic). */
export const eq = (path: string, value: unknown): Condition => ({ '==': [ref(path), value] });
/** `path != value`. */
export const ne = (path: string, value: unknown): Condition => ({ '!=': [ref(path), value] });
export const gt = (path: string, value: number | string): Condition => ({ '>': [ref(path), value] });
export const gte = (path: string, value: number | string): Condition => ({ '>=': [ref(path), value] });
export const lt = (path: string, value: number | string): Condition => ({ '<': [ref(path), value] });
export const lte = (path: string, value: number | string): Condition => ({ '<=': [ref(path), value] });
/** The value at `path` is one of `values`. */
export const oneOf = (path: string, values: ScalarValue[]): Condition => ({ in: [ref(path), values] });
/** The list (or text) at `path` contains `value`. */
export const includes = (path: string, value: ScalarValue): Condition => ({ in: [value, ref(path)] });
/** The question has a valid answer. */
export const answered = (id: QuestionId): Condition => ({ answered: id });
/** The value at `path` matches the regular expression. */
export const matches = (path: string, pattern: string): Condition => ({ matches: [ref(path), pattern] });
export const and = (...conditions: Condition[]): Condition => ({ and: conditions });
export const or = (...conditions: Condition[]): Condition => ({ or: conditions });
export const not = (condition: Condition): Condition => ({ '!': condition });

/** Options for one question; everything in `QuestionInput` except `id`, with plain answer values allowed. */
export type QuestionOptions = Omit<QuestionInput, 'id' | 'answers'> & {
  /** Answer options, as values or full answer inputs. */
  answers?: (AnswerValue | NonNullable<QuestionInput['answers']>[number])[];
};

/** Adds rules and conditions to one question. Returned by the callback passed to {@link SurveyBuilder.question}. */
export class QuestionBuilder {
  constructor(private readonly input: QuestionInput & { rules: Rule[] }) {}

  /** Go to `target` when `condition` holds (always, without a condition). */
  goTo(target: QuestionId, condition?: Condition): this {
    this.input.rules.push(condition === undefined ? { goTo: target } : { if: condition, goTo: target });
    return this;
  }

  /** End the survey with the named `ending` when `condition` holds (always, without a condition). */
  end(ending: string, condition?: Condition): this {
    this.input.rules.push(condition === undefined ? { end: ending } : { if: condition, end: ending });
    return this;
  }

  showIf(condition: Condition): this {
    this.input.showIf = condition;
    return this;
  }

  skipIf(condition: Condition): this {
    this.input.skipIf = condition;
    return this;
  }

  required(required = true): this {
    this.input.required = required;
    return this;
  }
}

/**
 * Builds a {@link SurveyDefinition} step by step.
 *
 * ```ts
 * const definition = survey('commute', { version: 1 })
 *   .question('age', { type: 'number' }, (q) => q.end('too_young', lt('answer', 18)))
 *   .question('team', { type: 'number' }, (q) => q.showIf(eq('context.role', 'manager')))
 *   .build();
 * ```
 */
export class SurveyBuilder {
  private readonly questions: (QuestionInput & { rules: Rule[] })[] = [];

  constructor(private readonly options: Omit<SurveyDefinitionInput, 'questions'> = {}) {}

  question(id: QuestionId, options: QuestionOptions = {}, configure?: (q: QuestionBuilder) => unknown): this {
    const { answers, ...rest } = options;
    const input: QuestionInput & { rules: Rule[] } = {
      ...rest,
      id,
      rules: [...(rest.rules ?? [])],
      ...(answers === undefined
        ? {}
        : { answers: answers.map((a) => (isAnswerInput(a) ? a : { value: a })) }),
    };
    configure?.(new QuestionBuilder(input));
    this.questions.push(input);
    return this;
  }

  /** The plain definition input, ready for JSON or YAML. */
  toInput(): SurveyDefinitionInput {
    return { ...this.options, questions: this.questions.map((q) => ({ ...q, rules: [...q.rules] })) };
  }

  build(): SurveyDefinition {
    return new SurveyDefinition(this.toInput());
  }
}

/** Starts building a survey definition. */
export function survey(id?: string | number, options: Omit<SurveyDefinitionInput, 'questions' | 'id'> = {}): SurveyBuilder {
  return new SurveyBuilder(id === undefined ? options : { ...options, id });
}

function isAnswerInput(a: unknown): a is NonNullable<QuestionInput['answers']>[number] {
  return a !== null && typeof a === 'object' && !Array.isArray(a);
}
