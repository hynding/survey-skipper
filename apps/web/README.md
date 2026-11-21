# survey-skipper-web

The web app for [survey-skipper-server](../server), with two parts: the respondent app (roadmap UI1) and the
builder (UI2).

## Builder (`#/builder`, or `#/builder/<id>` to edit a saved survey)

- Write the survey in YAML: questions, types, validation, translations and JsonLogic `rules`, `showIf` and `skipIf`.
- Lint results update as you type. Save stays disabled while there are errors.
- **Graph** tab: questions in order, fall-through arrows, and rule and answer-map arcs (dashed when conditional, with
  the condition in a tooltip). It also shows the endings, and outlines questions with lint problems.
- **Preview** tab: runs the survey in the browser with `survey-skipper-react`, with nothing saved.
- Save sends the YAML to the server. If the server has an `API_KEY`, enter it once per browser session.

## Respondent app (`#/s/<id>`)

- Every built-in question type: single and multi choice, text, number, rating, date, yes/no, ranking (move options up and down) and matrix (a radio grid).
- Validation errors from the server, shown next to each question.
- Back, a progress bar, and resume after a reload. The session id is kept in `localStorage`.
- If the respondent changes an earlier answer and later comes back to a question they had answered on the old path,
  that answer is prefilled and flagged as kept.
- Context comes from the link: `#/s/commute?employed=true&name=Ana` starts a session with
  `{ employed: true, name: "Ana" }`. JSON values are parsed, and anything else stays a string.

## Results (`#/results/<id>`)

A survey's results from the server's stats route: responses, completions and completion rate, completed responses by
ending, and for each question how many people saw it, answered it and stopped there, with a bar for each answer.
**Download CSV** saves every response (one row per respondent). Results need the server's API key when it has one;
the key is shared with the builder for the tab. The survey list links to each survey's results.

## Run it

```sh
pnpm install
pnpm --filter survey-skipper-server build
PORT=3000 pnpm --filter survey-skipper-server start   # in one terminal
pnpm --filter survey-skipper-web dev                  # in another; opens http://localhost:5173
```

In development, `/api` is proxied to the server, at `http://localhost:3000` by default (override with `API_TARGET`).
For a production build, set `VITE_API_URL` to the server's URL. Then start the server with `CORS_ORIGIN` set to the
app's origin, and serve `dist/`.

```sh
VITE_API_URL=https://surveys-api.example.com pnpm --filter survey-skipper-web build
```
