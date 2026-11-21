# survey-skipper-web

The web app for [survey-skipper-server](../server): a survey list, the builder (roadmap UI2), the respondent app
(UI1), a results dashboard (UI3), and share links and embeds (S4). It is a private workspace package (Vite 8 +
React 19), not published to npm.

| Route | Screen |
| --- | --- |
| `#/` | Every survey on the server, with a badge when it is not taking responses (draft, closed, full and so on), and links to answer, edit and see results. |
| `#/builder`, `#/builder/<id>` | Write a new survey, or edit a saved one. |
| `#/s/<id>?<context>` | Answer a survey. |
| `#/embed/<id>?<context>` | The same, without the app header, for iframes. |
| `#/results/<id>` | A survey's results. |

## Builder (`#/builder`, or `#/builder/<id>` to edit a saved survey)

- Write the survey in YAML: questions, types, validation, translations and JsonLogic `rules`, `showIf` and `skipIf`.
- Lint results update as you type. Save stays disabled while there are errors.
- **Graph** tab: questions in order, fall-through arrows, and rule and answer-map arcs (dashed when conditional, with
  the condition in a tooltip). It also shows the endings, and outlines questions with lint problems.
- **Preview** tab: runs the survey in the browser with `survey-skipper-react`, with nothing saved.
- Save sends the YAML to the server. If the server has an `API_KEY`, enter it once per tab (it is kept in
  `sessionStorage` and shared with Results).

When you edit a saved survey, the builder lists the changes since the last save (`diffDefinitions()`) above the Save
button.

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

## Sharing and embedding

The builder's **Share** panel (shown once a survey is saved) has the survey's link and an iframe snippet. Query values
on the link become the respondent's context. `#/embed/<id>` renders the survey without the app header, and posts
messages to the parent page:

- `{ type: 'survey-skipper:resize', height }` whenever its height changes, so the iframe can fit its content.
- `{ type: 'survey-skipper:complete', definitionId, sessionId, ending }` when the respondent finishes.

`<Respondent onFinish={(view) => ...} />` gives the same completion hook to React code.

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

## Code layout

`src/App.tsx` parses the hash route, picks a screen and holds the `Embed` wrapper. One file per screen: `Home`, `Builder` (with `Graph` and
`Preview`), `Respondent`, `Results` and `Share`. `QuestionField` renders an input
for each question type and is shared by the respondent app and the preview. `api.ts` is the typed client for the
server.

## Development

From this folder, `pnpm run check` runs typecheck, lint, tests and the Vite build. Tests use `node:test`, jsdom and
Testing Library, and talk to a real `survey-skipper-server` handler started in-process, so build the other packages
first (`pnpm run build` at the root).
