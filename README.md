# Survey Skipper

Create, manage, track, share and extend customizable surveys whose path branches on rules and context.

This is a pnpm workspace. Packages:

| Package | Path | What it is |
| --- | --- | --- |
| [`survey-skipper`](packages/core) | `packages/core` | The core library: questions, answers, branching, Back navigation. Framework-agnostic, published to npm. |

Planned packages (YAML rule authoring, React bindings, a survey service and web apps) are listed in the
[roadmap](docs/ROADMAP.md). Libraries go in `packages/`, runnable apps in `apps/`.

## Development

Requires Node 22 or later and pnpm 10 (`corepack enable` picks up the pinned version).

```sh
pnpm install
pnpm run typecheck   # tsc across the workspace
pnpm run lint        # eslint (typescript-eslint strict, type-checked)
pnpm run test        # each package's tests
pnpm run build       # each package's build
pnpm run check       # all of the above
```

Shared dev tooling (TypeScript, ESLint, tsx) is declared in the root `package.json`; a package declares only what is
specific to it. Each package extends `tsconfig.base.json`.
