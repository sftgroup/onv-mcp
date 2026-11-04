// SPDX-License-Identifier: Apache-2.0
/**
 * @onv/sdk —— ONV SaaS 平台官方 REST API 客户端。
 *
 * 命名空间 API（无 default export）：
 * ```ts
 * import { ONV, ONVError } from '@onv/sdk';
 *
 * const client = new ONV({ apiKey: 'sk-...' });
 * const agents = await client.agents.list();
 * ```
 */
export { ONV } from './client.js';
export type { ONVConfig, HttpMethod } from './client.js';
export { ONVError } from './errors.js';
export * from './types.js';
