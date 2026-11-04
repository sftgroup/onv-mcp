# 第三方许可清单

本仓自身以 [Apache-2.0](LICENSE) 发布。以下是构建与运行时依赖的许可汇总（随版本更新）。

## 运行时依赖

### `@onvcodes/mcp-server`

| 包 | 版本范围 | 许可 |
|---|---|---|
| `@modelcontextprotocol/sdk` | ^1.0.0 | MIT |
| `zod` | ^3.25 \|\| ^4.0 | MIT |

`@onvcodes/sdk` 在构建期被 `tsup` 内联进产物（`noExternal`），npm 包不声明其为运行时依赖。

### `@onvcodes/sdk`

无第三方运行时依赖。

## 构建期依赖

| 包 | 许可 |
|---|---|
| `tsup` | MIT |
| `typescript` | Apache-2.0 |
| `vitest` | MIT |
| `@types/node` | MIT |

## 合规复核

```bash
npx license-checker --summary --production
npx license-checker --onlyAllow "MIT;ISC;Apache-2.0;BSD-2-Clause;BSD-3-Clause;0BSD;Unlicense"
```

如发现清单与实际不符，请按 [CONTRIBUTING.md](CONTRIBUTING.md) 提交 issue。
