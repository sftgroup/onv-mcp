// SPDX-License-Identifier: Apache-2.0
/**
 * MCP OAuth 2.1 资源服务器侧（GX8，TASKLIST §168 GX8）。
 *
 * MCP 规范要求资源服务器（本服务 `/mcp`）:
 *   ① 提供 RFC 9728 受保护资源元数据（PRM），指向授权服务器；
 *   ② 未认证时返回 `401` + `WWW-Authenticate: Bearer resource_metadata="…"`，
 *      客户端据此发现授权服务器并走 OAuth 2.1（PKCE + DCR）取令牌。
 *
 * 授权服务器由 onv-backend 承担（见 backend/routes/mcp-oauth.ts），本文件只负责
 * 元数据与质询头，不签发令牌。
 *
 * 开关：`MCP_OAUTH_CHALLENGE=true` 时对**既无 Bearer 也无 X-Api-Key**的请求返回
 * 401（标准行为）。默认关闭 —— 保留匿名/公开工具的既有可用性；把裸 `/mcp` 变成
 * 「必须登录」属于运营决策，不随代码默认生效。
 */
import type { IncomingHttpHeaders } from 'node:http';

/** 授权服务器 issuer（与 backend MCP_OAUTH_ISSUER 保持一致）。 */
export function oauthIssuer(): string {
  return String(process.env.MCP_OAUTH_ISSUER || 'https://onv.codes').replace(/\/+$/, '');
}

/** 受保护资源标识（本服务 `/mcp`）。 */
export function resourceIdentifier(): string {
  return String(process.env.MCP_RESOURCE_URL || `${oauthIssuer()}/mcp`).replace(/\/+$/, '');
}

/** PRM 的规范地址（同时用于广告与自检）。 */
export function protectedResourceMetadataUrl(): string {
  return `${oauthIssuer()}/.well-known/oauth-protected-resource`;
}

/** RFC 9728 受保护资源元数据。 */
export function protectedResourceMetadata(): Record<string, unknown> {
  return {
    resource: resourceIdentifier(),
    authorization_servers: [oauthIssuer()],
    bearer_methods_supported: ['header'],
    scopes_supported: ['mcp:read', 'mcp:write', 'mcp:trade', 'mcp:backtest'],
    resource_name: 'ONV Platform MCP',
    resource_documentation: `${oauthIssuer()}/mcp-setup`,
  };
}

/** 是否对无凭据请求发 OAuth 质询（默认关闭，见文件头说明）。 */
export function oauthChallengeEnabled(): boolean {
  return String(process.env.MCP_OAUTH_CHALLENGE || '').toLowerCase() === 'true';
}

/** 请求是否已自带凭据（有则不质询，交由下游按身份放行或拒绝）。 */
export function hasCredential(headers: IncomingHttpHeaders): boolean {
  const auth = headers.authorization;
  const apiKey = headers['x-api-key'];
  return Boolean((Array.isArray(auth) ? auth[0] : auth) || (Array.isArray(apiKey) ? apiKey[0] : apiKey));
}

/** 构造 401 质询响应（JSON-RPC 错误体 + WWW-Authenticate）。 */
export function sendOAuthChallenge(res: {
  writeHead: (status: number, headers: Record<string, string>) => unknown;
  end: (body?: string) => unknown;
}): void {
  res.writeHead(401, {
    'Content-Type': 'application/json',
    'WWW-Authenticate': `Bearer resource_metadata="${protectedResourceMetadataUrl()}"`,
  });
  res.end(JSON.stringify({
    jsonrpc: '2.0',
    error: { code: -32001, message: 'Unauthorized: OAuth bearer token required' },
    id: null,
  }));
}
