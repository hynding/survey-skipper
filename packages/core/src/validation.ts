import { Answer, type AnswerInput, type AnswerValue, type ScalarValue } from './answer.js';
import { getQuestionType, getValidator } from './plugins.js';
import type { Question } from './question.js';

export type ValidationCode =
  | 'required'
  | 'type'
  | 'option'
  | 'min'
  | 'max'
  | 'minLength'
  | 'maxLength'
  | 'pattern'
  | 'minSelected'
  | 'maxSelected'
  | 'custom';

export interface ValidationError {
  code: ValidationCode;
  message: string;
  /** The registered validator's name, for `custom` errors. */
  validator?: string;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Checks an answer against the question's `type`, `required` flag, answer options and `validation` rules.
 * Returns an empty list when the answer is acceptable. A missing answer only fails when the question is required.
 */
export function validateAnswer(question: Question, input: Answer | AnswerInput | null | undefined): ValidationError[] {
  const answer = input ? Answer.from(input) : undefined;
  if (!answer?.isValid()) {
    return question.required ? [error('required', 'An answer is required')] : [];
  }
  const typeError = checkType(question, answer.value);
  if (typeError) {
    return [typeError];
  }
  return [...checkOptions(question, answer), ...checkRules(question, answer.value), ...checkCustom(question, answer.value)];
}

function checkType(question: Question, value: AnswerValue): ValidationError | undefined {
  switch (question.type) {
    case undefined:
      return undefined;
    case 'multi':
      return Array.isArray(value) ? undefined : error('type', 'Expected a list of choices');
    case 'single':
      return Array.isArray(value) ? error('type', 'Expected a single choice') : undefined;
    case 'text':
      return typeof value === 'string' ? undefined : error('type', 'Expected text');
    case 'number':
      return typeof value === 'number' && Number.isFinite(value) ? undefined : error('type', 'Expected a number');
    case 'rating':
      return typeof value === 'number' && Number.isInteger(value) ? undefined : error('type', 'Expected a whole number');
    case 'boolean':
      return typeof value === 'boolean' ? undefined : error('type', 'Expected yes or no');
    case 'date':
      return typeof value === 'string' && DATE.test(value) && !Number.isNaN(Date.parse(value))
        ? undefined
        : error('type', 'Expected a date as YYYY-MM-DD');
    default: {
      const message = getQuestionType(question.type)?.(value, question);
      return message === undefined ? undefined : error('type', message);
    }
  }
}

function checkCustom(question: Question, value: AnswerValue): ValidationError[] {
  const errors: ValidationError[] = [];
  for (const entry of question.validation.custom ?? []) {
    const validator = getValidator(entry.name);
    if (!validator) {
      throw new RangeError(`No validator named "${entry.name}" is registered`);
    }
    const message = validator(value, question, entry.args);
    if (message !== undefined) {
      errors.push({ code: 'custom', message: entry.message ?? message, validator: entry.name });
    }
  }
  return errors;
}

function checkOptions(question: Question, answer: Answer): ValidationError[] {
  if (question.type !== 'single' && question.type !== 'multi') {
    return [];
  }
  const options = question.answers.filter((a) => !a.isCustom).map((a) => a.value);
  const allowsCustom = question.answers.some((a) => a.isCustom);
  if (options.length === 0 || allowsCustom || answer.isCustom) {
    return [];
  }
  const values: ScalarValue[] = Array.isArray(answer.value) ? answer.value : [answer.value as ScalarValue];
  const unknown = values.filter((v) => !options.some((o) => o === v));
  return unknown.length > 0 ? [error('option', `Not one of the choices: ${unknown.map(String).join(', ')}`)] : [];
}

function checkRules(question: Question, value: AnswerValue): ValidationError[] {
  const rules = question.validation;
  const errors: ValidationError[] = [];
  const min = rules.min ?? (question.type === 'rating' ? 1 : undefined);
  const max = rules.max ?? (question.type === 'rating' ? 5 : undefined);

  if (Array.isArray(value)) {
    if (rules.minSelected !== undefined && value.length < rules.minSelected) {
      errors.push(error('minSelected', `Choose at least ${String(rules.minSelected)}`));
    }
    if (rules.maxSelected !== undefined && value.length > rules.maxSelected) {
      errors.push(error('maxSelected', `Choose at most ${String(rules.maxSelected)}`));
    }
    return errors;
  }
  if (typeof value === 'number' || (question.type === 'date' && typeof value === 'string')) {
    if (min !== undefined && value < min) {
      errors.push(error('min', `Must be at least ${String(min)}`));
    }
    if (max !== undefined && value > max) {
      errors.push(error('max', `Must be at most ${String(max)}`));
    }
  }
  if (typeof value === 'string' && question.type !== 'date') {
    if (rules.minLength !== undefined && value.length < rules.minLength) {
      errors.push(error('minLength', `Must be at least ${String(rules.minLength)} characters`));
    }
    if (rules.maxLength !== undefined && value.length > rules.maxLength) {
      errors.push(error('maxLength', `Must be at most ${String(rules.maxLength)} characters`));
    }
    if (rules.pattern !== undefined && !new RegExp(rules.pattern).test(value)) {
      errors.push(error('pattern', 'Does not match the expected format'));
    }
  }
  return errors;
}

function error(code: ValidationCode, message: string): ValidationError {
  return { code, message };
}
