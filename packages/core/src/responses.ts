import { timeOnQuestions } from './analytics.js';
import { formatAnswerValue, isMatrix, valueKey, type AnswerInput, type AnswerValue } from './answer.js';
import { SurveyDefinition, type SurveyDefinitionInput } from './definition.js';
import { SurveySession, type SessionState } from './session.js';

/** A cell in an exported row. List answers stay lists in {@link toRows} and are joined in {@link toCSV}. */
export type CellValue = string | number | boolean | null | (string | number | boolean)[];

/** One exported response, keyed by column name. */
export type ResponseRow = Record<string, CellValue>;

/** A session to export: live, saved state, or a store listing entry (`{ sessionId, state }`). */
export type ExportableSession = SurveySession | SessionState | { sessionId: string; state: SessionState };

export interface ExportOptions {
  /** Add an `abandoned:<questionId>` column per question with answers left on an abandoned route. Default false. */
  includeAbandoned?: boolean;
  /** Add `time:<questionId>` columns with the milliseconds spent on each question. Default false. */
  includeTimings?: boolean;
  /** Add a `context:<key>` column for every context key seen in any session. Default false. */
  includeContext?: boolean;
}

export interface ResponseTable {
  /** Column names in order. Every row has every column. */
  columns: string[];
  rows: ResponseRow[];
}

const META_COLUMNS = ['sessionId', 'definitionVersion', 'finished', 'ending', 'startedAt', 'completedAt', 'durationMs'];

/**
 * Turns sessions into one row per respondent: session metadata, then one column per question in the definition's
 * order (blank when not answered; a matrix question gets a `<id>:<row>` column per row), then any extra columns asked
 * for in `options`. Answers to questions no longer in
 * the definition get their own columns after the definition's questions.
 */
export function toRows(
  definition: SurveyDefinition | SurveyDefinitionInput,
  sessions: ExportableSession[],
  options: ExportOptions = {},
): ResponseTable {
  const def = SurveyDefinition.from(definition);
  const entries = sessions.map(normalize);
  const questionIds = def.questions.map((q) => String(q.id));
  const known = new Set(questionIds);
  const extra: string[] = [];
  const contextKeys: string[] = [];
  const abandonedIds: string[] = [];
  for (const { state } of entries) {
    for (const id of Object.keys(state.answers ?? {})) {
      if (!known.has(id)) {
        known.add(id);
        extra.push(id);
      }
    }
    if (options.includeContext) {
      for (const key of Object.keys(state.context ?? {})) {
        if (!contextKeys.includes(key)) {
          contextKeys.push(key);
        }
      }
    }
    if (options.includeAbandoned) {
      for (const id of Object.keys(state.abandonedAnswers ?? {})) {
        if (!abandonedIds.includes(id)) {
          abandonedIds.push(id);
        }
      }
    }
  }
  // A matrix question gets one column per row, named `<questionId>:<row>`.
  const answerColumns: { column: string; id: string; row?: string }[] = [
    ...def.questions.flatMap((q) =>
      q.type === 'matrix' && q.rows?.length
        ? q.rows.map((row) => ({ column: `${String(q.id)}:${valueKey(row.value)}`, id: String(q.id), row: valueKey(row.value) }))
        : [{ column: String(q.id), id: String(q.id) }],
    ),
    ...extra.map((id) => ({ column: id, id })),
  ];
  const columns = [
    ...META_COLUMNS,
    ...answerColumns.map((c) => c.column),
    ...abandonedIds.map((id) => `abandoned:${id}`),
    ...(options.includeTimings ? questionIds.map((id) => `time:${id}`) : []),
    ...contextKeys.map((key) => `context:${key}`),
  ];

  const rows = entries.map(({ sessionId, state }) => {
    const timeline = state.timeline ?? [];
    const startedAt = timeline[0]?.at ?? null;
    const completedAt = state.finished ? ([...timeline].reverse().find((e) => e.type === 'complete')?.at ?? null) : null;
    const row: ResponseRow = {
      sessionId: sessionId ?? null,
      definitionVersion: state.definitionVersion ?? null,
      finished: state.finished ?? false,
      ending: state.ending ?? null,
      startedAt,
      completedAt,
      durationMs: startedAt !== null && completedAt !== null ? Date.parse(completedAt) - Date.parse(startedAt) : null,
    };
    for (const { column, id, row: matrixRow } of answerColumns) {
      const value = state.answers?.[id]?.value;
      row[column] = matrixRow === undefined ? cell(state.answers?.[id]) : isMatrix(value) ? (value[matrixRow] ?? null) : null;
    }
    for (const id of abandonedIds) {
      row[`abandoned:${id}`] = cell(state.abandonedAnswers?.[id]);
    }
    if (options.includeTimings) {
      const times = timeOnQuestions(state.timeline ?? []);
      for (const id of questionIds) {
        row[`time:${id}`] = times[id] ?? null;
      }
    }
    for (const key of contextKeys) {
      row[`context:${key}`] = contextCell(state.context?.[key]);
    }
    return row;
  });
  return { columns, rows };
}

/**
 * {@link toRows} as CSV text (RFC 4180, `\r\n` line ends, header row first). List answers are joined with `;`.
 * Text that a spreadsheet would run as a formula (starting with `=`, `+`, `-`, `@`, tab or carriage return) is
 * prefixed with `'` unless `escapeFormulas` is false.
 */
export function toCSV(
  definition: SurveyDefinition | SurveyDefinitionInput,
  sessions: ExportableSession[],
  options: ExportOptions & { escapeFormulas?: boolean } = {},
): string {
  const { columns, rows } = toRows(definition, sessions, options);
  const escapeFormulas = options.escapeFormulas ?? true;
  const lines = [columns.map((c) => csvField(c, escapeFormulas))];
  for (const row of rows) {
    lines.push(columns.map((c) => csvField(row[c] ?? null, escapeFormulas)));
  }
  return lines.map((fields) => fields.join(',')).join('\r\n') + '\r\n';
}

function normalize(input: ExportableSession): { sessionId?: string; state: SessionState } {
  if (input instanceof SurveySession) {
    return { state: input.toJSON() };
  }
  if ('sessionId' in input && 'state' in input && typeof input.sessionId === 'string') {
    return { sessionId: input.sessionId, state: input.state };
  }
  return { state: input as SessionState };
}

function cell(answer: { value?: AnswerInput['value'] } | undefined): CellValue {
  const value: AnswerValue | undefined | null = answer?.value;
  if (value === undefined || value === null || value === '') {
    return null;
  }
  if (isMatrix(value)) {
    return formatAnswerValue(value);
  }
  return Array.isArray(value) ? [...value] : value;
}

function contextCell(value: unknown): CellValue {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  return JSON.stringify(value);
}

function csvField(value: CellValue, escapeFormulas: boolean): string {
  if (value === null) {
    return '';
  }
  let text = Array.isArray(value) ? value.map(String).join(';') : String(value);
  if (escapeFormulas && typeof value !== 'number' && typeof value !== 'boolean' && /^[=+\-@\t\r]/.test(text)) {
    text = `'${text}`;
  }
  return /[",\r\n]/.test(text) || text !== text.trim() ? `"${text.replace(/"/g, '""')}"` : text;
}
