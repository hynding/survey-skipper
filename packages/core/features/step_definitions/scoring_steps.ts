import assert from 'node:assert/strict';
import { Given, Then, When } from '@cucumber/cucumber';
import { aggregate, SurveyDefinition, SurveySession, type SurveyDefinitionInput, type SurveyStats } from '../../src';
import type { SurveyWorld } from '../support/world';

interface ScoreWorld extends SurveyWorld {
  scored?: SurveyDefinition;
  scoredSessions?: SurveySession[];
  scoreStats?: SurveyStats;
}

const last = (world: ScoreWorld): SurveySession => {
  const s = world.scoredSessions?.at(-1);
  assert.ok(s);
  return s;
};

Given('a scored definition:', function (this: ScoreWorld, json: string) {
  this.scored = new SurveyDefinition(JSON.parse(json) as SurveyDefinitionInput);
});

Given(
  'a scored session answering capital {string}, rivers {} and guess {string}',
  function (this: ScoreWorld, capital: string, rivers: string, guess: string) {
    assert.ok(this.scored);
    const s = new SurveySession(this.scored);
    s.setAnswer({ value: capital });
    s.getNextQuestion();
    s.setAnswer({ value: JSON.parse(rivers) as string[] });
    s.getNextQuestion();
    s.setAnswer({ value: guess, isCustom: guess.includes(' ') });
    s.getNextQuestion();
    if (s.getQuestion()?.id === 'retry') {
      s.setAnswer({ value: 'no' });
      s.getNextQuestion();
      // Step back onto "retry" so the text can be checked; the session stays unfinished.
      s.back();
    }
    this.scoredSessions ??= [];
    this.scoredSessions.push(s);
  },
);

When('the scored sessions are aggregated with the definition', function (this: ScoreWorld) {
  this.scoreStats = aggregate(this.scoredSessions ?? [], this.scored);
});

Then('its score is {float} with sections {}', function (this: ScoreWorld, total: number, sections: string) {
  assert.deepEqual(last(this).getScore(), { total, sections: JSON.parse(sections) as object });
});

Then('it is on {string} with text {string}', function (this: ScoreWorld, id: string, text: string) {
  const s = last(this);
  assert.equal(s.getQuestion()?.id, id);
  assert.equal(s.getQuestionText(), text);
});

Then('it finished with ending {string}', function (this: ScoreWorld, ending: string) {
  const s = last(this);
  assert.equal(s.getQuestion(), null);
  assert.equal(s.ending, ending);
});

Then('the score stats are {}', function (this: ScoreWorld, json: string) {
  assert.deepEqual(this.scoreStats?.score, JSON.parse(json));
});
