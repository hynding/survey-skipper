import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Given, Then, When, type DataTable } from '@cucumber/cucumber';
import { Ajv2020 } from 'ajv/dist/2020';
import {
  eq,
  lintDefinition,
  gte,
  lt,
  runScript,
  simulatePaths,
  survey,
  toDot,
  toMermaid,
  type AnswerValue,
  type ScriptResult,
  type SurveyDefinition,
} from '../../src';
import type { SurveyWorld } from '../support/world';

interface AuthoringWorld extends SurveyWorld {
  definition?: SurveyDefinition;
  script?: ScriptResult;
}

function definitionOf(world: AuthoringWorld): SurveyDefinition {
  assert.ok(world.definition, 'No definition in this scenario');
  return world.definition;
}

const schema = JSON.parse(readFileSync(join(__dirname, '../../schema/survey-definition.schema.json'), 'utf8')) as object;
const validate = new Ajv2020({ allErrors: true }).compile(schema);

Given('the same survey made with the builder', function (this: AuthoringWorld) {
  this.definition = survey('commute')
    .question('age', { type: 'number', text: 'How old are you?' }, (q) =>
      q.end('too_young', lt('answer', 18)).goTo('retired', gte('answer', 65)),
    )
    .question('drive', { type: 'boolean' }, (q) => q.goTo('done', eq('answer', false)))
    .question('make', { type: 'text' })
    .question('retired', {}, (q) => q.goTo('done'))
    .question('done')
    .build();
});

When('a respondent answers {}', function (this: AuthoringWorld, json: string) {
  this.script = runScript(definitionOf(this), { answers: JSON.parse(json) as Record<string, AnswerValue> });
});

Then('linting finds nothing', function (this: AuthoringWorld) {
  assert.deepEqual(lintDefinition(definitionOf(this)), []);
});

Then('linting finds {string}', function (this: AuthoringWorld, codes: string) {
  assert.equal(
    lintDefinition(definitionOf(this))
      .map((issue) => issue.code)
      .join(', '),
    codes,
  );
});

Then('the routes are:', function (this: AuthoringWorld, table: DataTable) {
  const expected = table.hashes().map((row) => ({ route: row.route ?? '', ending: row.ending ?? '' }));
  const actual = simulatePaths(definitionOf(this)).map((p) => ({
    route: p.questions.map(String).join(' > '),
    ending: p.ending ?? '',
  }));
  assert.deepEqual(actual, expected);
});

Then('they see {string} and finish {}', function (this: AuthoringWorld, route: string, how: string) {
  assert.ok(this.script);
  assert.equal(this.script.questions.map(String).join(', '), route);
  if (how === 'normally') {
    assert.equal(this.script.finished, true);
    assert.equal(this.script.ending, undefined);
  } else if (how === 'unfinished') {
    assert.equal(this.script.finished, false);
  } else {
    assert.equal(this.script.finished, true);
    assert.equal(this.script.ending, JSON.parse(how));
  }
});

Then('the Mermaid drawing has an edge from {string} to the {string} ending', function (this: AuthoringWorld, from: string, ending: string) {
  const drawing = toMermaid(definitionOf(this));
  assert.match(drawing, /^flowchart TD/);
  const edge = new RegExp(`q_${from}_\\d+ -->\\|[^|]*\\| (end_${ending}_\\d+)`);
  const match = edge.exec(drawing);
  assert.ok(match, drawing);
  assert.match(drawing, new RegExp(`${match[1] ?? ''}\\(\\["${ending}"\\]\\)`));
});

Then('the DOT drawing is a digraph with {int} questions', function (this: AuthoringWorld, count: number) {
  const drawing = toDot(definitionOf(this));
  assert.match(drawing, /^digraph survey \{/);
  assert.equal(drawing.match(/^ {2}q_\w+ \[label=/gm)?.length, count);
});

Then('the saved definition matches the JSON Schema', function (this: AuthoringWorld) {
  const saved: unknown = JSON.parse(JSON.stringify(definitionOf(this)));
  assert.ok(validate(saved), JSON.stringify(validate.errors));
});

Then('a definition with a rule that has both goTo and end does not match the JSON Schema', function () {
  assert.equal(validate({ questions: [{ id: 'a', rules: [{ goTo: 'a', end: 'x' }] }] }), false);
});
