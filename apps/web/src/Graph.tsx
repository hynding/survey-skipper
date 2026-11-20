import type { Edge, LintIssue, SurveyDefinition } from 'survey-skipper';

const ROW = 64;
const NODE_W = 220;
const NODE_H = 40;
const LEFT = 8;

/**
 * Draws a definition's branching structure: questions top to bottom in definition order, fall-through moves as short
 * arrows, rules and answer-map moves as arcs on the right (dashed when conditional), and endings at the bottom.
 * Questions with lint errors are outlined.
 */
export function Graph({ definition, edges, issues }: { definition: SurveyDefinition; edges: Edge[]; issues: LintIssue[] }) {
  const ids = definition.questions.map((q) => String(q.id));
  const endings = [...new Set(edges.filter((e) => e.to === null).map((e) => e.ending ?? '(end)'))];
  const rowOf = (edge: Edge): number => (edge.to === null ? ids.length + endings.indexOf(edge.ending ?? '(end)') : ids.indexOf(String(edge.to)));
  const flagged = new Map<string, 'error' | 'warning'>();
  for (const issue of issues) {
    if (issue.questionId !== undefined) {
      const id = String(issue.questionId);
      flagged.set(id, flagged.get(id) === 'error' ? 'error' : issue.severity);
    }
  }
  const arcs = edges.filter((e) => !(e.kind === 'next' && e.to !== null && rowOf(e) === ids.indexOf(String(e.from)) + 1));
  const rows = ids.length + endings.length;
  const width = LEFT + NODE_W + 40 + arcs.length * 14;
  const height = rows * ROW;
  const y = (row: number) => row * ROW + NODE_H / 2 + 8;

  return (
    <svg className="graph" viewBox={`0 0 ${String(width)} ${String(height)}`} width={width} height={height} role="img" aria-label="Branching graph">
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" className="arrowhead" />
        </marker>
      </defs>
      {ids.slice(0, -1).map((id, i) => {
        const fallsThrough = edges.some((e) => String(e.from) === id && e.kind === 'next' && String(e.to) === ids[i + 1]);
        return fallsThrough ? (
          <line key={`n-${id}`} x1={LEFT + NODE_W / 2} y1={y(i) + NODE_H / 2} x2={LEFT + NODE_W / 2} y2={y(i + 1) - NODE_H / 2} className="edge" markerEnd="url(#arrow)" />
        ) : null;
      })}
      {arcs.map((edge, i) => {
        const from = ids.indexOf(String(edge.from));
        const to = rowOf(edge);
        const x0 = LEFT + NODE_W;
        const bulge = x0 + 24 + i * 14;
        const label = edge.condition === undefined ? edge.kind : `${edge.kind} if ${JSON.stringify(edge.condition)}`;
        return (
          <path
            key={`a-${String(i)}`}
            d={`M${String(x0)},${String(y(from))} C${String(bulge)},${String(y(from))} ${String(bulge)},${String(y(to))} ${String(x0)},${String(y(to))}`}
            className={edge.condition === undefined ? 'edge' : 'edge conditional'}
            markerEnd="url(#arrow)"
          >
            <title>{label}</title>
          </path>
        );
      })}
      {ids.map((id, i) => {
        const q = definition.questions[i];
        const text = q?.text ?? '';
        return (
          <g key={id} transform={`translate(${String(LEFT)},${String(y(i) - NODE_H / 2)})`} className={`node ${flagged.get(id) ?? ''}`}>
            <rect width={NODE_W} height={NODE_H} rx={8} />
            <text x={10} y={16} className="node-id">{id}</text>
            <text x={10} y={31} className="node-text">{text.length > 30 ? `${text.slice(0, 29)}…` : text}</text>
          </g>
        );
      })}
      {endings.map((ending, i) => (
        <g key={`end-${ending}`} transform={`translate(${String(LEFT)},${String(y(ids.length + i) - NODE_H / 2)})`} className="node ending">
          <rect width={NODE_W} height={NODE_H} rx={20} />
          <text x={NODE_W / 2} y={25} textAnchor="middle">{ending === '(end)' ? 'End' : `End: ${ending}`}</text>
        </g>
      ))}
    </svg>
  );
}
