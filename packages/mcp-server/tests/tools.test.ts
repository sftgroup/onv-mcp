// SPDX-License-Identifier: Apache-2.0
/**
 * 薄代理工具注册测试 —— 不依赖真实网络（mock fetch）。
 */
import { describe, expect, it } from 'vitest';
import { jsonSchemaToZod, safeRun } from '../src/tools.js';

describe('jsonSchemaToZod（JSON Schema → zod）', () => {
  it('字符串/数字/布尔/数组/对象映射正确', () => {
    const shape = jsonSchemaToZod({
      type: 'object',
      properties: {
        symbol: { type: 'string', description: '标的' },
        limit: { type: 'number', description: '数量' },
        active: { type: 'boolean', description: '开关' },
        tags: { type: 'array', description: '标签' },
        cfg: { type: 'object', description: '配置' },
      },
      required: ['symbol'],
    });
    expect(Object.keys(shape).sort()).toEqual(['active', 'cfg', 'limit', 'symbol', 'tags']);
    expect(shape.symbol.isOptional()).toBe(false);
    expect(shape.limit.isOptional()).toBe(true);
    expect(shape.active.isOptional()).toBe(true);
    expect(shape.tags.isOptional()).toBe(true);
    expect(shape.cfg.isOptional()).toBe(true);
  });

  it('空 schema / undefined 返回空 shape', () => {
    expect(jsonSchemaToZod(undefined)).toEqual({});
    expect(jsonSchemaToZod({ type: 'object' })).toEqual({});
  });
});

describe('safeRun 错误处理', () => {
  it('成功结果被序列化为 JSON 文本且无 isError', async () => {
    const result = await safeRun(async () => ({ ok: true, n: 42 }));
    expect(result.isError).toBeUndefined();
    expect(JSON.parse(result.content[0].text)).toEqual({ ok: true, n: 42 });
  });

  it('undefined 结果返回 OK 文本', async () => {
    const result = await safeRun(() => undefined);
    expect(result.content[0].text).toBe('OK');
  });

  it('意外错误被捕获为 isError=true（PROXY_ERROR）', async () => {
    const result = await safeRun(() => {
      throw new Error('boom');
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('PROXY_ERROR');
    expect(result.content[0].text).toContain('boom');
  });
});
