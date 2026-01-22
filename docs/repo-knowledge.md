## Event Streamer (Atomic) - Working Notes

### Goals
- Import compatible tests from origin while expanding unit coverage for Schema Registry and consumer internals.
- Cleanly separate unit vs integration test execution.
- Keep Docker images Apple Silicon-friendly.

### What we implemented
- New unit tests:
  - consumer/internal: `route-registry.test.ts`, `message-decoder.test.ts`, `validator.test.ts`
  - shared: `error-handler.test.ts`, `queue-manager.test.ts`
  - helpers: `subject-name.test.ts`
  - utils: `ajv.test.ts`
  - schema-registry: appended invalid JSON fallback decode case to `client.test.ts`
  - producer: `schema-registry-producer.test.ts` (config validation)
- Test separation:
  - Added `vitest.unit.config.ts` to run only unit tests.
  - Added `vitest.integration.config.ts` to run integration-like tests (`*.integration.test.ts` plus producer/consumer legacy online tests).
  - package.json:
    - `test:unit`: `vitest --run -c vitest.unit.config.ts`
    - `test:integration`: `vitest --run -c vitest.integration.config.ts`
- Docker:
  - `docker-compose.yml`: bump Kafka to `bitnami/kafka:3.7.0` (multi-arch).
  - Schema Registry remains configured to use `PLAINTEXT://kafkas:29092`.

### Rationale and compatibility notes
- We avoided porting origin tests that assert advanced SR/CLI/DLQ behaviors not implemented here yet.
- `MessageDecoder` unit tests inject a fake client to bypass config and focus on behavior.
- `SchemaRegistryClient` still provides minimal JSON fallback; we covered invalid JSON decode error.
- `SchemaRegistryProducer` validates config flags (`producer.useSchemaRegistry === true` and `schemaRegistry.url` present).
- Queue concurrency is tested with `QueueManager` to ensure deterministic ordering at different concurrency levels.

### How to run tests
- Unit:
  - `pnpm run test:unit`
    - Uses `vitest.unit.config.ts`
    - Excludes `*.integration.test.ts`, `src/consumer/__tests__/index.test.ts`, `src/producer/__tests__/index.test.ts`
- Integration (requires Docker):
  - `pnpm run docker:up`
  - `pnpm run test:integration`
  - `pnpm run docker:down`
    - Uses `vitest.integration.config.ts`
    - Includes `*.integration.test.ts` and producer/consumer `index.test.ts`
- Full suite (optional):
  - `pnpm run docker:test` executes `test` (by default unit) — run `test:integration` explicitly when needed.

### Next steps
- After SR feature parity improves, port origin’s SR integration tests.
- If CI flakiness appears in `queue-manager.test.ts`, increase wait durations slightly.
- Consider adding a `test:all` that runs both configs sequentially when Docker is available.

### Files touched
- Tests added under `src/**/__tests__/`
- `src/schema-registry/__tests__/client.test.ts` (appended invalid JSON case)
- `docker-compose.yml` (Kafka 3.7.0)
- `vitest.unit.config.ts`, `vitest.integration.config.ts`
- `package.json` scripts for unit/integration split

