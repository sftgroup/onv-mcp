// SPDX-License-Identifier: Apache-2.0
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ONV } from '../src/index.js';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function stubFetch(impl: (url: string, init?: RequestInit) => Promise<Response>) {
  const mock = vi.fn(impl);
  vi.stubGlobal('fetch', mock);
  return mock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('agents 资源', () => {
  const client = new ONV({ apiKey: 'k' });

  it('list: 解包信封 { data: { items } } 返回 Agent[]', async () => {
    stubFetch(() =>
      Promise.resolve(
        jsonResponse(200, {
          code: 200,
          data: {
            items: [
              { id: 1, name: 'A', strategy_category: 'dex' },
              { id: 2, name: 'B', strategy_category: 'defi' },
            ],
            pagination: { total: 2 },
          },
          message: 'ok',
        }),
      ),
    );
    const agents = await client.agents.list();
    expect(agents).toHaveLength(2);
    expect(agents[0]).toMatchObject({ id: 1, name: 'A' });
  });

  it('list: 兼容 { strategies: [...] } 形态', async () => {
    stubFetch(() => Promise.resolve(jsonResponse(200, { strategies: [{ id: 3, name: 'C' }] })));
    const agents = await client.agents.list();
    expect(agents).toHaveLength(1);
    expect(agents[0].name).toBe('C');
  });

  it('list: 兼容纯数组形态', async () => {
    stubFetch(() => Promise.resolve(jsonResponse(200, [{ id: 4, name: 'D' }])));
    const agents = await client.agents.list();
    expect(agents).toHaveLength(1);
    expect(agents[0].id).toBe(4);
  });

  it('list: 序列化 page/pageSize/activeOnly 查询参数', async () => {
    const fetchMock = stubFetch(() =>
      Promise.resolve(jsonResponse(200, { code: 200, data: { items: [] }, message: 'ok' })),
    );
    await client.agents.list({ page: 2, pageSize: 50, activeOnly: true });
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://onv.codes/api/strategies?page=2&pageSize=50&activeOnly=true',
    );
  });

  it('get: GET /api/strategies/:id', async () => {
    const fetchMock = stubFetch(() =>
      Promise.resolve(jsonResponse(200, { code: 200, data: { id: 7, name: 'X' }, message: 'ok' })),
    );
    const agent = await client.agents.get(7);
    expect(agent).toMatchObject({ id: 7, name: 'X' });
    expect(fetchMock.mock.calls[0][0]).toBe('https://onv.codes/api/strategies/7');
    expect(fetchMock.mock.calls[0][1]?.method).toBe('GET');
  });

  it('create: POST /api/strategies 并发送请求体', async () => {
    const fetchMock = stubFetch(() =>
      Promise.resolve(jsonResponse(200, { code: 200, data: { id: 9, name: 'New' }, message: 'ok' })),
    );
    const agent = await client.agents.create({ name: 'New', strategy_category: 'dex' });
    expect(agent.id).toBe(9);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://onv.codes/api/strategies');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(init?.body as string)).toEqual({
      name: 'New',
      strategy_category: 'dex',
    });
  });

  it('update: PATCH /api/strategies/:id', async () => {
    const fetchMock = stubFetch(() =>
      Promise.resolve(
        jsonResponse(200, { code: 200, data: { id: 9, status: 'published' }, message: 'ok' }),
      ),
    );
    await client.agents.update(9, { status: 'published' });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://onv.codes/api/strategies/9');
    expect(init?.method).toBe('PATCH');
    expect(JSON.parse(init?.body as string)).toEqual({ status: 'published' });
  });

  it('delete: DELETE /api/strategies/:id', async () => {
    const fetchMock = stubFetch(() =>
      Promise.resolve(jsonResponse(200, { code: 200, data: { success: true }, message: 'ok' })),
    );
    const result = await client.agents.delete(9);
    expect(result).toEqual({ success: true });
    expect(fetchMock.mock.calls[0][0]).toBe('https://onv.codes/api/strategies/9');
    expect(fetchMock.mock.calls[0][1]?.method).toBe('DELETE');
  });

  it('chainList: 保留 total_on_chain', async () => {
    stubFetch(() =>
      Promise.resolve(
        jsonResponse(200, {
          code: 200,
          data: [{ id: 1, name: 'OnChain A', metadata: { category: 'quant-trading' } }],
          total: 1,
          total_on_chain: 42,
          message: 'ok',
        }),
      ),
    );
    const list = await client.agents.chainList();
    expect(list.agents).toHaveLength(1);
    expect(list.total_on_chain).toBe(42);
    expect(list.agents[0].name).toBe('OnChain A');
  });

  it('chainList: 兼容纯数组形态', async () => {
    stubFetch(() => Promise.resolve(jsonResponse(200, [{ id: 5, name: 'Solo' }])));
    const list = await client.agents.chainList();
    expect(list.agents).toHaveLength(1);
    expect(list.total).toBe(1);
  });
});
