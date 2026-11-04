// SPDX-License-Identifier: Apache-2.0
/**
 * MCP 工具注册 —— 平台工具薄代理（MCP 全面化）
 *
 * 不再本地定义工具（避免双套定义漂移）：启动时从平台
 *   GET {baseUrl}/api/mcp/platform/tools
 * 动态发现工具清单（JSON Schema），把每个工具注册为 MCP 工具，
 * 调用时转发到
 *   POST {baseUrl}/api/mcp/platform/:tool  body { args }
 * 鉴权用 ONV_API_KEY（X-Api-Key；ahk_/ah_ 均支持）。
 *
 * 平台不可达 / 未配置 key：注册一个只读的 __platform_health 工具
 * 报告状态，避免 MCP 客户端看到空工具列表而困惑。
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

export interface McpProxyConfig {
  apiKey?: string;
  /** OAuth 2.1 access token（优先于 apiKey 下发）。 */
  accessToken?: string;
  baseUrl: string;
}

/** 平台发现接口返回的工具描述（含 GX2 的 title / group 与 §169.4 的 cost）。 */
interface DiscoveredTool {
  name: string;
  title?: string;
  group?: string;
  mode?: 'read' | 'write';
  description?: string;
  inputSchema?: Record<string, unknown>;
  /** §169.4：由平台按 shared.billing_rates 实时生成，如「≈ 27 credits/次（90d·1H）」 */
  cost?: {
    action?: string;
    base?: number;
    ratePer1kBars?: number;
    ratePer1kTokens?: number;
    free?: boolean;
    text?: string;
  };
}

/** JSON Schema → zod raw shape（MCP SDK registerTool 需要 zod schema） */
export function jsonSchemaToZod(schema: Record<string, unknown> | undefined): Record<string, z.ZodTypeAny> {
  const shape: Record<string, z.ZodTypeAny> = {};
  if (!schema || typeof schema !== 'object') return shape;
  const props = ((schema as any).properties ?? {}) as Record<string, any>;
  const required: string[] = Array.isArray((schema as any).required) ? (schema as any).required : [];
  for (const [key, p] of Object.entries(props)) {
    const desc = (p?.description ?? '') as string;
    let zt: z.ZodTypeAny;
    switch (p?.type) {
      case 'number': zt = z.number(); break;
      case 'boolean': zt = z.boolean(); break;
      case 'array': zt = z.array(z.any()); break;
      case 'object': zt = z.record(z.string(), z.any()); break;
      default: zt = z.string(); break;
    }
    let field: z.ZodTypeAny = required.includes(key) ? zt : zt.optional();
    if (desc) field = field.describe(desc);
    shape[key] = field;
  }
  return shape;
}

/** CallToolResult 的宽松形态（避免对 SDK 内部类型过度耦合）。 */
export interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
  [key: string]: unknown;
}

/** 统一执行：成功返回 JSON 文本，失败返回结构化 error content（不抛到协议层）。 */
export async function safeRun(fn: () => Promise<unknown> | unknown): Promise<ToolResult> {
  try {
    const result = await fn();
    const text = result === undefined ? 'OK' : JSON.stringify(result, null, 2);
    return { content: [{ type: 'text', text }] };
  } catch (err: any) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            { error: { code: 'PROXY_ERROR', message: err?.message || String(err) } },
            null,
            2,
          ),
        },
      ],
      isError: true,
    };
  }
}

/** 从平台发现工具清单（失败返回 null）。 */
export async function discoverTools(config: McpProxyConfig): Promise<DiscoveredTool[] | null> {
  try {
    const res = await fetch(`${config.baseUrl.replace(/\/+$/, '')}/api/mcp/platform/tools`, {
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const json = await res.json().catch(() => null);
    return json?.data?.tools ?? null;
  } catch {
    return null;
  }
}

/** 工具分组展示名（GX16：41 条工具按 4 组阅读）。 */
const GROUP_LABELS: Record<string, string> = {
  market: '行情',
  strategy: '策略',
  portfolio: '持仓与执行',
  account: '账户与额度',
};

/** 无平台 title 时的兜底展示名。 */
function humanizeToolName(name: string): string {
  return name.replace(/^platform_/, '').replace(/_/g, ' ');
}

/**
 * 将平台工具动态注册到 MCP Server（薄代理）。
 * 每个工具 handler：POST {base}/api/mcp/platform/{name}，body { args }，
 * 凭证按会话透传：OAuth Bearer 优先，其次 X-Api-Key（见 auth.ts）。
 */
export async function registerTools(server: McpServer, config: McpProxyConfig): Promise<number> {
  const base = config.baseUrl.replace(/\/+$/, '');
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (config.accessToken) headers['authorization'] = `Bearer ${config.accessToken}`;
  else if (config.apiKey) headers['x-api-key'] = config.apiKey;

  const tools = await discoverTools(config);
  if (!tools || tools.length === 0) {
    // 平台不可达 / 未配置 → 注册健康工具报告状态
    server.registerTool(
      '__platform_health',
      {
        title: 'Platform Health',
        description: '平台 MCP 端点状态。工具未加载时用于排查：检查 ONV_BASE_URL 与 ONV_API_KEY 配置。',
        inputSchema: {},
      },
      async () =>
        safeRun(() => ({
          ok: false,
          error: 'platform tools unavailable',
          detail: tools === null
            ? '无法从平台获取工具清单（检查 ONV_BASE_URL 与网络）'
            : '平台工具列表为空（检查 ENABLE_PLATFORM_TOOLS / PLATFORM_TOOL_PUBLIC_URL）',
          baseUrl: base,
          hasApiKey: !!config.apiKey,
        })),
    );
    return 0;
  }

  for (const tool of tools as DiscoveredTool[]) {
    const title = tool.title || humanizeToolName(tool.name);
    const isWrite = tool.mode === 'write';
    const groupLabel = tool.group ? GROUP_LABELS[tool.group] : '';
    const prefix = groupLabel ? `【${groupLabel}】` : '';
    const costSuffix = tool.cost?.text ? `（cost: ${tool.cost.text}）` : '';
    const suffix = isWrite ? '（写操作，外部调用将以 apikey 身份直接执行）' : '';
    server.registerTool(
      tool.name,
      {
        title,
        description: `${prefix}${tool.description ?? ''}${costSuffix}${suffix}`,
        inputSchema: jsonSchemaToZod(tool.inputSchema),
        annotations: {
          title,
          readOnlyHint: !isWrite,
          destructiveHint: isWrite,
        },
      },
      async (args) =>
        safeRun(async () => {
          const res = await fetch(`${base}/api/mcp/platform/${encodeURIComponent(tool.name)}`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ args: args ?? {} }),
            signal: AbortSignal.timeout(120000),
          });
          const text = await res.text();
          let json: unknown;
          try {
            json = JSON.parse(text);
          } catch {
            json = text;
          }
          if (!res.ok) {
            throw new Error(`platform tool failed (HTTP ${res.status}): ${text.slice(0, 500)}`);
          }
          return json;
        }),
    );
  }
  return tools.length;
}
