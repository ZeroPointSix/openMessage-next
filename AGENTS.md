# AGENTS.md

本文件是本仓库的工程协作约束。

## 当前阶段

本仓库当前是 openMessage 后端重写母版，只允许清理和维护基础设施。

- 禁止创建真实业务代码或迁移旧系统代码。
- 禁止设计数据库 schema。
- 禁止添加业务模块、Repository、Port、Domain、DTO、事件或路由作为占位。
- 禁止提前接入 MCP、消息渠道、Provider SDK 或其他未来依赖。
- 新的业务实现必须有单独的需求与设计评审。

## 工具链

| 项目 | 约束 |
| --- | --- |
| 包管理器 | 只使用 `pnpm` |
| Lint 与格式化 | 只使用 Biome |
| 变更后检查 | 必须运行 `pnpm check` |
| 单元测试 | `pnpm test:unit` |
| E2E 测试 | `pnpm test:e2e` |
| 依赖边界 | `pnpm deps:validate` |
| 数据库迁移 | DBMate |

## 工程约束

- TypeScript 使用严格模式、ESM 与带 `.ts` 后缀的导入。
- 文件名使用 kebab-case。
- 不使用 `any`、`enum` 或 `console`；日志使用注入的 Pino logger。
- 中间件不得修改 action，应创建新对象。
- 模块之间不得直接依赖；跨模块协作通过 CQRS 总线或明确契约完成。
- Handler 不得直接访问数据库实现，只能依赖接口。
- SQL 只允许出现在持久化适配器中，并使用参数化查询。
- 不修改与当前任务无关的技术选型。

## 服务基础设施

- `src/server/` 是 composition root：只做 Fastify 插件注册与依赖装配，不承载业务规则。
- `src/interfaces/` 是入站交付层：HTTP 路由（`*.route.ts`，由 server autoload 统一挂在 `/api` 前缀）、未来的 MCP/Webhook 端点。
- `src/modules/` 承载业务模块；模块对外公开面只有 `index.ts` 与 `*.events.ts`，内部实现不对外。
- `src/adapters/` 承载出站集成：持久化实现、外部服务/Provider SDK 封装。
- `src/shared/` 与 `src/config/` 是叶子层：通用 CQRS、数据库、异常、工具代码与环境配置，不得反向依赖上层。
- `/health` 必须始终可用，且不得依赖真实业务或数据库数据。
- 上述边界由 `pnpm deps:validate`（dependency-cruiser）强制，规则见 `.dependency-cruiser.cjs`。

## 验证

提交前至少执行：

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm test
pnpm deps:validate
```

涉及启动路径时，还要实际启动服务并请求 `/health`。
