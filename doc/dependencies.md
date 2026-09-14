# 依赖去留记录（ZER-1121）

> 2026-09-14，母版清理后的依赖审计。每个直接依赖标记 `保留 / 删除 / 暂缓`。
> 原则：只保留清理后真正被工程能力使用的依赖；不因未来设想提前加包。

## 删除

| 包 | 原因 |
| --- | --- |
| `@types/k6` | k6 示例脚本已随示例业务删除，无调用方 |

（GraphQL / Mercurius / codegen / generated-client 相关依赖已在 ZER-1119 删除。）

## 保留

| 包 | 用途 |
| --- | --- |
| `fastify`, `fastify-plugin` | Web 框架与插件基元 |
| `@fastify/autoload` | 路由/插件自动加载 |
| `@fastify/awilix`, `awilix` | DI 容器 |
| `@fastify/cors`, `@fastify/helmet` | 基础安全插件 |
| `@fastify/otel` | OTel Fastify 探针 |
| `@fastify/request-context` | 请求上下文（correlationId） |
| `@fastify/swagger`, `@fastify/swagger-ui` | OpenAPI 文档 |
| `@fastify/type-provider-typebox` | TypeBox 类型提供者 |
| `@fastify/under-pressure` | `/health` 健康检查 |
| `typebox` | schema 定义 |
| `ajv`, `ajv-formats` | 校验（env-schema / Fastify 依赖） |
| `env-schema` | 环境变量校验 |
| `@opentelemetry/api`, `@opentelemetry/instrumentation`, `@opentelemetry/instrumentation-http`, `@opentelemetry/sdk-node` | OTel 基础设施（默认关闭） |
| `@biomejs/biome` | lint + format（`pnpm check`） |
| `typescript`, `@types/node` | 类型检查与原生 TS 执行 |
| `c8` | `pnpm test:coverage` |
| `dependency-cruiser` | `pnpm deps:validate` 边界校验 |
| `husky`, `@commitlint/cli`, `@commitlint/config-conventional` | git hooks 与提交规范 |
| `pino-pretty` | `pnpm start` 开发日志美化 |

## 暂缓（保留现状，后续单独决策，不因个人偏好替换）

| 包 / 配置 | 待定问题 |
| --- | --- |
| `postgres`（postgres.js）、`dbmate`、`docker-compose.yml`、`.env.example` 的 POSTGRES_* / DBMATE_* | 最终 persistence 技术未定 |
| `@cucumber/cucumber`, `@cucumber/html-formatter`, `@cucumber/messages`, `cucumber.mjs`, `tests/support/` | E2E 框架是否长期保留 |
| `semantic-release` + `@semantic-release/*`、`.releaserc`、`release.yml` 的 Release 步骤 | 发布策略未定（当前 `npmPublish: false`，仅 GitHub release + changelog） |
