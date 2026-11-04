// SPDX-License-Identifier: Apache-2.0
/**
 * 凭证解析 —— 同一入口、两种凭证、统一主体（TASKLIST §168 GX3）。
 *
 * 优先级：`Authorization: Bearer` > `X-Api-Key` > 匿名。
 * 解析结果按会话绑定（Streamable HTTP session / SSE transport），
 * 每个会话各自向下游平台透传自己的凭证，不再共用同一把服务端 Key。
 *
 * 注：HTTP 入口**不接受**服务端 env Key 兜底 —— 否则任何匿名调用方都会继承
 * 该 Key 的身份（含写工具），等于公开一个真实账户。匿名会话只可使用公开工具。
 */
import type { IncomingHttpHeaders } from 'node:http';

export type Credential =
  | { type: 'bearer'; accessToken: string }
  | { type: 'apikey'; apiKey: string }
  | { type: 'anonymous' };

/** 取单个头（Node 会把重复头合并为数组）。 */
function headerValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0]?.trim() ?? '';
  return (value ?? '').trim();
}

/** 从请求头解析调用方凭证；均未提供时按匿名处理（仅公开工具可用）。 */
export function resolveCredential(headers: IncomingHttpHeaders): Credential {
  const authorization = headerValue(headers.authorization);
  if (authorization) {
    const matched = /^Bearer\s+(.+)$/i.exec(authorization);
    if (matched?.[1]?.trim()) {
      return { type: 'bearer', accessToken: matched[1].trim() };
    }
  }

  const apiKey = headerValue(headers['x-api-key']);
  if (apiKey) return { type: 'apikey', apiKey };

  return { type: 'anonymous' };
}
