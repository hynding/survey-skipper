import { Answer, Question, Survey, type AnswerMap } from '../../src';

const questionPrefix = 'q';

export function getNewSurvey(numQuestions: number, answers: string[], map: AnswerMap = {}): Survey {
  return new Survey({
    questions: getNewQuestions(numQuestions, answers),
    answerMap: map,
  });
}

export function getNewQuestions(count: number, answers: string[]): Question[] {
  return Array.from(
    { length: count },
    (_, i) =>
      new Question({
        id: `${questionPrefix}${String(i + 1)}`,
        text: `dumb question ${String(i + 1)}`,
        answers: getNewAnswers(answers),
      }),
  );
}

export function getNewAnswers(answerValues: string[]): Answer[] {
  return answerValues.map(
    (value) => new Answer({ text: value, value, isCustom: value === 'custom' }),
  );
}
