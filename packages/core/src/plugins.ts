import jsonLogic from 'json-logic-js';
import type { AnswerValue } from './answer.js';
import type { Question } from './question.js';

/** Checks a value for a custom question type. Returns an error message, or `undefined` when the value is acceptable. */
export type TypeCheck = (value: AnswerValue, question: Question) => string | undefined;

/**
 * A custom validator. Receives the answer value, the question and the `args` from the question's
 * `validation.custom` entry. Returns an error message, or `undefined` when the value passes.
 */
export type Validator = (value: AnswerValue, question: Question, args: unknown) => string | undefined;

const BUILT_IN_OPERATORS = new Set([
  'var', 'missing', 'missing_some', 'if', '==', '===', '!=', '!==', '!', '!!', 'or', 'and', '>', '>=', '<', '<=',
  'max', 'min', '+', '-', '*', '/', '%', 'map', 'filter', 'reduce', 'all', 'none', 'some', 'merge', 'in', 'cat',
  'substr', 'log', 'answered', 'matches',
]);
const BUILT_IN_TYPES = new Set(['single', 'multi', 'text', 'number', 'rating', 'date', 'boolean', 'ranking', 'matrix']);

const types = new Map<string, TypeCheck>();
const validators = new Map<string, Validator>();
const operators = new Set<string>();

/**
 * Adds a JsonLogic operator for conditions and computed variables. The function receives the evaluated arguments,
 * with the rule data as `this`. Throws a `TypeError` for built-in operator names.
 */
export function registerOperator(name: string, fn: (...args: never[]) => unknown): void {
  if (BUILT_IN_OPERATORS.has(name)) {
    throw new TypeError(`"${name}" is a built-in operator and cannot be replaced`);
  }
  jsonLogic.add_operation(name, fn);
  operators.add(name);
}

/** Adds a question type. Questions with `type: name` are checked with `check`. Throws for built-in type names. */
export function registerQuestionType(name: string, check: TypeCheck): void {
  if (BUILT_IN_TYPES.has(name)) {
    throw new TypeError(`"${name}" is a built-in question type and cannot be replaced`);
  }
  types.set(name, check);
}

/** Adds a validator that questions can use through `validation.custom: [{ name, args? }]`. */
export function registerValidator(name: string, validator: Validator): void {
  validators.set(name, validator);
}

/** Removes everything registered through this module. Mainly for tests. */
export function resetPlugins(): void {
  for (const name of operators) {
    jsonLogic.rm_operation(name);
  }
  operators.clear();
  types.clear();
  validators.clear();
}

export function getQuestionType(name: string): TypeCheck | undefined {
  return types.get(name);
}

export function getValidator(name: string): Validator | undefined {
  return validators.get(name);
}

export function isKnownType(name: string): boolean {
  return BUILT_IN_TYPES.has(name) || types.has(name);
}
