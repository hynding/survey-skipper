import type { AnswerInput } from './answer.js';
import { valueKey } from './answer.js';
import { SurveyDefinition, type SurveyDefinitionInput, type SurveyDefinitionJSON } from './definition.js';
import type { QuestionId, QuestionInput } from './question.js';

/** One difference between two definitions. */
export interface DefinitionChange {
  kind: 'added' | 'removed' | 'changed' | 'moved';
  /** What changed: `title`, `question`, `question.text`, `option`, `option.text`, `rules`, and so on. */
  target: string;
  /** The question involved, for question and option changes. */
  questionId?: QuestionId;
  /** The option's value, for option changes. */
  option?: string;
  before?: unknown;
  after?: unknown;
  /** A one-line description, such as `Changed the text of "age"`. */
  message: string;
}

const SURVEY_FIELDS = [
  'title',
  'description',
  'version',
  'status',
  'opensAt',
  'closesAt',
  'maxResponses',
  'customKey',
  'keepAbandonedAnswers',
  'defaultLocale',
  'translations',
  'variables',
  'sections',
  'quotas',
  'answerMap',
] as const;

const QUESTION_FIELDS = [
  'text',
  'type',
  'section',
  'required',
  'validation',
  'showIf',
  'skipIf',
  'rules',
  'randomize',
  'answersFrom',
  'rows',
  'translations',
] as const;

const OPTION_FIELDS = ['text', 'isCustom', 'fixed', 'score'] as const;

/**
 * Lists what changed from definition `a` to definition `b`: survey settings, questions added, removed, moved or
 * edited (field by field), and answer options added, removed or edited (matched by value). Returns an empty list when
 * they are the same. Useful before saving a new version, or to explain a `migrateSession` report.
 */
export function diffDefinitions(
  a: SurveyDefinition | SurveyDefinitionInput,
  b: SurveyDefinition | SurveyDefinitionInput,
): DefinitionChange[] {
  const before = normalize(SurveyDefinition.from(a).toJSON());
  const after = normalize(SurveyDefinition.from(b).toJSON());
  const changes: DefinitionChange[] = [];

  for (const field of SURVEY_FIELDS) {
    const x = (before as Record<string, unknown>)[field];
    const y = (after as Record<string, unknown>)[field];
    if (!same(x, y)) {
      changes.push({ kind: 'changed', target: field, before: x, after: y, message: `Changed the survey's ${field}` });
    }
  }

  const beforeIds = before.questions.map((q) => String(q.id));
  const afterIds = after.questions.map((q) => String(q.id));
  for (const q of before.questions) {
    if (!afterIds.includes(String(q.id))) {
      changes.push({ kind: 'removed', target: 'question', questionId: q.id, before: q, message: `Removed question "${String(q.id)}"` });
    }
  }
  const keptBefore = beforeIds.filter((id) => afterIds.includes(id));
  const keptAfter = afterIds.filter((id) => beforeIds.includes(id));
  after.questions.forEach((q) => {
    const id = String(q.id);
    const old = before.questions.find((p) => String(p.id) === id);
    if (!old) {
      changes.push({ kind: 'added', target: 'question', questionId: q.id, after: q, message: `Added question "${id}"` });
      return;
    }
    const from = keptBefore.indexOf(id);
    const to = keptAfter.indexOf(id);
    if (from !== to) {
      changes.push({ kind: 'moved', target: 'question', questionId: q.id, before: from, after: to, message: `Moved question "${id}"` });
    }
    for (const field of QUESTION_FIELDS) {
      if (!same(old[field], q[field])) {
        changes.push({
          kind: 'changed',
          target: `question.${field}`,
          questionId: q.id,
          before: old[field],
          after: q[field],
          message: field === 'text' ? `Changed the text of "${id}"` : `Changed ${field} on "${id}"`,
        });
      }
    }
    changes.push(...diffOptions(q.id, old.answers ?? [], q.answers ?? []));
  });
  return changes;
}

function diffOptions(questionId: QuestionId, before: (AnswerInput | object)[], after: (AnswerInput | object)[]): DefinitionChange[] {
  const changes: DefinitionChange[] = [];
  const key = (o: AnswerInput | object) => valueKey((o as AnswerInput).value);
  const id = String(questionId);
  for (const o of before) {
    if (!after.some((p) => key(p) === key(o))) {
      changes.push({ kind: 'removed', target: 'option', questionId, option: key(o), before: o, message: `Removed option "${key(o)}" from "${id}"` });
    }
  }
  const beforeKeys = before.map(key).filter((k) => after.some((p) => key(p) === k));
  const afterKeys = after.map(key).filter((k) => before.some((p) => key(p) === k));
  for (const o of after) {
    const old = before.find((p) => key(p) === key(o));
    if (!old) {
      changes.push({ kind: 'added', target: 'option', questionId, option: key(o), after: o, message: `Added option "${key(o)}" to "${id}"` });
      continue;
    }
    if (beforeKeys.indexOf(key(o)) !== afterKeys.indexOf(key(o))) {
      changes.push({ kind: 'moved', target: 'option', questionId, option: key(o), message: `Moved option "${key(o)}" in "${id}"` });
    }
    for (const field of OPTION_FIELDS) {
      const x = (old as Record<string, unknown>)[field];
      const y = (o as Record<string, unknown>)[field];
      if (!same(x, y)) {
        changes.push({ kind: 'changed', target: `option.${field}`, questionId, option: key(o), before: x, after: y, message: `Changed ${field} on option "${key(o)}" in "${id}"` });
      }
    }
  }
  return changes;
}

type Normalized = Omit<SurveyDefinitionJSON, 'questions'> & { questions: (QuestionInput & Record<string, unknown>)[] };

/** A JSON round-trip, so class instances compare as plain data and `undefined` fields disappear. */
function normalize(json: SurveyDefinitionJSON): Normalized {
  return JSON.parse(JSON.stringify(json)) as Normalized;
}

function same(x: unknown, y: unknown): boolean {
  return stable(x) === stable(y);
}

function stable(value: unknown): string {
  if (value === undefined) {
    return 'undefined';
  }
  return JSON.stringify(value, (_key, v: unknown) =>
    v !== null && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([p], [q]) => p.localeCompare(q)))
      : v,
  );
}
