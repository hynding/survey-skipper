import type { SurveyDefinition } from './definition.js';
import type { QuestionId } from './question.js';
import type { Condition } from './rules.js';
import { isNil } from './utils.js';

/** One possible move between questions, as written in a definition. */
export interface Edge {
  from: QuestionId;
  /** The question moved to, or `null` when the survey ends. */
  to: QuestionId | null;
  /** The named ending, for `end` rules. */
  ending?: string;
  /** `rule` for question rules, `map` for answer-map entries, `next` for falling through to the following question. */
  kind: 'rule' | 'map' | 'next';
  /** The rule's condition, if any. */
  condition?: Condition;
  /** The answer-map key, for `map` edges. */
  answerKey?: string;
}

/**
 * Every move the definition allows out of each question, in the order they are checked. Conditions are not
 * evaluated, so this is the structure of the survey rather than any one respondent's route. Rules with unknown
 * targets are left out, and rules after an unconditional rule are unreachable and also left out.
 */
export function getEdges(definition: SurveyDefinition): Edge[] {
  const edges: Edge[] = [];
  definition.questions.forEach((q, index) => {
    let unconditional = false;
    for (const rule of q.rules) {
      if (typeof rule.end === 'string' && rule.end.length > 0) {
        edges.push(withCondition({ from: q.id, to: null, ending: rule.end, kind: 'rule' }, rule.if));
      } else if (!isNil(rule.goTo) && definition.indexOf(rule.goTo) !== undefined) {
        edges.push(withCondition({ from: q.id, to: rule.goTo, kind: 'rule' }, rule.if));
      } else {
        continue;
      }
      if (rule.if === undefined) {
        unconditional = true;
        break;
      }
    }
    if (unconditional) {
      return;
    }
    for (const [answerKey, target] of Object.entries(definition.answerMap[String(q.id)] ?? {})) {
      if (definition.indexOf(target) !== undefined) {
        edges.push({ from: q.id, to: target, kind: 'map', answerKey });
      }
    }
    edges.push({ from: q.id, to: definition.questions[index + 1]?.id ?? null, kind: 'next' });
  });
  return edges;
}

function withCondition(edge: Edge, condition: Condition | undefined): Edge {
  return condition === undefined ? edge : { ...edge, condition };
}
