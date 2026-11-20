import type { SurveyDefinition } from './definition.js';
import { getEdges, type Edge } from './graph.js';
import type { QuestionId } from './question.js';

/** Draws the definition's branching as a Mermaid flowchart. */
export function toMermaid(definition: SurveyDefinition): string {
  const lines = ['flowchart TD'];
  const names = nodeNames(definition);
  for (const q of definition.questions) {
    lines.push(`  ${names.question(q.id)}["${escapeMermaid(q.text ?? String(q.id))}"]`);
  }
  const endings = new Set<string>();
  for (const edge of getEdges(definition)) {
    const target = edge.to === null ? names.end(edge.ending) : names.question(edge.to);
    if (edge.to === null) {
      endings.add(edge.ending ?? '');
    }
    const label = edgeLabel(edge);
    lines.push(`  ${names.question(edge.from)} -->${label ? `|"${escapeMermaid(label)}"|` : ''} ${target}`);
  }
  for (const ending of endings) {
    lines.push(`  ${names.end(ending || undefined)}(["${escapeMermaid(ending || 'end')}"])`);
  }
  return lines.join('\n') + '\n';
}

/** Draws the definition's branching as a Graphviz DOT digraph. */
export function toDot(definition: SurveyDefinition): string {
  const lines = ['digraph survey {', '  node [shape=box];'];
  const names = nodeNames(definition);
  for (const q of definition.questions) {
    lines.push(`  ${names.question(q.id)} [label=${quote(q.text ?? String(q.id))}];`);
  }
  const endings = new Set<string>();
  for (const edge of getEdges(definition)) {
    if (edge.to === null) {
      endings.add(edge.ending ?? '');
    }
    const target = edge.to === null ? names.end(edge.ending) : names.question(edge.to);
    const label = edgeLabel(edge);
    lines.push(`  ${names.question(edge.from)} -> ${target}${label ? ` [label=${quote(label)}]` : ''};`);
  }
  for (const ending of endings) {
    lines.push(`  ${names.end(ending || undefined)} [shape=oval, label=${quote(ending || 'end')}];`);
  }
  lines.push('}');
  return lines.join('\n') + '\n';
}

function nodeNames(definition: SurveyDefinition): { question: (id: QuestionId) => string; end: (ending?: string) => string } {
  const used = new Map<string, string>();
  const safe = (prefix: string, raw: string): string => {
    const key = `${prefix}:${raw}`;
    const existing = used.get(key);
    if (existing) {
      return existing;
    }
    const name = `${prefix}_${raw.replace(/[^A-Za-z0-9_]/g, '_')}_${String(used.size)}`;
    used.set(key, name);
    return name;
  };
  definition.questions.forEach((q) => safe('q', String(q.id)));
  return {
    question: (id) => safe('q', String(id)),
    end: (ending) => safe('end', ending ?? ''),
  };
}

function edgeLabel(edge: Edge): string {
  if (edge.kind === 'map') {
    return `= ${edge.answerKey ?? ''}`;
  }
  if (edge.condition !== undefined) {
    const text = JSON.stringify(edge.condition);
    return text.length > 48 ? `${text.slice(0, 45)}...` : text;
  }
  return '';
}

function escapeMermaid(text: string): string {
  return text.replace(/"/g, '#quot;');
}

function quote(text: string): string {
  return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}
