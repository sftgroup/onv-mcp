// SPDX-License-Identifier: Apache-2.0
/**
 * MCP Server 环境配置 —— 从环境变量加载 ONV API 凭据与服务地址。
 *
 * 环境变量：
 * - `ONV_API_KEY`    （必填）ONV 平台 API Key，作为 `X-Api-Key` 请求头。
 * - `ONV_BASE_URL`   （可选）平台 API 根地址，默认 `https://onv.codes`。
 */
import { ONV, ONVError } from '@onvcodes/sdk';

export interface McpConfig {
  apiKey?: string;
  /** OAuth 2.1 access token（GX8 预留）：存在时优先以 Bearer 下发，不再发送 X-Api-Key。 */
  accessToken?: string;
  baseUrl: string;
}

/** 从环境变量加载配置（不抛错，缺少 key 时延后到调用工具时报错）。 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): McpConfig {
  return {
    apiKey: env.ONV_API_KEY || undefined,
    baseUrl: env.ONV_BASE_URL || 'https://onv.codes',
  };
}

/** 基于配置创建 SDK 客户端；缺少 API Key 时抛 ONVError。 */
export function createClient(config: McpConfig = loadConfig()): ONV {
  if (!config.apiKey) {
    throw new ONVError(
      'ONV_API_KEY is not set. Set the ONV_API_KEY environment variable to your ONV API key before calling tools.',
      'MISSING_API_KEY',
      400,
    );
  }
  return new ONV({ apiKey: config.apiKey, baseUrl: config.baseUrl });
}
