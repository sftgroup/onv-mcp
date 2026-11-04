// SPDX-License-Identifier: Apache-2.0
/**
 * Agent（策略）资源 —— `/api/strategies`、`/api/market/chain-agents`。
 */
import type {
  Agent,
  AgentInput,
  AgentListParams,
  ChainAgent,
  ChainAgentList,
  DeleteResult,
  RequestContext,
} from '../types.js';

export class AgentsResource {
  constructor(private readonly client: RequestContext) {}

  /** GET /api/strategies?page=&pageSize=&activeOnly= —— 列出当前用户的 Agent。
   *  兼容后端三种响应形态：数组、`{strategies:[...]}`、信封 `{data:{items:[...]}}`。 */
  async list(params: AgentListParams = {}): Promise<Agent[]> {
    const body = await this.client.request<unknown>('GET', '/api/strategies', {
      query: params,
    });
    return toAgentArray(body);
  }

  /** GET /api/strategies/:id —— 获取单个 Agent。 */
  get(id: string | number): Promise<Agent> {
    return this.client.request<Agent>(
      'GET',
      `/api/strategies/${encodeURIComponent(String(id))}`,
    );
  }

  /** POST /api/strategies —— 创建 Agent。 */
  create(data: AgentInput): Promise<Agent> {
    return this.client.request<Agent>('POST', '/api/strategies', { body: data });
  }

  /** PATCH /api/strategies/:id —— 更新 Agent。 */
  update(id: string | number, data: Partial<AgentInput>): Promise<Agent> {
    return this.client.request<Agent>(
      'PATCH',
      `/api/strategies/${encodeURIComponent(String(id))}`,
      { body: data },
    );
  }

  /** DELETE /api/strategies/:id —— 删除 Agent。 */
  delete(id: string | number): Promise<DeleteResult> {
    return this.client.request<DeleteResult>(
      'DELETE',
      `/api/strategies/${encodeURIComponent(String(id))}`,
    );
  }

  /** GET /api/market/chain-agents —— 链上 Agent（含 total_on_chain）。 */
  async chainList(): Promise<ChainAgentList> {
    const body = await this.client.request<unknown>('GET', '/api/market/chain-agents', {
      raw: true,
    });
    return toChainAgentList(body);
  }
}

/** 将 list 响应归一化为 Agent[]。 */
export function toAgentArray(body: unknown): Agent[] {
  if (Array.isArray(body)) return body as Agent[];
  if (body && typeof body === 'object') {
    const obj = body as Record<string, unknown>;
    if (Array.isArray(obj.strategies)) return obj.strategies as Agent[];
    if (Array.isArray(obj.items)) return obj.items as Agent[];
    if (Array.isArray(obj.data)) return obj.data as Agent[];
    if (obj.data && typeof obj.data === 'object') {
      const inner = obj.data as Record<string, unknown>;
      if (Array.isArray(inner.items)) return inner.items as Agent[];
    }
  }
  return [];
}

/** 将 chain-agents 响应归一化为 { agents, total, total_on_chain }。 */
export function toChainAgentList(body: unknown): ChainAgentList {
  if (Array.isArray(body)) {
    return { agents: body as ChainAgent[], total: body.length };
  }
  if (body && typeof body === 'object') {
    const obj = body as Record<string, unknown>;
    if (Array.isArray(obj.agents)) {
      return obj as unknown as ChainAgentList;
    }
    if (Array.isArray(obj.data)) {
      return {
        agents: obj.data as ChainAgent[],
        total: typeof obj.total === 'number' ? obj.total : undefined,
        total_on_chain:
          typeof obj.total_on_chain === 'number' ? obj.total_on_chain : undefined,
        code: typeof obj.code === 'number' ? obj.code : undefined,
        message: typeof obj.message === 'string' ? obj.message : undefined,
      };
    }
    if (obj.data && typeof obj.data === 'object') {
      const inner = obj.data as Record<string, unknown>;
      if (Array.isArray(inner.items)) {
        return { agents: inner.items as ChainAgent[], total: inner.items.length };
      }
    }
  }
  return { agents: [] };
}
