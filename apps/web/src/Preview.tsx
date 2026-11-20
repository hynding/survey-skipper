import { useState } from 'react';
import type { AnswerValue, SurveyDefinition } from 'survey-skipper';
import { useSurvey } from 'survey-skipper-react';
import { QuestionField } from './QuestionField';

/** Runs the definition in the browser, without saving anything, so authors can try their rules. */
export function Preview({ definition, context }: { definition: SurveyDefinition; context?: Record<string, unknown> }) {
  const survey = useSurvey(definition, context ? { context } : {});
  const [drafts, setDrafts] = useState<Record<string, AnswerValue | undefined>>({});
  const inputs = definition.toJSON().questions;

  const back = () => {
    setDrafts({});
    survey.back();
  };

  if (survey.finished) {
    return (
      <div className="preview">
        <p>
          Finished{survey.ending ? <> with ending <strong>{survey.ending}</strong></> : null}.
        </p>
        <div className="actions">
          <button type="button" disabled={!survey.canGoBack} onClick={back}>Back</button>
        </div>
      </div>
    );
  }

  return (
    <form
      className="preview"
      onSubmit={(e) => {
        e.preventDefault();
        let ok = true;
        for (const q of survey.page) {
          const draft = drafts[String(q.id)];
          if (draft !== undefined && !survey.answer(draft, q)) {
            ok = false;
          }
        }
        if (ok && survey.next()) {
          setDrafts({});
        }
      }}
    >
      {survey.page.map((q) => {
        const id = String(q.id);
        const index = definition.indexOf(q.id);
        const input = (index === undefined ? undefined : inputs[index]) ?? { id: q.id };
        return (
          <QuestionField
            key={id}
            question={{ ...input, displayText: survey.textOf(q) }}
            value={id in drafts ? drafts[id] : survey.valueOf(q)}
            errors={survey.errors[id]}
            onChange={(v) => {
              setDrafts((d) => ({ ...d, [id]: v }));
            }}
          />
        );
      })}
      <div className="actions">
        <button type="button" disabled={!survey.canGoBack} onClick={back}>Back</button>
        <button type="submit">Next</button>
      </div>
    </form>
  );
}
