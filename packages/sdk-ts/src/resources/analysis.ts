// SPDX-License-Identifier: Apache-2.0
/**
 * AI 分析资源 —— `/api/v1/workshop/ai-analyze`、`/api/v1/chat`。
 */
import type {
  AnalysisResult,
  ChatResult,
  DeepAnalysisPayload,
  QuickAnalysisPayload,
  RequestContext,
} from '../types.js';

export class AnalysisResource {
  constructor(private readonly client: RequestContext) {}

  /** POST /api/v1/workshop/ai-analyze —— 快速回测分析。
   *  body 可为 `{ result, strategyName, code }` 或 `{ strategy_id }`。 */
  quick(payload: QuickAnalysisPayload): Promise<AnalysisResult> {
    return this.client.request<AnalysisResult>('POST', '/api/v1/workshop/ai-analyze', {
      body: payload,
    });
  }

  /** POST /api/v1/chat —— 深度 AI 对话（body: { message, agentId?, sessionId? }）。 */
  deep(payload: DeepAnalysisPayload): Promise<ChatResult> {
    return this.client.request<ChatResult>('POST', '/api/v1/chat', { body: payload });
  }
}
