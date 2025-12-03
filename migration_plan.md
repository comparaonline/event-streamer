## Migration and Implementation Plan: Schema Registry (PR2) and Tests (PR3)

### Context and Goals
- We are introducing Schema Registry (SR) support in an additive, opt-in way (PR2), preserving 100% backward compatibility for legacy users.
- PR3 will add a dedicated SR test suite (unit + integration) and supporting scripts.
- PR1 (legacy refactor + deprecation) was merged into `master` as a squash, moving legacy producer/consumer to dedicated files and enabling deprecation warnings.

### Branching Workflow (squash-merge friendly)
1) After PR1 merge:
   - `git checkout master && git pull --ff-only`
   - `git checkout -b feat/schema-registry`
2) Implement PR2 (features) and open PR2 for review. Wait for squash merge.
3) After PR2 squash merge:
   - `git checkout master && git pull --ff-only`
   - `git checkout -b feat/schema-registry-tests`
4) Implement PR3 (tests + scripts) and open PR3.

### Current Branch and Status
- Current branch: `feat/schema-registry` (created from latest `master`: a383b8f)
- Status summary:
  - TypeScript build: PASS (`pnpm build`)
  - Tests: Ran existing test suite; online tests that require Kafka fail locally (expected without Kafka running). Offline/unit tests pass.
  - New SR features are opt-in and do not impact legacy flows unless explicitly used.
  - Dependencies aligned to base repo expectations: `kafkajs >= 2.2.4`.

### PR2 Scope — Add Schema Registry features (opt-in)
Goal: Introduce SR producer/consumer APIs and necessary internals. Keep legacy behavior unchanged by default.

#### 1) Interfaces (additive)
- File: `src/interfaces/index.ts`
- Edits:
  - `producer.useSchemaRegistry?: boolean;` (default false)
  - `schemaRegistry?: { url: string; auth?: { username: string; password: string } }`
- Notes: Fully backward compatible; does not modify existing enums or types.

#### 2) Helpers (additive)
- File: `src/helpers/index.ts`
- Additions:
  - `toKebabCase(str: string): string`
  - `getSubjectName(topic: string, schemaName: string): string`
- Notes: Pure additions; no name conflicts with existing exports.

#### 3) SR Core Modules (new files)
- Created files (minimal, compile-ready implementations preserving public shapes and opt-in behavior):
  - `src/schema-registry/client.ts` (SR client wrapper with config validation)
  - `src/schemas/base.ts`
  - `src/schemas/index.ts`
  - `src/schemas/dead-letter-queue.schema.ts`
  - `src/shared/queue-manager.ts`
  - `src/shared/error-handler.ts`
  - `src/utils/ajv.ts`
  - `src/consumer/internal/message-decoder.ts`
  - `src/consumer/internal/route-registry.ts`
  - `src/consumer/internal/validator.ts`
  - `src/consumer/internal/error-coordinator.ts`
  - `src/producer/schema-registry-producer.ts`
  - `src/consumer/schema-registry-consumer.ts`

Key behaviors:
- If `producer.useSchemaRegistry` is not enabled, legacy flows remain untouched.
- SR classes validate presence of `schemaRegistry.url` and throw a clear error if missing.
- Minimal implementations are designed to compile and smoke-test without disturbing legacy code paths. Actual Kafka send/consume integration for SR is left for PR3 tests if needed.

#### 4) Wire Exports (appenditive)
- File: `src/producer/index.ts`
  - Keep legacy exports.
  - Append: `SchemaRegistryProducer`
- File: `src/consumer/index.ts`
  - Keep legacy exports.
  - Append: `SchemaRegistryConsumerRouter`
- File: `src/index.ts`
  - Keep existing exports.
  - Append SR-related exports:
    - `SchemaRegistryProducer`
    - `SchemaRegistryConsumerRouter`
    - `SchemaRegistryClient`
    - From `./schemas`:
      - `BaseEventSchema`, `LegacyEventSchema`, `SchemaRegistryEventSchema`
      - `type BaseEvent`, `type LegacyEvent`, `type SchemaRegistryEvent`, `type EventMetadata`
      - `type EventHandler`, `type SchemaRegistryConfig`, `type ExtendedConfig`, `type SchemaValidationResult`
      - `validateEvent`, `createBaseEvent`, `createSchemaRegistryEvent`

#### 5) Dependencies (align with base repo expectations)
- `package.json` dependency constraints updated:
  - `kafkajs`: `>=2.2.4 <3` (align to base repo requirement “>= 2.2”)
  - `@kafkajs/confluent-schema-registry`
  - `zod`
  - `zod-to-json-schema`
  - `ajv`
  - `ajv-formats`
- Installed versions (from lockfile at install time):
  - `@kafkajs/confluent-schema-registry@3.9.0`
  - `ajv@8.17.1`
  - `ajv-formats@2.1.1`
  - `zod@3.25.76`
  - `zod-to-json-schema@3.25.0`
  - `kafkajs@2.2.4`

#### 6) docker-compose (optional for PR2; adds SR service)
- File: `docker-compose.yml`
  - Added `schema-registry` service (`confluentinc/cp-schema-registry:7.6.0`)
  - `app` now depends on `schema-registry` (and `kafkas` as before)
  - No top-level `version` key (keep prior behavior)
- Note: A Kafka/Zookeeper-compatible stack is present; SR is exposed on `8081`. For local manual tests, bring the stack up before running online tests.

#### 7) README (deferred or minimal note)
- Can be updated minimally in PR2, or more fully in PR3 with the test suite:
  - Document SR Producer/Consumer classes and config flags.
  - Emphasize that legacy behavior remains default/unchanged.

### Validation for PR2
- TypeScript build: PASS (`pnpm build`)
- Existing tests:
  - Unit-only tests pass locally.
  - Online tests fail locally without Kafka:
    - Errors: `ECONNREFUSED 127.0.0.1:9092` (expected when Kafka stack is not running).
  - To run all tests successfully locally, start the Docker stack first (see below).
- Manual smoke:
  - Legacy `emit`/`ConsumerRouter` paths remain unchanged unless SR classes are used.
  - Instantiating SR classes without `schemaRegistry.url` throws clear error.

### Scripts added to package.json (PR2)
- Added docker/test scripts to ease local runs:
  - `"test:unit": "vitest run src/helpers/__tests__/*.test.ts src/config/__tests__/*.test.ts"`
  - `"test:integration": "vitest run \"src/**/*.integration.test.ts\""`
  - `"docker:up": "docker compose up -d --wait kafkas schema-registry"`
  - `"docker:down": "docker compose down"`
  - `"docker:test": "pnpm run docker:up && pnpm run test && pnpm run docker:down"`
  - `"docker:test:integration": "pnpm run docker:up && pnpm run test:integration && pnpm run docker:down"`
- Notes:
  - Current unit tests live under `src/helpers/__tests__` and `src/config/__tests__`.
  - Integration tests will be introduced in PR3 with `*.integration.test.ts` naming.

### How to Run Locally
- Build:
  - `pnpm build`
- Unit tests only (avoid online/integration behavior):
  - With current scripts, all tests run; consider temporarily running only unit tests via `vitest` CLI filters or add scripts in PR3.
- Full test run (requires Kafka/SR up):
  1) `docker compose up -d --wait kafkas schema-registry`
  2) `pnpm test`
  3) `docker compose down`
  - PR3 will formalize `docker:*` scripts and split unit/integration.

### Edge Cases and Considerations
- Import cycles: Avoided by isolating SR internals from legacy exports.
- New helper names (`toKebabCase`, `getSubjectName`) do not collide with existing helpers.
- Respect `onlyTesting` where applicable in legacy paths; SR paths currently no-op for network behavior in PR2 implementations.
- SR features are entirely opt-in; legacy users see no behavior changes unless they instantiate SR classes or enable `producer.useSchemaRegistry`.

### Risks and Fallback
- All changes in PR2 are additive (plus minimal `docker-compose` and `package.json` updates).
- If SR features cause issues, users can ignore the new exports.
- Legacy API remains the default and unchanged by default configuration.

### PR3 Plan — SR Tests and Scripts
Goal: Add dedicated SR tests without touching legacy tests’ expectations.

Planned changes:
1) Add tests:
   - `src/schema-registry/__tests__/**/*`
   - `src/producer/__tests__/index.unit.test.ts`
   - `src/producer/__tests__/index.integration.test.ts`
   - `src/consumer/__tests__/index.unit.test.ts`
   - `src/consumer/__tests__/index.integration.test.ts`
   - `src/consumer/__tests__/dead-letter-queue.integration.test.ts`
   - `src/consumer/__tests__/error-preconditions.test.ts`
   - `src/test/kafka-manager.ts`
   - Update/merge `src/test/constants.ts` and `src/test/helpers.ts` if needed
2) Scripts (append to `package.json`):
   - `"test": "vitest run --exclude \"**/*.integration.test.ts\""`
   - `"test:integration": "vitest run \"src/**/*.integration.test.ts\""`
   - `"docker:up": "docker compose up -d --wait zookeeper kafka schema-registry kafka-ui"`
   - `"docker:down": "docker compose down"`
   - `"docker:test": "pnpm run docker:up && pnpm run test && pnpm run docker:down"`
   - `"docker:test:integration": "pnpm run docker:up && pnpm run test:integration && pnpm run docker:down"`
3) `docker-compose.yml`:
   - Ensure service names/ports match tests; include `schema-registry` and optionally `kafka-ui`

Validation for PR3:
- Unit tests pass locally: `pnpm test`
- Integration tests pass with stack up: `pnpm run docker:test:integration`
- Legacy unit tests still pass unchanged

### What Changed in This Branch (File Overview)
- Config: `src/interfaces/index.ts` (additive SR options)
- Helpers: `src/helpers/index.ts` (add `toKebabCase`, `getSubjectName`)
- New SR modules: added under `src/schema-registry`, `src/schemas`, `src/shared`, `src/utils`, `src/consumer/internal`, and SR producer/consumer files
- Exports wired:
  - `src/producer/index.ts` (+ `SchemaRegistryProducer`)
  - `src/consumer/index.ts` (+ `SchemaRegistryConsumerRouter`)
  - `src/index.ts` (+ SR exports and schema/types)
- Dependencies: `package.json` updated; installed with pnpm
- Docker: `docker-compose.yml` includes `schema-registry`

### Version Alignment
- Base repo expectation: `kafkajs >= 2.2`
- Enforced constraint: `kafkajs >= 2.2.4 < 3`
- Additional libs:
  - `@kafkajs/confluent-schema-registry`
  - `zod`, `zod-to-json-schema`
  - `ajv`, `ajv-formats`

### Next Steps
1) Commit and push PR2 branch:
   - `git add -A`
   - `git commit -m "feat(schema-registry): additive SR producer/consumer, helpers, exports, deps"`
   - `git push -u origin feat/schema-registry`
   - Open PR2
2) Optional: Add minimal README notes in PR2 (or defer to PR3).
3) After PR2 squash-merge:
   - `git checkout master && git pull --ff-only`
   - `git checkout -b feat/schema-registry-tests`
   - Implement PR3 tests and scripts

### How to Resume Work After Chat Reset
1) Ensure you’re on the right branch:
   - `git checkout feat/schema-registry`
   - `git pull --ff-only`
2) Install and build:
   - `pnpm install`
   - `pnpm build`
3) Run tests (unit-only recommended until Docker scripts are added in PR3):
   - `pnpm test` (will attempt online tests; expect failures without Kafka)
   - Or start infra first:
     - `docker compose up -d --wait kafkas schema-registry`
     - `pnpm test`
     - `docker compose down`
4) Open PR for review when ready.

