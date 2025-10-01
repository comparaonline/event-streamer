# Repository Guidelines

## Project Structure & Module Organization
Event Streamer is a TypeScript library compiled into `build/`. Primary code lives under `src`, grouped by domain: `consumer`/`producer` orchestration, `schemas` for Zod definitions, `config` and `constants` for shared settings, and CLI tooling in `src/cli`. Shared helpers stay in `src/helpers` and `src/utils`. Test doubles are in `src/__fixtures__` with Vitest suites in `src/test` and module-level `__tests__`. Example usage and manual harnesses sit in `examples/` and `src/local-tests/`. Generated artifacts (`build/`, `coverage/`) should not be edited manually.

## Build, Test, and Development Commands
- `pnpm install` – install dependencies; pnpm is the supported package manager.
- `pnpm build` – compile TypeScript to `build/` via `tsc`.
- `pnpm lint` – run ESLint+Prettier autofix across `src`.
- `pnpm test` – execute unit suites, skipping `*.integration.test.ts`.
- `pnpm test:integration` – run integration tests; requires Kafka services (see below).
- `pnpm test:all` – run every test variant; useful before publishing.
- `pnpm coverage` – generate coverage reports under `coverage/`.
- `pnpm docker:up` / `pnpm docker:down` – start or stop the docker-compose stack used by integration tests.

## Coding Style & Naming Conventions
TypeScript sources follow Prettier defaults (2-space indentation, single quotes, trailing commas where safe) enforced through `pnpm lint`. Annotate unused variables with a leading `_` to satisfy `@typescript-eslint/no-unused-vars`. Event schema files should use the `event-code.schema.ts` pattern and export both `Schema` and type aliases. Prefer descriptive factory helpers (e.g., `createUserRegistered`) alongside schema exports.

## Testing Guidelines
Vitest drives both unit and integration suites. Place new specs alongside the code under test using `__tests__` folders or `*.test.ts`. Mark integration scenarios with the `.integration.test.ts` suffix so they remain opt-in. Keep mocks in `src/__fixtures__` to share across suites. Run `pnpm docker:up && pnpm test:integration` when exercising Kafka-dependent flows, and tear down with `pnpm docker:down`. Strive for coverage on new branches before opening a PR.

## Commit & Pull Request Guidelines
Follow the conventional commit style used in the history (`type(scope): summary`), with scopes such as `producer`, `tests`, or `chore`. Each PR should describe the change, list validation commands, and link related issues. Include screenshots or sample CLI output when altering user-facing behavior. Confirm CI passes and note any remaining risks or follow-ups in the PR description.
