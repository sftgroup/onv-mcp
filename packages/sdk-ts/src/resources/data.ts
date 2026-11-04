// SPDX-License-Identifier: Apache-2.0
/**
 * 市场数据资源 —— `/api/market-data/*`。
 */
import type {
  BarsParams,
  FactorHistory,
  FactorsData,
  FactorsParams,
  MacroParams,
  MarketBar,
  MarketOverview,
  RequestContext,
  SnapshotsData,
  SnapshotParams,
} from '../types.js';

export class DataResource {
  constructor(private readonly client: RequestContext) {}

  /** GET /api/market-data/bars?symbol=&timeframe=&limit= —— K 线。 */
  async bars(params: BarsParams): Promise<MarketBar[]> {
    const body = await this.client.request<unknown>('GET', '/api/market-data/bars', {
      query: params,
    });
    return toBarArray(body);
  }

  /** GET /api/market-data/factors?symbols= —— 市场因子。 */
  factors(params: FactorsParams = {}): Promise<FactorsData> {
    return this.client.request<FactorsData>('GET', '/api/market-data/factors', {
      query: params,
    });
  }

  /** GET /api/market-data/history?symbol=&timeframe=&ids= —— 宏观/因子历史序列。 */
  macro(params: MacroParams = {}): Promise<FactorHistory> {
    return this.client.request<FactorHistory>('GET', '/api/market-data/history', {
      query: params,
    });
  }

  /** GET /api/market-data/snapshots?type= —— 市场快照。 */
  snapshots(params: SnapshotParams = {}): Promise<SnapshotsData> {
    return this.client.request<SnapshotsData>('GET', '/api/market-data/snapshots', {
      query: params,
    });
  }

  /** GET /api/market-data/overview —— 市场总览（聚合因子/历史/快照/行情）。 */
  overview(): Promise<MarketOverview> {
    return this.client.request<MarketOverview>('GET', '/api/market-data/overview');
  }
}

/** 将 bars 响应归一化为 MarketBar[]。 */
export function toBarArray(body: unknown): MarketBar[] {
  if (Array.isArray(body)) return body as MarketBar[];
  if (body && typeof body === 'object') {
    const obj = body as Record<string, unknown>;
    if (Array.isArray(obj.bars)) return obj.bars as MarketBar[];
    if (Array.isArray(obj.data)) return obj.data as MarketBar[];
    if (Array.isArray(obj.items)) return obj.items as MarketBar[];
    if (obj.data && typeof obj.data === 'object') {
      const inner = obj.data as Record<string, unknown>;
      if (Array.isArray(inner.bars)) return inner.bars as MarketBar[];
      if (Array.isArray(inner.items)) return inner.items as MarketBar[];
    }
  }
  return [];
}
