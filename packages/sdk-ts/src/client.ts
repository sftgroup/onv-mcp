// SPDX-License-Identifier: Apache-2.0
/**
 * ONV —— @onv/sdk 的主客户端。
 *
 * 纯 fetch 实现（零运行时依赖），支持：
 * - apiKey（`X-Api-Key` 头）或 accessToken（`Authorization: Bearer` 头）两种认证；
 * - 请求超时（AbortController）、指数退避重试（网络错误 / 429 / 5xx）；
 * - 自动解包后端 `{ code, message, data }` 响应信封。
 */
import { ONVError } from './errors.js';
import type { QueryParams, RequestOptions } from './types.js';
import { AgentsResource } from './resources/agents.js';
import { SubscriptionsResource } from './resources/subscriptions.js';
import { BacktestResource } from './resources/backtest.js';
import { TradingResource } from './resources/trading.js';
import { AnalysisResource } from './resources/analysis.js';
import { DataResource } from './resources/data.js';

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export interface ONVConfig {
  /** API 根地址，默认 https://onv.codes */
  baseUrl?: string;
  /** API Key 认证（作为 `X-Api-Key` 请求头）。 */
  apiKey?: string;
  /** Access Token 认证（作为 `Authorization: Bearer <token>` 请求头）。 */
  accessToken?: string;
  /** 单次请求超时（毫秒），默认 30000。 */
  timeoutMs?: number;
  /** 网络错误 / 429 / 5xx 的重试次数，默认 2（总计最多 3 次尝试）。 */
  retries?: number;
  /** 首次重试退避基数（毫秒），指数增长，默认 200。 */
  retryDelayMs?: number;
  /** 附加请求头（与认证头合并，同名覆盖）。 */
  headers?: Record<string, string>;
}

const DEFAULT_BASE_URL = 'https://onv.codes';
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_RETRIES = 2;
const DEFAULT_RETRY_DELAY_MS = 200;

/** 判断响应体是否为 `{ code, message, data }` 信封。 */
function isEnvelope(body: unknown): body is Record<string, unknown> {
  return (
    !!body &&
    typeof body === 'object' &&
    'data' in body &&
    ('code' in body || 'message' in body)
  );
}

/** 解包信封，取 `data`；非信封原样返回。 */
function unwrapData<T>(body: unknown): T {
  return (isEnvelope(body) ? (body as Record<string, unknown>).data : body) as T;
}

export class ONV {
  readonly agents: AgentsResource;
  readonly subscriptions: SubscriptionsResource;
  readonly backtest: BacktestResource;
  readonly trading: TradingResource;
  readonly analysis: AnalysisResource;
  readonly data: DataResource;

  readonly baseUrl: string;

  private readonly apiKey?: string;
  private readonly accessToken?: string;
  private readonly timeoutMs: number;
  private readonly retries: number;
  private readonly retryDelayMs: number;
  private readonly extraHeaders: Record<string, string>;

  constructor(config: ONVConfig = {}) {
    if (!config.apiKey && !config.accessToken) {
      throw new ONVError(
        'Either apiKey or accessToken must be provided',
        'MISSING_AUTH',
        400,
      );
    }

    this.baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.apiKey = config.apiKey;
    this.accessToken = config.accessToken;
    this.timeoutMs = Math.max(0, config.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    this.retries = Math.max(0, config.retries ?? DEFAULT_RETRIES);
    this.retryDelayMs = Math.max(0, config.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS);
    this.extraHeaders = config.headers ?? {};

    this.agents = new AgentsResource(this);
    this.subscriptions = new SubscriptionsResource(this);
    this.backtest = new BacktestResource(this);
    this.trading = new TradingResource(this);
    this.analysis = new AnalysisResource(this);
    this.data = new DataResource(this);
  }

  /**
   * 发起请求（资源模块与高级用户共用）。
   * - 默认自动解包 `{ code, message, data }` 信封；
   * - 网络错误 / 429 / 5xx 按指数退避重试；
   * - HTTP 错误抛 ONVError。
   */
  async request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
    const maxAttempts = this.retries + 1;
    let attempt = 0;

    for (;;) {
      attempt += 1;
      try {
        const body = await this.execute(method, path, options);
        return (options.raw ? body : unwrapData<T>(body)) as T;
      } catch (err) {
        if (attempt >= maxAttempts || !this.isRetryable(err)) throw err;
        await this.delay(this.retryDelayMs * 2 ** (attempt - 1));
      }
    }
  }

  private isRetryable(err: unknown): boolean {
    if (err instanceof ONVError) {
      return err.isNetworkError || err.statusCode === 429 || err.statusCode >= 500;
    }
    return true;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async execute(
    method: string,
    path: string,
    options: RequestOptions,
  ): Promise<unknown> {
    const url = this.buildUrl(path, options.query);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers: this.buildHeaders(options.headers),
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: controller.signal,
      });
    } catch (err) {
      if (controller.signal.aborted) {
        throw ONVError.networkError(
          new Error(`Request timed out after ${this.timeoutMs}ms`),
        );
      }
      throw ONVError.networkError(err);
    } finally {
      clearTimeout(timer);
    }

    const text = await response.text();
    let body: unknown;
    try {
      body = text ? JSON.parse(text) : undefined;
    } catch {
      body = text;
    }

    if (!response.ok) {
      throw ONVError.fromHttpResponse(response.status, body);
    }
    return body;
  }

  private buildUrl(path: string, query?: QueryParams): string {
    const qs = serializeQuery(query);
    return `${this.baseUrl}${path}${qs ? `?${qs}` : ''}`;
  }

  private buildHeaders(extra?: Record<string, string>): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...this.extraHeaders,
      ...extra,
    };
    if (this.apiKey) headers['X-Api-Key'] = this.apiKey;
    if (this.accessToken) headers['Authorization'] = `Bearer ${this.accessToken}`;
    return headers;
  }
}

/** 将 query 参数序列化为 URL query string（undefined / null 跳过）。 */
export function serializeQuery(query?: QueryParams): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    params.set(key, String(value));
  }
  return params.toString();
}
