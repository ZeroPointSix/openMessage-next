# openMessage-next

openMessage 后端重写母版。当前仓库只保留可启动、可检查的基础设施，不包含真实业务模型、业务接口或客户端发布能力。

## 当前边界

- 保留 Fastify、TypeScript、依赖注入、CQRS 基础设施、Postgres.js、DBMate、OpenTelemetry 与基础安全插件。
- 保留 Cucumber、k6 和 semantic-release 的现有工具链，后续是否继续使用另行决定。
- 不包含 GraphQL、generated client、示例 migration、示例 seed 或示例业务模块。
- 当前阶段禁止创建真实业务代码、数据库 schema，以及 Repository、Port、Domain 等占位结构。

## 环境要求

- Node.js 24 或更高版本
- pnpm 11 或更高版本
- PostgreSQL（仅在需要验证数据库能力时使用）

## 本地启动

```bash
pnpm install --frozen-lockfile
pnpm create:env
pnpm start
```

服务默认监听 `http://localhost:3000`。

## 可用入口

- `GET /health`：服务健康检查
- `GET /api-docs`：Swagger UI
- `GET /api-docs/json`：OpenAPI 文档

当前没有业务 API。

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `pnpm check` | 检查格式、lint 与 TypeScript 类型 |
| `pnpm test` | 运行单元测试 |
| `pnpm test:e2e` | 运行 Cucumber E2E 框架 |
| `pnpm deps:validate` | 检查依赖边界 |
| `pnpm db:migrate` | 执行已有 DBMate migration |
| `pnpm db:seed` | 执行已有 DBMate seed |
| `pnpm start:prod` | 以生产模式启动服务 |

## 目录结构

```text
src/
├── config/          环境配置
├── modules/         后续业务模块入口，当前为空
├── server/          Fastify、插件与依赖注入
└── shared/          通用基础设施
tests/
├── shared/          通用测试步骤
└── support/         Cucumber 测试运行支持
```

新增任何业务实现前，应先完成对应需求、领域模型和持久化方案的评审。
