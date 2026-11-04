// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { ONVError } from '../src/index.js';

describe('ONVError.fromHttpResponse', () => {
  it('从响应体解析 code/detail/action', () => {
    const err = ONVError.fromHttpResponse(400, {
      code: 'INVALID_REQUEST',
      message: 'bad',
      detail: 'symbol missing',
      action: 'provide a symbol',
    });
    expect(err).toBeInstanceOf(ONVError);
    expect(err.code).toBe('INVALID_REQUEST');
    expect(err.statusCode).toBe(400);
    expect(err.detail).toBe('symbol missing');
    expect(err.action).toBe('provide a symbol');
    expect(err.message).toBe('bad');
  });

  it('无响应体 code 时按状态码映射（404 → NOT_FOUND）', () => {
    const err = ONVError.fromHttpResponse(404, { message: '策略不存在' });
    expect(err.code).toBe('NOT_FOUND');
    expect(err.statusCode).toBe(404);
    expect(err.message).toBe('策略不存在');
  });

  it('常见状态码映射正确', () => {
    expect(ONVError.fromHttpResponse(401, undefined).code).toBe('UNAUTHORIZED');
    expect(ONVError.fromHttpResponse(403, undefined).code).toBe('FORBIDDEN');
    expect(ONVError.fromHttpResponse(429, undefined).code).toBe('RATE_LIMITED');
    expect(ONVError.fromHttpResponse(500, undefined).code).toBe('INTERNAL_ERROR');
    expect(ONVError.fromHttpResponse(503, undefined).code).toBe('SERVICE_UNAVAILABLE');
  });

  it('detail 为对象时序列化为字符串', () => {
    const err = ONVError.fromHttpResponse(400, { detail: { field: 'symbol' } });
    expect(err.detail).toBe(JSON.stringify({ field: 'symbol' }));
  });

  it('无响应体时回退到通用 message 与 HTTP_xxx code', () => {
    const err = ONVError.fromHttpResponse(418, undefined);
    expect(err.code).toBe('HTTP_418');
    expect(err.message).toContain('418');
    expect(err.detail).toBe('');
    expect(err.action).toBeUndefined();
  });

  it('数字 code 转为字符串', () => {
    const err = ONVError.fromHttpResponse(400, { code: 40001 });
    expect(err.code).toBe('40001');
  });

  it('响应体非对象时安全处理', () => {
    const err = ONVError.fromHttpResponse(500, 'internal error text');
    expect(err.code).toBe('INTERNAL_ERROR');
  });
});

describe('ONVError.networkError', () => {
  it('包装原始错误', () => {
    const err = ONVError.networkError(new TypeError('fetch failed'));
    expect(err.code).toBe('NETWORK_ERROR');
    expect(err.statusCode).toBe(0);
    expect(err.isNetworkError).toBe(true);
    expect(err.message).toContain('fetch failed');
  });

  it('处理非 Error 输入', () => {
    const err = ONVError.networkError('boom');
    expect(err.detail).toBe('boom');
  });
});

describe('ONVError 基本属性', () => {
  it('暴露 code/statusCode/detail/action 字段', () => {
    const err = new ONVError('msg', 'X', 409, 'detail', 'action');
    expect(err).toMatchObject({
      code: 'X',
      statusCode: 409,
      detail: 'detail',
      action: 'action',
    });
    expect(err.name).toBe('ONVError');
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('msg');
  });

  it('可选字段缺省', () => {
    const err = new ONVError('msg', 'X', 400);
    expect(err.detail).toBe('');
    expect(err.action).toBeUndefined();
    expect(err.isNetworkError).toBe(false);
  });
});
