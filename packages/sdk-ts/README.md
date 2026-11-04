# @onv/sdk

ONV SaaS 平台官方 **REST API 客户端 SDK**（TypeScript）。用于第三方应用集成平台的 **Agent 管理、回测、交易、AI 分析与市场数据** 能力。

- 纯 `fetch` 实现，**零运行时依赖**（Node.js >= 18）
- TypeScript 严格类型标注（strict），导出完整类型
- 命名空间 API（无 default export）
- 自动处理：`{ code, message, data }` 响应信封解包、请求超时、指数退避重试、统一错误类型

## 安装

```bash
npm install @onv/sdk
```

## 快速开始

```ts
import { ONV } from '@onv/sdk';

// 方式一：平台 API Key（X-Api-Key 头，ah_ 前缀）
const client = new ONV({ apiKey: 'ah_xxxxxxxx' });

// 方式二：Access Token（Authorization: Bearer 头）
// const client = new ONV({ accessToken: 'eyJ...' });

// 自定义后端地址（默认 https://onv.codes）
// const client = new ONV({ apiKey: 'ah_xxxxxxxx', baseUrl: 'https://onv.codes' });

const agents = await client.agents.list({ page: 1, pageSize: 20 });
console.log(agents);

const job = await client.backtest.run({
  code: 'def strategy(data): ...',
  symbol: 'BTC/USDC',
  timeframe: '1H',
  capital: 10000,
});
const status = await client.backtest.status(job.jobId!);
```

### 获取 API Key

平台管理后台（onv.codes 登录 → 用户菜单 → 管理后台 → API Keys）创建：

| Key | 前缀 | 认证通道 | 权限 |
| --- | --- | --- | --- |
| 平台 API Key | `ah_` | `X-Api-Key` | 绑定用户，permissions 控制（如 `agents:read` / `backtest:run` / `agents:write` / `admin`） |
| Agent API Key | `ahk_` | `X-Api-Key` | Agent 身份，scopes 控制（read / write / trade / subscribe / withdraw / admin） |

> Key 明文仅创建时显示一次；服务端只存 SHA-256 哈希。吊销/续期均在后台完成。

## 构造参数

| 参数 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `baseUrl` | `string` | `https://onv.codes` | API 根地址（生产域名；内网联调可用 `http://localhost:3100`） |
| `apiKey` | `string` | — | 作为 `X-Api-Key` 请求头（与 accessToken 二选一） |
| `accessToken` | `string` | — | 作为 `Authorization: Bearer <token>` 请求头 |
| `timeoutMs` | `number` | `30000` | 单次请求超时（毫秒） |
| `retries` | `number` | `2` | 网络错误 / 429 / 5xx 的重试次数（指数退避） |
| `retryDelayMs` | `number` | `200` | 首次重试退避基数（毫秒） |
| `headers` | `Record<string, string>` | — | 附加请求头 |

## 错误处理

所有失败统一抛出 `ONVError`：

```ts
import { ONV, ONVError } from '@onv/sdk';

try {
  await client.agents.get(123);
} catch (err) {
  if (err instanceof ONVError) {
    err.code;       // string，如 "NOT_FOUND" / "UNAUTHORIZED" / "NETWORK_ERROR"（优先取响应体 code，否则按状态码映射）
    err.statusCode; // number，HTTP 状态码；网络错误为 0
    err.detail;     // string，详细说明
    err.action;     // string | undefined，可选的处理建议
    err.isNetworkError; // 是否为网络层错误
  }
}
```

错误码映射：`400 → INVALID_REQUEST`、`401 → UNAUTHORIZED`、`403 → FORBIDDEN`、`404 → NOT_FOUND`、`409 → CONFLICT`、`429 → RATE_LIMITED`、`500 → INTERNAL_ERROR`、`502 → BAD_GATEWAY`、`503 → SERVICE_UNAVAILABLE`、`504 → GATEWAY_TIMEOUT`。

## API 参考

所有方法均返回 `Promise`，请求体/响应体类型见包内 `*.d.ts`。

### client.agents — Agent 管理

| 方法 | 端点 | 说明 |
| --- | --- | --- |
| `list(params?)` | `GET /api/strategies?page=&pageSize=&activeOnly=` | 列出 Agent，兼容 `{strategies:[...]}` / 数组 / 信封三种响应形态 |
| `get(id)` | `GET /api/strategies/:id` | 获取单个 Agent |
| `create(data)` | `POST /api/strategies` | 创建 Agent |
| `update(id, data)` | `PATCH /api/strategies/:id` | 更新 Agent |
| `delete(id)` | `DELETE /api/strategies/:id` | 删除 Agent |
| `chainList()` | `GET /api/market/chain-agents` | 链上 Agent，返回 `{ agents, total, total_on_chain }` |

### client.subscriptions — 订阅

| 方法 | 端点 | 说明 |
| --- | --- | --- |
| `create(payload)` | `POST /api/v1/subscribe/rail` | 订阅 Agent（body: `{ strategy_id, agent_id, tx_hash, ... }`） |
| `list()` | `GET /api/v1/subscribe/list` | 我的订阅列表 |
| `cancel(payload)` | `POST /api/v1/subscribe/cancel-refund` | 取消订阅并退款 |
| `rails()` | `GET /api/v1/subscribe/rails` | 可用订阅通道探测（chain / fiat / x402） |
| `agentSubscribe(id, payload?)` | `POST /api/agent/v1/strategies/:id/subscribe` | 以 Agent API 身份订阅 |

### client.backtest — 回测

| 方法 | 端点 | 说明 |
| --- | --- | --- |
| `run(params)` | `POST /api/v1/backtest/run` | 提交回测任务；响应 `jobId` / `job_id` 统一归一化为 `jobId` |
| `status(jobId)` | `GET /api/backtest/:jobId` | 查询任务状态 |
| `results(runId)` | `GET /api/backtest/runs/:runId` | 获取运行结果 |
| `aiAnalyze(payload)` | `POST /api/backtest/ai-analyze` | 对回测结果做 AI 分析 |

### client.trading — 交易

| 方法 | 端点 | 说明 |
| --- | --- | --- |
| `start(payload)` | `POST /api/agent/v1/trading/start` | 启动实盘交易 |
| `stop(payload)` | `POST /api/agent/v1/trading/stop` | 停止实盘交易 |
| `status(instanceKey)` | `GET /api/agent/v1/trading/status/:instanceKey` | 查询交易实例状态 |
| `records()` | `GET /api/live/records` | 实盘交易记录 |

### client.analysis — AI 分析

| 方法 | 端点 | 说明 |
| --- | --- | --- |
| `quick(payload)` | `POST /api/v1/workshop/ai-analyze` | 快速回测分析（body 可为 `{ result, strategyName, code }` 或 `{ strategy_id }`） |
| `deep(payload)` | `POST /api/v1/chat` | 深度 AI 对话（body: `{ message, agentId?, sessionId? }`） |

### client.data — 市场数据

| 方法 | 端点 | 说明 |
| --- | --- | --- |
| `bars(params)` | `GET /api/market-data/bars?symbol=&timeframe=&limit=` | K 线 |
| `factors(params)` | `GET /api/market-data/factors?symbols=` | 市场因子 |
| `macro(params)` | `GET /api/market-data/history?symbol=&timeframe=&ids=` | 宏观 / 因子历史序列 |
| `snapshots(params)` | `GET /api/market-data/snapshots?type=` | 市场快照 |
| `overview()` | `GET /api/market-data/overview` | 市场总览 |

### 底层请求

资源方法之外，也可直接使用客户端底层请求方法（自动解包信封、带重试/超时）：

```ts
const data = await client.request('GET', '/api/strategies', {
  query: { page: 1 },
  headers: { 'X-Extra': '1' },
});
// 需要完整响应体（如保留 total_on_chain 等信封顶层字段）时：
const raw = await client.request('GET', '/api/market/chain-agents', { raw: true });
```

## 开发

```bash
npm install
npm run build    # tsup 打包 ESM + CJS + d.ts
npm run typecheck  # tsc --noEmit
npm test         # vitest（mock fetch，不访问网络）
```

## License

Apache-2.0
