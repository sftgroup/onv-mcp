// SPDX-License-Identifier: Apache-2.0
/**
 * 全局类型定义 —— @onv/sdk
 *
 * 说明：
 * - 平台后端响应统一使用 `{ code, message, data }` 信封，SDK 在 `client.request` 中自动解包 `data`；
 *   个别端点（如 `agents.chainList`）通过 `raw: true` 保留完整响应体。
 * - 实体类型带 `[key: string]: unknown` 索引签名：后端字段持续演进时不会破坏消费方编译，
 *   同时已声明的字段仍享受完整类型提示。
 */

/* ────────────────────────── 请求基础 ────────────────────────── */

/** 可序列化为 query string 的值。 */
export type QueryValue = string | number | boolean | null | undefined;

/** query 参数表（undefined / null 会被跳过）。 */
export type QueryParams = Record<string, QueryValue>;

/** 单次请求选项。 */
export interface RequestOptions {
  /** URL query 参数。 */
  query?: QueryParams;
  /** JSON 请求体。 */
  body?: unknown;
  /** 追加请求头（会与认证头合并，同名覆盖）。 */
  headers?: Record<string, string>;
  /** 为 true 时返回完整响应体，而不是自动解包 `{code,message,data}` 信封。 */
  raw?: boolean;
}

/** 资源模块所需的客户端最小接口。 */
export interface RequestContext {
  request<T>(method: string, path: string, options?: RequestOptions): Promise<T>;
}

/* ────────────────────────── Agent / 策略 ────────────────────────── */

/** 平台上的 Agent（策略）实体。 */
export interface Agent {
  id: number;
  name: string;
  strategy_category?: string;
  category?: string;
  description?: string | null;
  status?: string;
  /** 订阅价格（可能为字符串，如 "0.01"）。 */
  subscription_price?: number | string;
  subscription_period?: string;
  payment_token?: string;
  total_subscribers?: number;
  total_aum?: number;
  avg_rating?: number;
  review_count?: number;
  backtest_report?: unknown;
  creator_user_id?: string;
  code?: string;
  encrypted_code_cid?: string;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

/** 创建 Agent（POST /api/strategies）的请求体。 */
export interface AgentInput {
  name: string;
  /** 后端要求 "dex" | "defi"。 */
  strategy_category?: 'dex' | 'defi' | string;
  category?: string;
  description?: string;
  status?: string;
  subscription_price?: number | string;
  subscription_period?: string;
  code?: string;
  [key: string]: unknown;
}

/** `agents.list()` 查询参数。 */
export interface AgentListParams {
  page?: number;
  pageSize?: number;
  activeOnly?: boolean;
  status?: string;
  category?: string;
  [key: string]: QueryValue;
}

/** 链上 Agent（`GET /api/market/chain-agents`），每个 Agent 可能带链上信息。 */
export interface ChainAgent extends Agent {
  chain?: string;
  address?: string;
  metadata?: { category?: string; [key: string]: unknown };
  total_on_chain?: number;
}

/** `agents.chainList()` 的返回（保留 top-level 的 total / total_on_chain）。 */
export interface ChainAgentList {
  agents: ChainAgent[];
  total?: number;
  total_on_chain?: number;
  code?: number;
  message?: string;
  [key: string]: unknown;
}

/** 删除操作的结果。 */
export interface DeleteResult {
  success?: boolean;
  message?: string;
  [key: string]: unknown;
}

/* ────────────────────────── 订阅 ────────────────────────── */

/** 订阅记录实体。 */
export interface Subscription {
  subscription_id?: number;
  id?: number;
  strategy_id?: number;
  agent_id?: number;
  strategy_name?: string;
  strategy_category?: string;
  status?: string;
  running_status?: string;
  cooling_off_ends?: string;
  expires_at?: string;
  tx_hash?: string;
  wallet_address?: string;
  plan_type?: string;
  plan_id?: number;
  price_paid?: number;
  created_at?: string;
  [key: string]: unknown;
}

/** `subscriptions.create()`（POST /api/v1/subscribe/rail）请求体。 */
export interface CreateSubscriptionPayload {
  strategy_id: number | string;
  agent_id?: number | string;
  /** 订阅通道。 */
  method?: 'chain' | 'fiat' | 'x402' | string;
  /** 订阅者钱包地址。 */
  address?: string;
  wallet_address?: string;
  period?: string;
  tx_hash?: string;
  plan_id?: number;
  [key: string]: unknown;
}

/** `subscriptions.agentSubscribe(id)` 请求体（POST /api/agent/v1/strategies/:id/subscribe）。 */
export interface AgentSubscribePayload {
  tx_hash?: string;
  wallet_address?: string;
  plan_type?: string;
  [key: string]: unknown;
}

/** `subscriptions.cancel()`（POST /api/v1/subscribe/cancel-refund）请求体。 */
export interface CancelSubscriptionPayload {
  subscription_id?: number | string;
  strategy_id?: number | string;
  tx_hash?: string;
  [key: string]: unknown;
}

/** 取消订阅结果。 */
export interface CancelResult {
  success?: boolean;
  refunded?: boolean;
  message?: string;
  subscription_id?: number | string;
  [key: string]: unknown;
}

/** `subscriptions.rails()`（GET /api/v1/subscribe/rails）返回：可用订阅通道探测。 */
export interface SubscriptionRails {
  rails?: string[];
  enabled?: Record<string, boolean>;
  gatewayConfigured?: boolean;
  [key: string]: unknown;
}

/* ────────────────────────── 回测 ────────────────────────── */

/** `backtest.run()`（POST /api/backtest/run）请求体。
 *  `strategy_id` 与 `strategy_code` 二选一；`code` / `strategy_code` 与 `capital` / `initial_capital` 为等价别名。 */
export interface BacktestParams {
  /** 策略 ID（走策略所有权校验，需 JWT 或 API Key 具备所有权）。 */
  strategy_id?: number;
  /** 策略代码（别名：strategy_code）。 */
  code?: string;
  strategy_code?: string;
  symbol: string;
  chain?: string;
  timeframe?: string;
  /** 初始资金（别名：initial_capital）。 */
  capital?: number;
  initial_capital?: number;
  start_date?: string;
  end_date?: string;
  params?: Record<string, unknown>;
  [key: string]: unknown;
}

/** 回测任务（job）。`jobId` 与 `job_id` 均可出现，SDK 在 run() 中统一归一化为 `jobId`。 */
export interface BacktestJob {
  jobId?: string;
  job_id?: string;
  status?: string;
  progress?: number;
  report?: unknown;
  error?: string;
  estimated_seconds?: number;
  created_at?: string;
  [key: string]: unknown;
}

/** 回测运行结果记录（GET /api/backtest/runs/:runId）。 */
export interface BacktestResults {
  id?: number;
  job_id?: string;
  strategy_id?: number;
  strategy_name?: string;
  symbol?: string;
  timeframe?: string;
  status?: string;
  error_message?: string;
  total_return?: number;
  max_drawdown?: number;
  sharpe_ratio?: number;
  win_rate?: number;
  profit_factor?: number;
  total_trades?: number;
  result_json?: unknown;
  created_at?: string;
  [key: string]: unknown;
}

/** `backtest.aiAnalyze()`（POST /api/backtest/ai-analyze）请求体。 */
export interface BacktestAnalyzePayload {
  jobId?: string;
  job_id?: string;
  runId?: string;
  result?: Record<string, unknown>;
  strategyName?: string;
  code?: string;
  [key: string]: unknown;
}

/* ────────────────────────── 交易 ────────────────────────── */

/** 风险控制参数（POST /api/agent/v1/trading/start）。 */
export interface RiskParams {
  maxAmountPerTrade?: number;
  maxDailyLoss?: number;
  maxSlippagePct?: number;
  coolDownSeconds?: number;
  maxConcurrency?: number;
  dailyMaxTrades?: number;
  [key: string]: unknown;
}

/** `trading.start()` 请求体。 */
export interface TradingStartPayload {
  strategyId: number | string;
  symbol: string;
  chain?: string;
  timeframe?: string;
  allocatedCapital: number;
  riskParams?: RiskParams;
  [key: string]: unknown;
}

/** `trading.stop()` 请求体。 */
export interface TradingStopPayload {
  instanceKey: string;
  [key: string]: unknown;
}

/** 交易实例（trading.start 返回）。 */
export interface TradingInstance {
  instanceKey: string;
  strategyId?: number | string;
  symbol?: string;
  chain?: string;
  timeframe?: string;
  allocatedCapital?: number;
  status?: string;
  [key: string]: unknown;
}

/** 交易实例状态（trading.status 返回）。 */
export interface TradingStatus {
  instanceKey?: string;
  strategyId?: number | string;
  strategyName?: string;
  symbol?: string;
  chain?: string;
  timeframe?: string;
  allocatedCapital?: number;
  running?: boolean;
  profitLoss?: number;
  startedAt?: string;
  [key: string]: unknown;
}

/** 停止交易的结果。 */
export interface TradingStopResult {
  instanceKey?: string;
  status?: string;
  [key: string]: unknown;
}

/** 实盘交易记录（trading.records 返回的单个 position/record）。 */
export interface TradePosition {
  id?: string | number;
  symbol?: string;
  side?: string;
  type?: string;
  price?: number | string;
  size?: number | string;
  amount?: number | string;
  pnl?: number | string;
  profit?: number | string;
  status?: string;
  timestamp?: string | number;
  strategy?: string;
  [key: string]: unknown;
}

/* ────────────────────────── AI 分析 ────────────────────────── */

/** `analysis.quick()`（POST /api/v1/workshop/ai-analyze）请求体。 */
export interface QuickAnalysisPayload {
  /** 回测结果对象。 */
  result?: Record<string, unknown>;
  strategyName?: string;
  code?: string;
  strategy_id?: number | string;
  [key: string]: unknown;
}

/** `analysis.deep()`（POST /api/v1/chat）请求体。 */
export interface DeepAnalysisPayload {
  message: string;
  agentId?: number | string;
  sessionId?: string;
  [key: string]: unknown;
}

/** 快速分析结果。 */
export interface AnalysisResult {
  analysis?: string;
  mode?: 'llm' | 'heuristic' | string;
  summary?: string;
  content?: string;
  [key: string]: unknown;
}

/** 深度对话（analysis.deep）返回。 */
export interface ChatResult {
  content?: string;
  message?: string;
  reply?: string;
  agentId?: number | string;
  sessionId?: string;
  source?: string;
  usage?: unknown;
  [key: string]: unknown;
}

/* ────────────────────────── 市场数据 ────────────────────────── */

/** K 线（bars）。 */
export interface MarketBar {
  timestamp?: string | number;
  time?: string | number;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  volume?: number;
  [key: string]: unknown;
}

/** `data.bars()` 查询参数。 */
export interface BarsParams {
  symbol: string;
  timeframe?: string;
  limit?: number;
  start?: string;
  end?: string;
  [key: string]: QueryValue;
}

/** `data.factors()` 查询参数。 */
export interface FactorsParams {
  symbols?: string;
  category?: string;
  live?: boolean;
  [key: string]: QueryValue;
}

/** 因子数据（GET /api/market-data/factors）。 */
export interface FactorsData {
  ts?: number;
  meta?: unknown;
  factors?: Record<string, unknown>;
  [key: string]: unknown;
}

/** `data.macro()` 查询参数（GET /api/market-data/history）。 */
export interface MacroParams {
  symbol?: string;
  timeframe?: string;
  ids?: string;
  start?: string;
  end?: string;
  limit?: number;
  [key: string]: QueryValue;
}

/** 因子历史序列中的一条。 */
export interface FactorSeriesEntry {
  ts?: number;
  [key: string]: unknown;
}

/** 因子历史序列（GET /api/market-data/history）。 */
export interface FactorHistory {
  symbol?: string;
  timeframe?: string;
  count?: number;
  series?: FactorSeriesEntry[];
  [key: string]: unknown;
}

/** `data.snapshots()` 查询参数。 */
export interface SnapshotParams {
  type?: string;
  [key: string]: QueryValue;
}

/** 市场快照数据（GET /api/market-data/snapshots）。 */
export interface SnapshotsData {
  snapshots?: Record<string, unknown>;
  [key: string]: unknown;
}

/** 市场总览（GET /api/market-data/overview）。 */
export interface MarketOverview {
  ts?: number;
  factorsLocal?: Record<string, unknown>;
  factorsLive?: Record<string, unknown>;
  history?: FactorSeriesEntry[];
  snapshots?: Record<string, unknown>;
  stats?: unknown;
  tickers?: Record<string, unknown>;
  [key: string]: unknown;
}
