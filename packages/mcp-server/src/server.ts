#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
/**
 * @onvcodes/mcp-server 主入口（bin 指向 dist/server.js）。
 *
 * 三种运行模式：
 * - 默认 stdio：供 Claude Desktop / Cursor 以 stdio 方式拉起；
 * - `--sse` / `--http`：启动 HTTP 服务器（端口取 env PORT，默认 3002），同时提供
 *     ① Streamable HTTP：POST/GET/DELETE `/mcp`（主流目录与新版客户端）
 *     ② 兼容 SSE：GET `/sse` + POST `/message`（旧版客户端）
 *
 * 凭证（TASKLIST §168 GX3）：同一入口、两种凭证、统一主体。
 *   `Authorization: Bearer` > `X-Api-Key` > 匿名（HTTP 入口不使用服务端 env Key 兜底）；
 *   解析结果按会话绑定，各自向下游平台透传，不再共用同一把服务端 Key。
 */
import { ONVError } from '@onvcodes/sdk';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { resolveCredential, type Credential } from './auth.js';
import {
  hasCredential,
  oauthChallengeEnabled,
  protectedResourceMetadata,
  sendOAuthChallenge,
} from './oauth.js';
import { loadConfig, type McpConfig } from './config.js';
import { registerTools } from './tools.js';

/** 构建期由 tsup `define` 注入（值取 package.json 的 version） */
declare const __ONV_MCP_VERSION__: string;

const DEFAULT_PORT = 3002;
const MAX_BODY_BYTES = 4 * 1024 * 1024;

/** 按凭据构造会话级配置：Bearer 优先，其次客户端 Key，匿名则都不带。 */
function configForCredential(credential: Credential): McpConfig {
  const base = loadConfig();
  switch (credential.type) {
    case 'bearer':
      return { ...base, apiKey: undefined, accessToken: credential.accessToken };
    case 'apikey':
      return { ...base, apiKey: credential.apiKey, accessToken: undefined };
    default:
      return { ...base, apiKey: undefined, accessToken: undefined };
  }
}

/**
 * 构建 MCP Server：从平台动态发现工具并注册为薄代理。
 * 缺少 API Key / 平台不可达也能正常启动（tools/list 为空或仅健康工具）。
 */
export async function createMcpServer(config: McpConfig = loadConfig()): Promise<McpServer> {
  const server = new McpServer({
    name: 'onv-mcp-server',
    // 由 tsup `define` 在构建期注入 package.json 版本，避免发版后 serverInfo 版本漂移
    version: __ONV_MCP_VERSION__,
  });
  const count = await registerTools(server, config);
  console.error(
    `[onv-mcp] registered ${count} platform tools (baseUrl=${config.baseUrl}, auth=${
      config.accessToken ? 'bearer' : config.apiKey ? 'apikey' : 'anonymous'
    })`,
  );
  return server;
}

/** 读取并解析 JSON 请求体（Streamable HTTP 需要显式传 parsedBody）。 */
async function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = chunk as Buffer;
    size += buf.length;
    if (size > MAX_BODY_BYTES) throw new Error('request body too large');
    chunks.push(buf);
  }
  if (size === 0) return undefined;
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

/** 浏览器型 MCP 客户端所需的极简 CORS（不携带 Cookie，故不使用 credentials）。 */
function applyCors(res: http.ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-Api-Key, Mcp-Session-Id, MCP-Protocol-Version',
  );
  res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id');
}

/**
 * HTTP 模式：同时提供 Streamable HTTP（`/mcp`）与 SSE（`/sse` + `/message`）。
 *
 * ⚠️ 多会话模型：MCP SDK 的 Server 实例同一时刻只能 connect 一个 transport，
 * 因此每个会话都创建独立的 McpServer（工具清单按会话缓存）。
 */
export async function startHttpServer(port: number): Promise<http.Server> {
  const sseTransports = new Map<string, SSEServerTransport>();
  const streamTransports = new Map<string, StreamableHTTPServerTransport>();

  const httpServer = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

    // 健康检查 / 说明页
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/health')) {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(
        'ONV MCP Server is running.\n' +
          'Streamable HTTP: POST/GET/DELETE /mcp\n' +
          'SSE (legacy):    GET /sse + POST /message\n',
      );
      return;
    }

    // RFC 9728 受保护资源元数据（GX8）：授权服务器发现的入口。
    // 同时接受 `/.well-known/oauth-protected-resource` 与按路径插入的 `…/mcp`。
    if (req.method === 'GET' &&
        (url.pathname === '/.well-known/oauth-protected-resource' ||
         url.pathname === '/.well-known/oauth-protected-resource/mcp')) {
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300',
      });
      res.end(JSON.stringify(protectedResourceMetadata()));
      return;
    }

    if (url.pathname === '/mcp') {
      applyCors(res);
      if (req.method === 'OPTIONS') {
        res.writeHead(204).end();
        return;
      }
      // OAuth 质询（MCP_OAUTH_CHALLENGE=true 时生效）：无任何凭据 → 401 + WWW-Authenticate
      if (oauthChallengeEnabled() && !hasCredential(req.headers)) {
        sendOAuthChallenge(res);
        return;
      }
      await handleStreamableHttp(req, res, streamTransports);
      return;
    }

    // ── 兼容：SSE 事件流（每会话独立 McpServer + SSEServerTransport，一对一）──
    if (req.method === 'GET' && url.pathname === '/sse') {
      if (oauthChallengeEnabled() && !hasCredential(req.headers)) {
        sendOAuthChallenge(res);
        return;
      }
      const messageEndpoint = process.env.MCP_MESSAGE_PATH || '/message';
      const transport = new SSEServerTransport(messageEndpoint, res);
      sseTransports.set(transport.sessionId, transport);
      res.on('close', () => {
        sseTransports.delete(transport.sessionId);
      });
      try {
        const credential = resolveCredential(req.headers);
        const sessionServer = await createMcpServer(configForCredential(credential));
        await sessionServer.connect(transport);
      } catch (err: unknown) {
        sseTransports.delete(transport.sessionId);
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[onv-mcp] session ${transport.sessionId} connect failed: ${message}`);
        res.destroy();
      }
      return;
    }

    // 客户端消息投递（带 sessionId 查询参数）
    if (req.method === 'POST' && url.pathname === '/message') {
      const sessionId = url.searchParams.get('sessionId');
      const transport = sessionId ? sseTransports.get(sessionId) : undefined;
      if (!transport) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('No active SSE transport for sessionId');
        return;
      }
      // SDK v1: handlePostMessage(req, res) —— 第三参为 parsedBody，勿传 sessionId（旧版签名已废弃）
      await transport.handlePostMessage(req, res);
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  });

  await new Promise<void>((resolve) => httpServer.listen(port, resolve));
  return httpServer;
}

/** Streamable HTTP：初始化建会话、后续请求按 `Mcp-Session-Id` 复用。 */
async function handleStreamableHttp(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  transports: Map<string, StreamableHTTPServerTransport>,
): Promise<void> {
  const rawSessionId = req.headers['mcp-session-id'];
  const sessionId = Array.isArray(rawSessionId) ? rawSessionId[0] : rawSessionId;

  try {
    let transport = sessionId ? transports.get(sessionId) : undefined;

    if (!transport) {
      // 已有会话 ID 但找不到 → 会话已过期
      if (sessionId) {
        sendJson(res, 404, {
          jsonrpc: '2.0',
          error: { code: -32001, message: 'Session not found' },
          id: null,
        });
        return;
      }

      if (req.method !== 'POST') {
        sendJson(res, 400, {
          jsonrpc: '2.0',
          error: { code: -32000, message: 'Bad Request: Mcp-Session-Id header is required' },
          id: null,
        });
        return;
      }

      const body = await readJsonBody(req);
      if (!body || (body as { method?: string }).method !== 'initialize') {
        sendJson(res, 400, {
          jsonrpc: '2.0',
          error: { code: -32000, message: 'Bad Request: first request must be initialize' },
          id: null,
        });
        return;
      }

      // 仅初始化请求解析凭证：整条会话沿用该身份
      const credential = resolveCredential(req.headers);
      const created = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (id: string) => {
          transports.set(id, created);
        },
      });
      created.onclose = () => {
        if (created.sessionId) transports.delete(created.sessionId);
      };
      const sessionServer = await createMcpServer(configForCredential(credential));
      await sessionServer.connect(created);
      await created.handleRequest(req, res, body);
      return;
    }

    if (req.method === 'POST') {
      const body = await readJsonBody(req);
      await transport.handleRequest(req, res, body);
      return;
    }

    // GET（服务端事件流）/ DELETE（结束会话）
    await transport.handleRequest(req, res);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[onv-mcp] streamable http error: ${message}`);
    if (!res.headersSent) {
      sendJson(res, 500, {
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Internal server error' },
        id: null,
      });
    }
  }
}

async function main(): Promise<void> {
  const httpMode = process.argv.includes('--sse') || process.argv.includes('--http');

  if (httpMode) {
    const port = Number(process.env.PORT ?? DEFAULT_PORT);
    await startHttpServer(port);
    // 日志走 stderr，避免污染任何 stdout 协议流。
    console.error(`[onv-mcp] HTTP server listening on http://localhost:${port} (mcp + sse)`);
  } else {
    const server = await createMcpServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
  }
}

main().catch((err: unknown) => {
  const message = err instanceof ONVError ? err.message : err instanceof Error ? err.message : String(err);
  console.error(`[onv-mcp] failed to start: ${message}`);
  process.exit(1);
});
