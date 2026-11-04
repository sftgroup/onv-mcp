// SPDX-License-Identifier: Apache-2.0
/**
 * ONVError —— 所有失败（HTTP 错误 / 网络错误 / 参数错误）的统一错误类型。
 *
 * 字段：
 * - `code`      错误码（string）。优先取响应体里的 code，否则按 HTTP 状态码映射（如 404 -> NOT_FOUND）。
 * - `statusCode` HTTP 状态码；网络错误为 0。
 * - `detail`    详细说明（string，对象会被序列化）。
 * - `action`    可选的处理建议（来自响应体 action 字段）。
 */

/** 无响应体 code 时，按 HTTP 状态码映射为稳定错误码。 */
const STATUS_CODE: Record<number, string> = {
  400: 'INVALID_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  405: 'METHOD_NOT_ALLOWED',
  409: 'CONFLICT',
  422: 'UNPROCESSABLE_ENTITY',
  429: 'RATE_LIMITED',
  500: 'INTERNAL_ERROR',
  502: 'BAD_GATEWAY',
  503: 'SERVICE_UNAVAILABLE',
  504: 'GATEWAY_TIMEOUT',
};

const STATUS_MESSAGE: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  405: 'Method Not Allowed',
  409: 'Conflict',
  422: 'Unprocessable Entity',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
  504: 'Gateway Timeout',
};

function stringifyDetail(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === undefined || value === null) return '';
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export class ONVError extends Error {
  /** 错误码（string）。 */
  readonly code: string;
  /** HTTP 状态码；网络错误为 0。 */
  readonly statusCode: number;
  /** 详细说明。 */
  readonly detail: string;
  /** 可选的处理建议。 */
  readonly action?: string;

  constructor(message: string, code: string, statusCode: number, detail = '', action?: string) {
    super(message);
    this.name = 'ONVError';
    this.code = code;
    this.statusCode = statusCode;
    this.detail = detail;
    this.action = action;
  }

  /** 是否为网络层错误（fetch 失败 / 超时）。 */
  get isNetworkError(): boolean {
    return this.code === 'NETWORK_ERROR';
  }

  /**
   * 从 HTTP 响应构造错误。
   * 响应体按 `{ code, detail, action }` 解析（同时兼容 `{ message }`）；
   * 缺少 code 时按 statusCode 映射（如 404 -> NOT_FOUND）。
   */
  static fromHttpResponse(status: number, body: unknown): ONVError {
    const parsed = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;

    const rawCode = parsed.code;
    const code =
      typeof rawCode === 'string' || typeof rawCode === 'number'
        ? String(rawCode)
        : (STATUS_CODE[status] ?? `HTTP_${status}`);

    const detail = stringifyDetail(parsed.detail);
    const action = typeof parsed.action === 'string' ? parsed.action : undefined;

    const message =
      typeof parsed.message === 'string' && parsed.message
        ? parsed.message
        : detail
          ? `HTTP ${status}: ${detail}`
          : `HTTP ${status} ${STATUS_MESSAGE[status] ?? ''}`.trim();

    return new ONVError(message, code, status, detail, action);
  }

  /** 网络失败（fetch 抛错 / 超时 / DNS 等）→ code = NETWORK_ERROR, statusCode = 0。 */
  static networkError(original?: unknown): ONVError {
    const cause = original instanceof Error ? original : new Error(String(original));
    return new ONVError(
      `Network error: ${cause.message}`,
      'NETWORK_ERROR',
      0,
      cause.message,
    );
  }
}
