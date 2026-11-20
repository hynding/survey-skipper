# survey-skipper-react

React bindings for [survey-skipper](../core). `useSurvey()` runs a survey session inside a component and
re-renders it whenever the session changes.

```sh
npm install react survey-skipper survey-skipper-react
```

```tsx
import { useSurvey } from 'survey-skipper-react';

function Survey({ definition }) {
  const survey = useSurvey(definition, {
    context: { employed: true },
    onChange: (state) => localStorage.setItem('survey', JSON.stringify(state)),
  });

  if (!survey.question) {
    return <p>Thanks! ({survey.ending ?? 'done'})</p>;
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); survey.next(); }}>
      {survey.page.map((q) => (
        <label key={q.id}>
          {survey.textOf(q)}
          <input
            value={String(survey.valueOf(q) ?? '')}
            onChange={(e) => survey.answer(e.target.value, q)}
          />
          {survey.errors[q.id]?.map((err) => <span key={err.code}>{err.message}</span>)}
        </label>
      ))}
      <button type="button" disabled={!survey.canGoBack} onClick={survey.back}>Back</button>
      <button type="submit">Next</button>
    </form>
  );
}
```

## `useSurvey(definition, options?)`

`definition` is a `SurveyDefinition` or its plain input object.

Options, all read on the first render only, except `onChange`:

| Option | What it does |
| --- | --- |
| `state` | Saved session state (for example from `onChange` or a `SurveyStore`) to resume from. |
| `context` | Initial context. Change it later with `setContext`. |
| `sessionOptions` | Passed to `SurveySession`, for example a clock for the timeline. |
| `onChange` | Called with `session.toJSON()` after every change. |

It returns:

| Field | What it is |
| --- | --- |
| `question` | The current question, or `null` when finished. |
| `page` | The questions on the current page (see `section` in the core docs). |
| `answer(value, question?)` | Validates and stores an answer, to the current question by default. Returns whether it was accepted. |
| `valueOf(question)` | The stored answer value. |
| `errors` | Validation errors by question id, from the last `answer` or `next`. |
| `next()` | Validates every question on the page, then moves on. Returns `false` and fills `errors` if any fail. |
| `back()`, `canGoBack` | Back navigation. |
| `finished`, `ending` | Whether the survey is over, and the `end` rule's ending, if any. |
| `textOf(question)` | The question's text in the session's locale, with placeholders filled in. |
| `setContext(context)` | Replaces the context and re-renders. |
| `session` | The underlying `SurveySession`. |

Requires React 18 or later.
