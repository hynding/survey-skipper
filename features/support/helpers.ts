import type { Answer, Question } from '../../src';

export function findAnswer(question: Question, value: string): Answer {
  const answer = question.answers.find((a) => a.value === value);
  if (!answer) {
    throw new Error(`Answer "${value}" not found on question ${String(question.id)}`);
  }
  return answer;
}

export function findCustomAnswer(question: Question): Answer {
  const answer = question.answers.find((a) => a.isCustom);
  if (!answer) {
    throw new Error(`Custom answer not found on question ${String(question.id)}`);
  }
  return answer;
}
