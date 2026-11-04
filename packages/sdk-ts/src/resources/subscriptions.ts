// SPDX-License-Identifier: Apache-2.0
/**
 * 订阅资源 —— `/api/v1/subscribe/*`、`/api/agent/v1/strategies/:id/subscribe`。
 */
import type {
  AgentSubscribePayload,
  CancelResult,
  CancelSubscriptionPayload,
  CreateSubscriptionPayload,
  RequestContext,
  Subscription,
  SubscriptionRails,
} from '../types.js';

export class SubscriptionsResource {
  constructor(private readonly client: RequestContext) {}

  /** POST /api/v1/subscribe/rail —— 订阅 Agent（body: { strategy_id, agent_id, tx_hash, ... }）。 */
  create(payload: CreateSubscriptionPayload): Promise<Subscription> {
    return this.client.request<Subscription>('POST', '/api/v1/subscribe/rail', {
      body: payload,
    });
  }

  /** GET /api/v1/subscribe/list —— 我的订阅列表。 */
  async list(): Promise<Subscription[]> {
    const body = await this.client.request<unknown>('GET', '/api/v1/subscribe/list');
    return toSubscriptionArray(body);
  }

  /** POST /api/v1/subscribe/cancel-refund —— 取消订阅并退款。 */
  cancel(payload: CancelSubscriptionPayload): Promise<CancelResult> {
    return this.client.request<CancelResult>('POST', '/api/v1/subscribe/cancel-refund', {
      body: payload,
    });
  }

  /** GET /api/v1/subscribe/rails —— 可用订阅通道探测（chain / fiat / x402）。 */
  rails(): Promise<SubscriptionRails> {
    return this.client.request<SubscriptionRails>('GET', '/api/v1/subscribe/rails');
  }

  /** POST /api/agent/v1/strategies/:id/subscribe —— 以 Agent API 身份订阅指定策略。 */
  agentSubscribe(
    id: string | number,
    payload: AgentSubscribePayload = {},
  ): Promise<Subscription> {
    return this.client.request<Subscription>(
      'POST',
      `/api/agent/v1/strategies/${encodeURIComponent(String(id))}/subscribe`,
      { body: payload },
    );
  }
}

/** 将 list 响应归一化为 Subscription[]。 */
export function toSubscriptionArray(body: unknown): Subscription[] {
  if (Array.isArray(body)) return body as Subscription[];
  if (body && typeof body === 'object') {
    const obj = body as Record<string, unknown>;
    for (const key of ['items', 'subscriptions', 'data']) {
      if (Array.isArray(obj[key])) return obj[key] as Subscription[];
    }
    if (obj.data && typeof obj.data === 'object') {
      const inner = obj.data as Record<string, unknown>;
      if (Array.isArray(inner.items)) return inner.items as Subscription[];
    }
  }
  return [];
}
