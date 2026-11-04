# @onvcodes/mcp-server

ONV 平台的 [MCP (Model Context Protocol)](https://modelcontextprotocol.io) Server。
把平台的**行情数据、公开 Agent/策略、回测、订阅、AI 生成**等能力暴露为 MCP 工具，
供 **Claude Desktop / Cursor / Cline** 等 AI Agent 调用。

## 架构：平台工具薄代理

MCP Server **不本地硬编码工具**（避免与平台双套定义漂移），采用运行时动态发现：

```
MCP Client (Claude / Cursor …)
   │  Streamable HTTP（远程，推荐）/ SSE（兼容）/ stdio（本地）
   ▼
mcp-server（本包）
   │ ① 启动/会话时   GET {baseUrl}/api/mcp/platform/tools   → 发现工具清单（JSON Schema）
   │ ② 客户端调用工具 POST {baseUrl}/api/mcp/platform/{tool} body { args }
   │    凭证按会话透传：Authorization: Bearer > X-Api-Key > 匿名（仅公开工具）
   ▼
onv-backend（平台 /api/mcp/platform/*，3 通道鉴权：X-Api-Key / ?at= / Bearer JWT）
```

- 工具清单与执行端点由 **onv-backend 统一承载**（`backend/routes/platform-mcp.ts`），
  本服务只是把平台工具翻译成 MCP 协议（zod schema 注册 + 调用转发）。
- 平台不可达 / 未配置 API Key / 工具端点 404 时，注册一个只读 `__platform_health`
  兜底工具报告状态（tools/list 不为空，便于排查），正常时**注册全部平台工具**。

## 平台工具（当前 41 个）

`tools/list` 返回 41 个平台工具，按权限分层，并按 4 组展示（`market` / `strategy` / `portfolio` / `account`）：

| 分层 | 数量 | 说明 |
|------|:---:|------|
| L0 公开读（无需身份） | 10 | `market_*` · `symbol_search` · `quick_analysis` · `list_agents` · `get_agent` · `plans` · `wallet_balance` |
| L1 用户读（需 API Key / 登录绑定用户） | 15 | `my_strategies` · `backtest_*` · `subscription_*` · `user_*` · `account_overview` · `positions` · `trade_history` · `credentials` · `risk_config` · `factory_runs` · `dex_quote` |
| L2 写操作（需授权 scope） | 16 | `run_backtest` · `manage_strategy` · `publish_strategy` · `subscribe_*` · `ai_generate` · `ai_optimize` · `place_order` · `cancel_order` · `close_position` · `flat_all` · `set_risk_config` · `set_breaker` · `reset_breaker` · `dex_swap` · `factory_run` · `close_preview` |

> 每个工具都带 MCP `annotations`：`title`（中文短名）、`readOnlyHint`（读为 true）、
> `destructiveHint`（写为 true）——满足 Claude Connectors 目录的硬性要求。
> 展示元数据集中在 [`backend/services/platform-tools/tool-meta.ts`](../backend/services/platform-tools/tool-meta.ts)。

> 工具定义会随平台演进自动更新：改动只发生在 backend 的
> [`PLATFORM_TOOL_DEFS`](../backend/services/platform-tools/registry.ts)，MCP Server 无需发版。
> 后端通过 `ENABLE_PLATFORM_TOOLS=true` 开启工具端点（生产已开启）。

## 快速接入（生产，推荐 Streamable HTTP）

生产 MCP Server 已随 onv.codes 统一栈部署（容器 `onv-mcp`，nginx `/mcp` 与 `/mcp/` 反代）：

- **Streamable HTTP 端点（推荐）**：`https://onv.codes/mcp`
- **SSE 端点（兼容）**：`https://onv.codes/mcp/sse`
- **鉴权（按会话透传）**：
  - `Authorization: Bearer <token>`（OAuth / 平台 JWT）
  - 或 `X-Api-Key: ah_… / ahk_…`（平台 / Agent Key）
  - 均未提供时按**匿名**处理，只能使用公开工具（行情 / 公开 Agent / 套餐等）；
    HTTP 入口不接受服务端 env Key 兜底，避免匿名调用方继承真实账户身份

### Claude Desktop

Claude Desktop → Settings → Developer → Edit Config → `claude_desktop_config.json`：

```json
{
  "mcpServers": {
    "onv": {
      "type": "http",
      "url": "https://onv.codes/mcp",
      "headers": {
        "X-Api-Key": "ah_你的平台APIKey"
      }
    }
  }
}
```

保存后重启 Claude Desktop，对话中即可使用 `platform_market_quote`、`platform_list_agents`、
`platform_run_backtest`、`platform_ai_generate` 等工具。

### Cursor

Cursor → Settings → MCP → Add new MCP server：

- **Type**：HTTP（远程，推荐）
- **Name**：`onv`
- **URL**：`https://onv.codes/mcp`
- **Headers**：`X-Api-Key: ah_你的平台APIKey`

旧版 Cursor 若不支持 HTTP 类型，可退回 SSE：`https://onv.codes/mcp/sse`。

### 其他 MCP 客户端

支持「Streamable HTTP + 自定义 header」的客户端填 `https://onv.codes/mcp` 与 `X-Api-Key`；
仅支持 SSE 的客户端填 `https://onv.codes/mcp/sse`。两者共用同一套工具与鉴权。

## 本地开发

依赖：Node ≥ 18。

```bash
cd mcp-server
npm install
npm run build   # tsup 打包 ESM + CJS + dts 到 dist/
npm test        # vitest（工具 schema / 注册测试）
```

启动：

```bash
# stdio 模式（默认，供 Claude Desktop / Cursor 本地拉起）
ONV_API_KEY=ah_xxx node dist/server.js

# HTTP 模式（本地 :3002，同时提供 /mcp 与 /sse）
ONV_API_KEY=ah_xxx node dist/server.js --http
# => HTTP server listening on http://localhost:3002 (mcp + sse)
```

### 环境变量

| 变量 | 必填 | 默认值 | 说明 |
| ---- | ---- | ------ | ---- |
| `ONV_API_KEY` | - | - | 服务端兜底 Key（`ah_` / `ahk_` 前缀）。**客户端自带凭证时优先用客户端的**；均缺省时仅公开工具可用 |
| `ONV_BASE_URL` | - | `https://onv.codes` | 平台 API 根地址（内网联调可指 `http://localhost:3100`） |
| `PORT` | - | `3002` | HTTP 模式监听端口 |
| `MCP_MESSAGE_PATH` | - | `/message` | SSE 握手事件里的消息投递路径；经 nginx 反代时配置（生产为 `/mcp/message`） |

### Claude Desktop / Cursor 本地 stdio 配置

```json
{
  "mcpServers": {
    "onv": {
      "command": "node",
      "args": ["/absolute/path/to/onv/mcp-server/dist/server.js"],
      "env": {
        "ONV_API_KEY": "ah_你的平台APIKey",
        "ONV_BASE_URL": "https://onv.codes"
      }
    }
  }
}
```

## API Key 与权限

| Key | 前缀 | 用途 | 写权限 |
| --- | --- | ---- | ---- |
| 平台 API Key | `ah_` | 外部应用 / MCP 调用，绑定用户 + permissions | permissions 含工具 scope（如 `backtest:run` / `agents:write`）或 `admin` 才能直执写工具 |
| Agent API Key | `ahk_` | Agent 身份直调 | scopes 含 `write` / `admin` 才能直执写工具 |

- 读类（L0）无需鉴权即可调用（返回公开数据）。
- 用户读（L1）与写（L2）工具要求 `X-Api-Key` 能解析到有效用户（无效/吊销返回 401）。
- 写工具（L2）在 key 有对应 scope 时**直接执行并落审计**；无 scope 返回 403。
- 对话场景（`?at=` HMAC token）写操作只落 pending，由前端操作卡确认后执行。

## 生产部署（onv.codes 统一栈）

- compose 服务：`apps/onv-core/deploy/docker-compose.onv.yml` 的 `mcp`（:3002，
  build context `apps/onv`，dockerfile `mcp-server/Dockerfile`）。
- nginx：`location = /mcp` / `location /mcp/` 反代到 `mcp:3002`（Streamable HTTP 关 buffering + 3600s 读超时）；
  `location /api/mcp/` 反代到 `onv-backend:3100`（工具发现/调用端点）。
- 凭据：**按会话透传**，不配置服务端 Key（`MCP_API_KEY` 已从 compose 移除）。
  `MCP_BASE_URL` 默认 `https://onv.codes`。
- 后端开关：`ENABLE_PLATFORM_TOOLS=true`（`platform-tools.ts` 灰度门，生产已置 true）。

### 多会话说明

MCP SDK 的 Server 实例同一时刻只能 connect 一个 transport（否则抛 `Already connected`）。
本服务为**每个会话（Streamable HTTP session / SSE transport）创建独立 McpServer 实例**
（每次会重新发现工具清单），多客户端并发/重连不会互相影响；凭证也随会话隔离。

## 故障排查

| 现象 | 原因与处理 |
| --- | --- |
| `tools/list` 只有 `__platform_health` | 工具发现失败。检查 `ONV_BASE_URL` 可达性、backend `ENABLE_PLATFORM_TOOLS=true`、nginx `/api/mcp/` 反代 |
| 调用返回 `invalid or revoked api key` | 客户端下发的 `X-Api-Key` / Bearer 无效/已吊销（须 `ah_`/`ahk_` 前缀）；匿名调用用户级工具即为此提示 |
| 调用返回 404 `unknown platform tool` | 工具清单与端点版本不同步（发现后平台已改名），更新 mcp-server 镜像重连 |
| POST `/message` 502 | 多为 SSE 会话未建立/已断开时投递（sessionId 过期），客户端应重连重新握手 |

## License

Apache-2.0
