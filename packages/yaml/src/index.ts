import { parse, stringify } from 'yaml';
import { Survey, type Answer, type Question, type SurveyInput } from 'survey-skipper';

/**
 * Parses a survey written in YAML into the plain input `new Survey(...)` accepts.
 * Rules and `showIf` conditions are JsonLogic written as YAML maps.
 * Throws a `TypeError` if the document is not a mapping with a `questions` list.
 */
export function parseSurvey(text: string): SurveyInput {
  const doc: unknown = parse(text);
  if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) {
    throw new TypeError('A survey document must be a YAML mapping');
  }
  if (!('questions' in doc) || !Array.isArray(doc.questions)) {
    throw new TypeError('A survey document needs a "questions" list');
  }
  return doc as SurveyInput;
}

/** Parses a YAML survey and returns a ready-to-run {@link Survey}. */
export function loadSurvey(text: string): Survey {
  return new Survey(parseSurvey(text));
}

/**
 * Writes a survey's definition (metadata, questions, answer options, rules, `showIf` and answer map) as YAML.
 * Respondent state such as answers, history and context is left out.
 */
export function stringifySurvey(survey: Survey | SurveyInput): string {
  const s = survey instanceof Survey ? survey : new Survey(survey);
  const definition = compact({
    id: s.id,
    title: s.title,
    description: s.description,
    customKey: s.customKey === '*' ? undefined : s.customKey,
    questions: s.questions.map(questionDefinition),
    answerMap: Object.keys(s.answerMap).length > 0 ? s.answerMap : undefined,
  });
  return stringify(definition);
}

function questionDefinition(q: Question): Record<string, unknown> {
  return compact({
    id: q.id,
    text: q.text,
    answers: q.answers.length > 0 ? q.answers.map(answerDefinition) : undefined,
    showIf: q.showIf,
    rules: q.rules.length > 0 ? q.rules : undefined,
  });
}

function answerDefinition(a: Answer): Record<string, unknown> {
  return compact({
    value: a.value ?? undefined,
    text: a.text === undefined || a.text === String(a.value) ? undefined : a.text,
    isCustom: a.isCustom ? true : undefined,
  });
}

function compact(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined));
}
