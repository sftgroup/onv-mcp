// SPDX-License-Identifier: Apache-2.0
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ONV, ONVError } from '../src/index.js';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** 替换全局 fetch 并返回 mock，便于断言调用。 */
function stubFetch(impl: (url: string, init?: RequestInit) => Promise<Response>) {
  const mock = vi.fn(impl);
  vi.stubGlobal('fetch', mock);
  return mock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('ONV 客户端基础', () => {
  it('apiKey 与 accessToken 都未提供时抛 MISSING_AUTH', () => {
    try {
      new ONV();
      expect.unreachable('应当抛出 ONVError');
    } catch (err) {
      expect(err).toBeInstanceOf(ONVError);
      const e = err as ONVError;
      expect(e.code).toBe('MISSING_AUTH');
      expect(e.statusCode).toBe(400);
    }
    expect(() => new ONV({ apiKey: 'k' })).not.toThrow();
    expect(() => new ONV({ accessToken: 't' })).not.toThrow();
  });

  it('baseUrl 默认为 https://onv.codes', () => {
    const client = new ONV({ apiKey: 'k' });
    expect(client.baseUrl).toBe('https://onv.codes');
  });

  it('去掉 baseUrl 末尾斜杠', () => {
    const client = new ONV({ apiKey: 'k', baseUrl: 'https://api.example.com/' });
    expect(client.baseUrl).toBe('https://api.example.com');
  });

  it('apiKey 以 X-Api-Key 请求头发送', async () => {
    const fetchMock = stubFetch(() =>
      Promise.resolve(jsonResponse(200, { code: 200, data: { ok: true }, message: 'ok' })),
    );
    const client = new ONV({ apiKey: 'sk-test' });
    await client.request('GET', '/api/strategies');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://onv.codes/api/strategies');
    const headers = (init?.headers ?? {}) as Record<string, string>;
    expect(headers['X-Api-Key']).toBe('sk-test');
    expect(headers['Authorization']).toBeUndefined();
  });

  it('accessToken 以 Authorization: Bearer 请求头发送', async () => {
    const fetchMock = stubFetch(() =>
      Promise.resolve(jsonResponse(200, { code: 200, data: { ok: true }, message: 'ok' })),
    );
    const client = new ONV({ accessToken: 'tok123' });
    await client.request('GET', '/api/strategies');

    const [, init] = fetchMock.mock.calls[0];
    const headers = (init?.headers ?? {}) as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer tok123');
    expect(headers['X-Api-Key']).toBeUndefined();
  });

  it('合并自定义请求头', async () => {
    const fetchMock = stubFetch(() =>
      Promise.resolve(jsonResponse(200, { code: 200, data: { ok: true }, message: 'ok' })),
    );
    const client = new ONV({ apiKey: 'k', headers: { 'X-Custom': 'v1' } });
    await client.request('GET', '/api/strategies', { headers: { 'X-Request': 'r1' } });

    const [, init] = fetchMock.mock.calls[0];
    const headers = (init?.headers ?? {}) as Record<string, string>;
    expect(headers['X-Custom']).toBe('v1');
    expect(headers['X-Request']).toBe('r1');
  });

  it('序列化 query 参数并跳过 undefined/null', async () => {
    const fetchMock = stubFetch(() =>
      Promise.resolve(jsonResponse(200, { code: 200, data: { ok: true }, message: 'ok' })),
    );
    const client = new ONV({ apiKey: 'k' });
    await client.request('GET', '/api/strategies', {
      query: { page: 1, pageSize: 20, activeOnly: true, skip: undefined, nil: null },
    });
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe('https://onv.codes/api/strategies?page=1&pageSize=20&activeOnly=true');
  });

  it('自动解包 {code, message, data} 信封', async () => {
    stubFetch(() => Promise.resolve(jsonResponse(200, { code: 200, data: { id: 7 }, message: 'ok' })));
    const client = new ONV({ apiKey: 'k' });
    const result = await client.request<{ id: number }>('GET', '/api/strategies/7');
    expect(result).toEqual({ id: 7 });
  });

  it('非信封响应原样返回', async () => {
    stubFetch(() => Promise.resolve(jsonResponse(200, [{ a: 1 }])));
    const client = new ONV({ apiKey: 'k' });
    const result = await client.request<unknown[]>('GET', '/api/strategies');
    expect(result).toEqual([{ a: 1 }]);
  });

  it('raw: true 时返回完整响应体', async () => {
    stubFetch(() =>
      Promise.resolve(
        jsonResponse(200, { code: 200, data: [], total_on_chain: 3, message: 'ok' }),
      ),
    );
    const client = new ONV({ apiKey: 'k' });
    const result = await client.request<Record<string, unknown>>(
      'GET',
      '/api/market/chain-agents',
      { raw: true },
    );
    expect(result.total_on_chain).toBe(3);
  });
});

describe('ONV 错误与重试', () => {
  it('HTTP 错误抛 ONVError 并解析响应体', async () => {
    stubFetch(() =>
      Promise.resolve(
        jsonResponse(401, { code: 'UNAUTHORIZED', message: 'bad', detail: 'token expired' }),
      ),
    );
    const client = new ONV({ apiKey: 'k', retries: 0 });
    const promise = client.request('GET', '/api/strategies');
    await expect(promise).rejects.toBeInstanceOf(ONVError);
    await expect(promise).rejects.toMatchObject({
      statusCode: 401,
      code: 'UNAUTHORIZED',
      detail: 'token expired',
    });
  });

  it('响应体无 code 时按状态码映射（404 → NOT_FOUND）', async () => {
    stubFetch(() => Promise.resolve(jsonResponse(404, undefined)));
    const client = new ONV({ apiKey: 'k', retries: 0 });
    const promise = client.request('GET', '/api/strategies/999');
    await expect(promise).rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
  });

  it('非可重试 4xx 不重试', async () => {
    const fetchMock = stubFetch(() => Promise.resolve(jsonResponse(400, { message: 'bad request' })));
    const client = new ONV({ apiKey: 'k' }); // 默认 retries: 2
    await expect(client.request('GET', '/api/strategies')).rejects.toBeInstanceOf(ONVError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('网络错误自动重试后成功', async () => {
    const fetchMock = vi
      .fn<() => Promise<Response>>()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(jsonResponse(200, { code: 200, data: { ok: true }, message: 'ok' }));
    vi.stubGlobal('fetch', fetchMock);

    const client = new ONV({ apiKey: 'k', retries: 2, retryDelayMs: 1 });
    const result = await client.request<{ ok: boolean }>('GET', '/api/strategies');
    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('5xx 重试耗尽后抛出错误', async () => {
    const fetchMock = stubFetch(() => Promise.resolve(jsonResponse(500, { message: 'boom' })));
    const client = new ONV({ apiKey: 'k', retries: 2, retryDelayMs: 1 });
    await expect(client.request('GET', '/api/strategies')).rejects.toMatchObject({
      statusCode: 500,
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('429 会重试', async () => {
    const fetchMock = stubFetch(() =>
      Promise.resolve(jsonResponse(429, { message: 'rate limited' })),
    );
    const client = new ONV({ apiKey: 'k', retries: 1, retryDelayMs: 1 });
    await expect(client.request('GET', '/api/strategies')).rejects.toMatchObject({
      statusCode: 429,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('fetch 抛错转为 ONVError.networkError', async () => {
    stubFetch(() => Promise.reject(new TypeError('fetch failed')));
    const client = new ONV({ apiKey: 'k', retries: 0 });
    const promise = client.request('GET', '/api/strategies');
    await expect(promise).rejects.toBeInstanceOf(ONVError);
    await expect(promise).rejects.toMatchObject({ code: 'NETWORK_ERROR', statusCode: 0 });
  });

  it('请求超时报网络错误', async () => {
    // 模拟真实 fetch 对 AbortSignal 的行为：abort 时 reject
    stubFetch((_url, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted.', 'AbortError'));
        });
      }),
    );
    const client = new ONV({ apiKey: 'k', retries: 0, timeoutMs: 20 });
    const promise = client.request('GET', '/api/strategies');
    await expect(promise).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
  });
});
