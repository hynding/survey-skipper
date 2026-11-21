import { parse, stringify } from 'yaml';
import {
  SurveyDefinition,
  SurveySession,
  valueKey,
  type Answer,
  type Question,
  type SurveyDefinitionInput,
} from 'survey-skipper';

/**
 * Parses a survey written in YAML into the plain input `new SurveyDefinition(...)` accepts.
 * Rules and `showIf` conditions are JsonLogic written as YAML maps.
 * Throws a `TypeError` if the document is not a mapping with a `questions` list.
 */
export function parseSurvey(text: string): SurveyDefinitionInput {
  const doc: unknown = parse(text);
  if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) {
    throw new TypeError('A survey document must be a YAML mapping');
  }
  if (!('questions' in doc) || !Array.isArray(doc.questions)) {
    throw new TypeError('A survey document needs a "questions" list');
  }
  return doc as SurveyDefinitionInput;
}

/** Parses a YAML survey into a {@link SurveyDefinition}. Start respondents on it with `new SurveySession(definition)`. */
export function loadSurvey(text: string): SurveyDefinition {
  return new SurveyDefinition(parseSurvey(text));
}

/**
 * Writes a survey definition (metadata, questions, answer options, rules, `showIf` / `skipIf` and answer map) as
 * YAML. Given a session, writes its definition; respondent state such as answers, history and context is left out.
 */
export function stringifySurvey(survey: SurveyDefinition | SurveySession | SurveyDefinitionInput): string {
  const s = survey instanceof SurveySession ? survey.definition : SurveyDefinition.from(survey);
  const definition = compact({
    id: s.id,
    version: s.version,
    title: s.title,
    description: s.description,
    customKey: s.customKey === '*' ? undefined : s.customKey,
    keepAbandonedAnswers: s.keepAbandonedAnswers ? undefined : false,
    variables: Object.keys(s.variables).length > 0 ? s.variables : undefined,
    defaultLocale: s.defaultLocale,
    translations: Object.keys(s.translations).length > 0 ? s.translations : undefined,
    status: s.status,
    opensAt: s.opensAt,
    closesAt: s.closesAt,
    maxResponses: s.maxResponses,
    sections: Object.keys(s.sections).length > 0 ? s.sections : undefined,
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
    answersFrom: q.answersFrom,
    rows: q.rows?.length ? q.rows.map(answerDefinition) : undefined,
    randomize: q.randomize ? true : undefined,
    type: q.type,
    section: q.section,
    required: q.required ? true : undefined,
    validation: Object.keys(q.validation).length > 0 ? q.validation : undefined,
    translations: Object.keys(q.translations).length > 0 ? q.translations : undefined,
    showIf: q.showIf,
    skipIf: q.skipIf,
    rules: q.rules.length > 0 ? q.rules : undefined,
  });
}

function answerDefinition(a: Answer): Record<string, unknown> {
  return compact({
    value: a.value ?? undefined,
    text: a.text === undefined || a.text === valueKey(a.value) ? undefined : a.text,
    isCustom: a.isCustom ? true : undefined,
    fixed: a.fixed ? true : undefined,
    score: a.score,
  });
}

function compact(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined));
}
