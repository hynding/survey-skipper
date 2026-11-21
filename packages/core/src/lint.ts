import type { SurveyDefinition } from './definition.js';
import { getEdges } from './graph.js';
import { getValidator, isKnownType } from './plugins.js';
import type { QuestionId } from './question.js';
import type { Condition } from './rules.js';
import { isNil } from './utils.js';

export type LintCode =
  | 'empty'
  | 'duplicate-id'
  | 'rule-shape'
  | 'unknown-target'
  | 'unreachable-rule'
  | 'unreachable-question'
  | 'unknown-reference'
  | 'invalid-pattern'
  | 'missing-options'
  | 'unknown-type'
  | 'unknown-validator';

export interface LintIssue {
  severity: 'error' | 'warning';
  code: LintCode;
  message: string;
  questionId?: QuestionId;
}

/**
 * Checks a definition for authoring mistakes: duplicate ids, malformed rules, targets that don't exist, rules and
 * questions that can never be reached, conditions that mention unknown questions, bad regular expressions, and choice
 * questions without options. Returns an empty list for a clean definition.
 */
export function lintDefinition(definition: SurveyDefinition): LintIssue[] {
  const issues: LintIssue[] = [];
  const { questions } = definition;
  if (questions.length === 0) {
    return [{ severity: 'warning', code: 'empty', message: 'The survey has no questions' }];
  }
  const ids = new Set<string>();
  for (const q of questions) {
    const id = String(q.id);
    if (ids.has(id)) {
      issues.push({ severity: 'error', code: 'duplicate-id', message: `Question id "${id}" is used more than once`, questionId: q.id });
    }
    ids.add(id);
  }

  for (const q of questions) {
    let afterUnconditional = false;
    q.rules.forEach((rule, i) => {
      const where = `Rule ${String(i + 1)} on "${String(q.id)}"`;
      const hasGoTo = !isNil(rule.goTo);
      const hasEnd = typeof rule.end === 'string' && rule.end.length > 0;
      if (hasGoTo === hasEnd) {
        issues.push({ severity: 'error', code: 'rule-shape', message: `${where} needs exactly one of "goTo" or "end"`, questionId: q.id });
      }
      if (hasGoTo && !ids.has(String(rule.goTo))) {
        issues.push({ severity: 'error', code: 'unknown-target', message: `${where} goes to unknown question "${String(rule.goTo)}"`, questionId: q.id });
      }
      if (afterUnconditional) {
        issues.push({ severity: 'warning', code: 'unreachable-rule', message: `${where} comes after a rule that always matches`, questionId: q.id });
      }
      if (rule.if === undefined) {
        afterUnconditional = true;
      }
      checkCondition(rule.if, ids, where, q.id, issues);
    });
    checkCondition(q.showIf, ids, `showIf on "${String(q.id)}"`, q.id, issues);
    checkCondition(q.skipIf, ids, `skipIf on "${String(q.id)}"`, q.id, issues);

    if (q.validation.pattern !== undefined && !isRegExp(q.validation.pattern)) {
      issues.push({ severity: 'error', code: 'invalid-pattern', message: `The validation pattern on "${String(q.id)}" is not a valid regular expression`, questionId: q.id });
    }
    if (q.type !== undefined && !isKnownType(q.type)) {
      issues.push({ severity: 'warning', code: 'unknown-type', message: `"${String(q.id)}" has unregistered question type "${q.type}"`, questionId: q.id });
    }
    for (const entry of q.validation.custom ?? []) {
      if (!getValidator(entry.name)) {
        issues.push({ severity: 'error', code: 'unknown-validator', message: `"${String(q.id)}" uses unregistered validator "${entry.name}"`, questionId: q.id });
      }
    }
    if (q.answersFrom && !ids.has(String(q.answersFrom.question))) {
      issues.push({ severity: 'warning', code: 'unknown-reference', message: `"${String(q.id)}" carries options from unknown question "${String(q.answersFrom.question)}"`, questionId: q.id });
    }
    if ((q.type === 'single' || q.type === 'multi') && q.answers.length === 0 && !q.answersFrom) {
      issues.push({ severity: 'warning', code: 'missing-options', message: `"${String(q.id)}" is a ${q.type} choice question with no answer options`, questionId: q.id });
    }
  }

  for (const [from, targets] of Object.entries(definition.answerMap)) {
    for (const [key, target] of Object.entries(targets)) {
      if (!ids.has(String(target))) {
        issues.push({ severity: 'error', code: 'unknown-target', message: `The answer map sends "${key}" on "${from}" to unknown question "${String(target)}"`, questionId: from });
      }
    }
  }

  const reachable = reachableIds(definition);
  for (const q of questions) {
    if (!reachable.has(String(q.id))) {
      issues.push({ severity: 'warning', code: 'unreachable-question', message: `No route leads to "${String(q.id)}"`, questionId: q.id });
    }
  }
  return issues;
}

/** Ids of the questions some route can reach from the first question. */
export function reachableIds(definition: SurveyDefinition): Set<string> {
  const first = definition.questions[0];
  const reached = new Set<string>();
  if (!first) {
    return reached;
  }
  const next = new Map<string, string[]>();
  for (const edge of getEdges(definition)) {
    if (edge.to !== null) {
      const list = next.get(String(edge.from)) ?? [];
      list.push(String(edge.to));
      next.set(String(edge.from), list);
    }
  }
  const queue = [String(first.id)];
  while (queue.length > 0) {
    const id = queue.shift() as string;
    if (reached.has(id)) {
      continue;
    }
    reached.add(id);
    queue.push(...(next.get(id) ?? []));
  }
  return reached;
}

function checkCondition(
  condition: Condition | undefined,
  ids: Set<string>,
  where: string,
  questionId: QuestionId,
  issues: LintIssue[],
): void {
  walk(condition, (operator, args) => {
    if (operator === 'var') {
      const path = Array.isArray(args) ? (args[0] as unknown) : args;
      if (typeof path === 'string' && path.startsWith('answers.')) {
        const id = path.slice('answers.'.length);
        if (!ids.has(id)) {
          issues.push({ severity: 'warning', code: 'unknown-reference', message: `${where} reads unknown question "${id}"`, questionId });
        }
      }
    } else if (operator === 'answered' && (typeof args === 'string' || typeof args === 'number') && !ids.has(String(args))) {
      issues.push({ severity: 'warning', code: 'unknown-reference', message: `${where} checks unknown question "${String(args)}"`, questionId });
    } else if (operator === 'matches' && Array.isArray(args) && typeof args[1] === 'string' && !isRegExp(args[1])) {
      issues.push({ severity: 'error', code: 'invalid-pattern', message: `${where} uses an invalid regular expression`, questionId });
    }
  });
}

function walk(node: unknown, visit: (operator: string, args: unknown) => void): void {
  if (Array.isArray(node)) {
    node.forEach((child) => {
      walk(child, visit);
    });
  } else if (node !== null && typeof node === 'object') {
    for (const [operator, args] of Object.entries(node)) {
      visit(operator, args);
      walk(args, visit);
    }
  }
}

function isRegExp(pattern: string): boolean {
  try {
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
}
