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

describe('backtest 资源', () => {
  const client = new ONV({ apiKey: 'k' });

  it('run: POST /api/backtest/run（strategy_code 别名 code），响应 job_id 归一化为 jobId', async () => {
    const fetchMock = stubFetch(() =>
      Promise.resolve(
        jsonResponse(202, {
          code: 202,
          data: { job_id: 'job-abc', status: 'running', estimated_seconds: 30 },
          message: 'ok',
        }),
      ),
    );
    const job = await client.backtest.run({
      code: 'def foo(): pass',
      symbol: 'BTC/USDC',
      timeframe: '1H',
      capital: 10000,
    });

    expect(job).toMatchObject({ jobId: 'job-abc', job_id: 'job-abc', status: 'running' });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://onv.codes/api/backtest/run');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(init?.body as string)).toEqual({
      strategy_code: 'def foo(): pass',
      symbol: 'BTC/USDC',
      timeframe: '1H',
      initial_capital: 10000,
    });
  });

  it('run: strategy_id 与 strategy_code 同传时同时透传', async () => {
    const fetchMock = stubFetch(() =>
      Promise.resolve(jsonResponse(202, { code: 202, data: { job_id: 'job-abc' }, message: 'ok' })),
    );
    await client.backtest.run({ strategy_id: 7, code: 'x', symbol: 'ETH/USDC' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://onv.codes/api/backtest/run');
    expect(JSON.parse(init?.body as string)).toEqual({
      strategy_id: 7,
      strategy_code: 'x',
      symbol: 'ETH/USDC',
    });
  });

  it('run: 响应直接为 jobId 时同样兼容', async () => {
    stubFetch(() =>
      Promise.resolve(jsonResponse(202, { code: 202, data: { jobId: 'job-xyz', status: 'running' }, message: 'ok' })),
    );
    const job = await client.backtest.run({ symbol: 'ETH/USDC' });
    expect(job.jobId).toBe('job-xyz');
  });

  it('status: GET /api/backtest/:jobId', async () => {
    const fetchMock = stubFetch(() =>
      Promise.resolve(
        jsonResponse(200, {
          code: 200,
          data: { job_id: 'job-abc', status: 'completed', progress: 100 },
          message: 'ok',
        }),
      ),
    );
    const job = await client.backtest.status('job-abc');
    expect(job).toMatchObject({ status: 'completed', progress: 100 });
    expect(fetchMock.mock.calls[0][0]).toBe('https://onv.codes/api/backtest/job-abc');
  });

  it('status: 对 jobId 做 URL 编码', async () => {
    const fetchMock = stubFetch(() =>
      Promise.resolve(jsonResponse(200, { code: 200, data: { job_id: 'j/1', status: 'running' }, message: 'ok' })),
    );
    await client.backtest.status('j/1');
    expect(fetchMock.mock.calls[0][0]).toBe('https://onv.codes/api/backtest/j%2F1');
  });

  it('results: GET /api/backtest/runs/:runId', async () => {
    const fetchMock = stubFetch(() =>
      Promise.resolve(
        jsonResponse(200, {
          code: 200,
          data: { id: 42, status: 'completed', total_return: 12.5 },
          message: 'ok',
        }),
      ),
    );
    const res = await client.backtest.results('42');
    expect(res).toMatchObject({ id: 42, total_return: 12.5 });
    expect(fetchMock.mock.calls[0][0]).toBe('https://onv.codes/api/backtest/runs/42');
  });

  it('aiAnalyze: POST /api/backtest/ai-analyze', async () => {
    const fetchMock = stubFetch(() =>
      Promise.resolve(
        jsonResponse(200, {
          code: 200,
          data: { analysis: '建议止损设置到 3%', mode: 'llm' },
          message: 'ok',
        }),
      ),
    );
    const res = await client.backtest.aiAnalyze({ job_id: 'job-abc' });
    expect(res.analysis).toContain('3%');
    expect(fetchMock.mock.calls[0][0]).toBe('https://onv.codes/api/backtest/ai-analyze');
    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toEqual({ job_id: 'job-abc' });
  });
});
