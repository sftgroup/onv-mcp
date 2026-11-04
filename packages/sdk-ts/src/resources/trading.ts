// SPDX-License-Identifier: Apache-2.0
/**
 * 交易资源 —— `/api/agent/v1/trading/*`、`/api/live/records`。
 */
import type {
  RequestContext,
  TradePosition,
  TradingInstance,
  TradingStartPayload,
  TradingStatus,
  TradingStopPayload,
  TradingStopResult,
} from '../types.js';

export class TradingResource {
  constructor(private readonly client: RequestContext) {}

  /** POST /api/agent/v1/trading/start —— 启动实盘交易。 */
  start(payload: TradingStartPayload): Promise<TradingInstance> {
    return this.client.request<TradingInstance>('POST', '/api/agent/v1/trading/start', {
      body: payload,
    });
  }

  /** POST /api/agent/v1/trading/stop —— 停止实盘交易。 */
  stop(payload: TradingStopPayload): Promise<TradingStopResult> {
    return this.client.request<TradingStopResult>('POST', '/api/agent/v1/trading/stop', {
      body: payload,
    });
  }

  /** GET /api/agent/v1/trading/status/:instanceKey —— 查询交易实例状态。 */
  status(instanceKey: string): Promise<TradingStatus> {
    return this.client.request<TradingStatus>(
      'GET',
      `/api/agent/v1/trading/status/${encodeURIComponent(instanceKey)}`,
    );
  }

  /** GET /api/live/records —— 实盘交易记录。 */
  async records(): Promise<TradePosition[]> {
    const body = await this.client.request<unknown>('GET', '/api/live/records');
    return toPositionArray(body);
  }
}

/** 将 records 响应归一化为 TradePosition[]。 */
export function toPositionArray(body: unknown): TradePosition[] {
  if (Array.isArray(body)) return body as TradePosition[];
  if (body && typeof body === 'object') {
    const obj = body as Record<string, unknown>;
    for (const key of ['records', 'items', 'trades', 'positions']) {
      if (Array.isArray(obj[key])) return obj[key] as TradePosition[];
    }
    if (Array.isArray(obj.data)) return obj.data as TradePosition[];
    if (obj.data && typeof obj.data === 'object') {
      const inner = obj.data as Record<string, unknown>;
      for (const key of ['records', 'items', 'trades', 'positions']) {
        if (Array.isArray(inner[key])) return inner[key] as TradePosition[];
      }
    }
  }
  return [];
}
