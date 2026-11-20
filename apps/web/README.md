# survey-skipper-web

The respondent web app (roadmap UI1). It answers surveys stored in
[survey-skipper-server](../server), one page at a time.

- Every built-in question type: single and multi choice, text, number, rating, date and yes/no.
- Validation errors from the server, shown next to each question.
- Back, a progress bar, and resume after a reload. The session id is kept in `localStorage`.
- If the respondent changes an earlier answer and later comes back to a question they had answered on the old path,
  that answer is prefilled and flagged as kept.
- Context comes from the link: `#/s/commute?employed=true&name=Ana` starts a session with
  `{ employed: true, name: "Ana" }`. JSON values are parsed, and anything else stays a string.

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
