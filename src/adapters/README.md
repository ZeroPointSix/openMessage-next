# adapters/

出站集成层（outbound adapters）：持久化实现、外部服务/Provider SDK 封装。

- 只允许被 `modules/`（经 port 注入）和 `server/`（composition 装配）依赖。
- 禁止依赖 `interfaces/`、`server/` 的业务规则。
- 当前阶段为空壳：禁止提前创建 Repository、Channel Adapter、Provider SDK 占位实现（见 AGENTS.md「当前阶段」）。
