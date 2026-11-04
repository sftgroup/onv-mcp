// SPDX-License-Identifier: Apache-2.0
/**
 * 回测资源 —— `/api/v1/backtest/run`、`/api/backtest/*`。
 */
import type {
  AnalysisResult,
  BacktestAnalyzePayload,
  BacktestJob,
  BacktestParams,
  BacktestResults,
  RequestContext,
} from '../types.js';

export class BacktestResource {
  constructor(private readonly client: RequestContext) {}

  /** POST /api/backtest/run —— 提交回测任务（body: strategy_id | strategy_code + symbol/timeframe 等）。
   *  8.5b B3：由退役的 /api/v1/backtest/run 迁移至现行端点（strategy_id 走策略所有权校验，
   *  strategy_code 供 MCP/API Key 直跑）。响应中的 `jobId` / `job_id` 统一归一化为 `jobId`。 */
  async run(params: BacktestParams): Promise<BacktestJob> {
    const body: Record<string, unknown> = {
      symbol: params.symbol,
      chain: params.chain,
      timeframe: params.timeframe,
      start_date: params.start_date,
      end_date: params.end_date,
      initial_capital: params.initial_capital ?? params.capital,
      params: params.params,
    };
    if (params.strategy_id != null) body.strategy_id = params.strategy_id;
    if (params.strategy_code) body.strategy_code = params.strategy_code;
    else if (params.code) body.strategy_code = params.code;
    const job = await this.client.request<BacktestJob>('POST', '/api/backtest/run', {
      body,
    });
    return normalizeJobId(job);
  }

  /** GET /api/backtest/:jobId —— 查询回测任务状态。 */
  async status(jobId: string): Promise<BacktestJob> {
    const job = await this.client.request<BacktestJob>(
      'GET',
      `/api/backtest/${encodeURIComponent(jobId)}`,
    );
    return normalizeJobId(job);
  }

  /** GET /api/backtest/runs/:runId —— 获取回测运行结果。 */
  results(runId: string): Promise<BacktestResults> {
    return this.client.request<BacktestResults>(
      'GET',
      `/api/backtest/runs/${encodeURIComponent(runId)}`,
    );
  }

  /** POST /api/backtest/ai-analyze —— 对回测结果做 AI 分析。 */
  aiAnalyze(payload: BacktestAnalyzePayload): Promise<AnalysisResult> {
    return this.client.request<AnalysisResult>('POST', '/api/backtest/ai-analyze', {
      body: payload,
    });
  }
}

/** 确保 job 对象上存在 `jobId`（兼容后端返回 `job_id` 或 `jobId` 两种命名）。 */
export function normalizeJobId(job: BacktestJob): BacktestJob {
  if (!job || typeof job !== 'object') return job;
  if (job.jobId === undefined && job.job_id !== undefined) {
    return { ...job, jobId: job.job_id };
  }
  return job;
}
