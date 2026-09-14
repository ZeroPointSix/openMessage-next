# interfaces/

入站交付层（delivery）：HTTP 路由（`*.route.ts`）、未来的 MCP/Webhook 端点。

- `server/` 的 autoload 只从这里注册 `*.route.ts`，统一挂在 `/api` 前缀下。
- 只能调用 CQRS 总线与模块公开入口（`modules/<name>/index.ts` 或 `*.events.ts`），禁止直接依赖持久化实现（`shared/db/`、`*.repository.ts`）。
- 当前阶段为空壳：禁止创建真实业务接口占位（见 AGENTS.md「当前阶段」）。
