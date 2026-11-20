# Survey Skipper

Create, manage, track, share and extend customizable surveys whose path branches on rules and context.

This is a pnpm workspace. Packages:

| Package | Path | What it is |
| --- | --- | --- |
| [`survey-skipper`](packages/core) | `packages/core` | The core library: questions, answers, JsonLogic branching rules, context, Back navigation. Framework-agnostic, published to npm. |
| [`survey-skipper-yaml`](packages/yaml) | `packages/yaml` | Write surveys and their rules in YAML. |

Planned packages (React bindings, a survey service and web apps) are listed in the
[roadmap](docs/ROADMAP.md). Libraries go in `packages/`, runnable apps in `apps/`.

## Development

Requires Node 22 or later and pnpm 10 (`corepack enable` picks up the pinned version).

```sh
pnpm install
pnpm run check       # typecheck, lint, test and build every package, in dependency order
pnpm run build       # build every package
pnpm run test        # every package's tests (build first: packages import each other's dist/)
```

Shared dev tooling (TypeScript, ESLint, tsx) is declared in the root `package.json`; a package declares only what is
specific to it. Each package extends `tsconfig.base.json`.
