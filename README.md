# onv-mcp

[![CI](https://github.com/sftgroup/onv-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/sftgroup/onv-mcp/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![npm](https://img.shields.io/npm/v/@onvcodes/mcp-server.svg)](https://www.npmjs.com/package/@onvcodes/mcp-server)

ONV 平台的 [MCP (Model Context Protocol)](https://modelcontextprotocol.io) Server 与官方 SDK。
把平台的行情数据、公开策略、回测、订阅与 AI 生成能力暴露为 MCP 工具，供 **Claude Desktop / Cursor / Cline** 等 AI 客户端调用。

> **本仓是只读发布镜像。** 日常开发在内部主仓进行，每次发版由主仓导出脚本推送。
> 欢迎提 issue 反馈问题，但**不接受改动业务逻辑的 PR**（见 [CONTRIBUTING.md](CONTRIBUTING.md)）。

## 内容

| 路径 | npm 包 | 说明 |
|---|---|---|
| [`packages/mcp-server`](packages/mcp-server) | `@onvcodes/mcp-server` | MCP Server，薄代理平台工具（运行时动态发现，不在本地硬编码工具定义） |
| [`packages/sdk-ts`](packages/sdk-ts) | `@onvcodes/sdk` | 平台 REST API 的 TypeScript 客户端 SDK |

**本仓不含**：策略代码、实盘执行、交易所适配、风控与数据采集。这些属于闭源部分。

## 快速开始

### Claude Desktop / Cursor（stdio）

```json
{
  "mcpServers": {
    "onv": {
      "command": "npx",
      "args": ["-y", "@onvcodes/mcp-server"],
      "env": {
        "ONV_API_KEY": "<你的 ONV API Key>"
      }
    }
  }
}
```

### 远程接入（Streamable HTTP）

```
https://onv.codes/mcp
```

支持三种凭证：`Authorization: Bearer <JWT>`、`X-Api-Key: <key>`，或匿名（仅公开工具）。

- 接入说明：<https://onv.codes/mcp-setup>
- 接口文档：<https://onv.codes/docs/mcp>

## 环境变量

| 变量 | 必填 | 说明 |
|---|---|---|
| `ONV_API_KEY` | 是（除纯匿名外） | 平台 API Key，以 `X-Api-Key` 下发 |
| `ONV_BASE_URL` | 否 | 平台根地址，默认 `https://onv.codes` |
| `ONV_OAUTH_TOKEN` | 否 | OAuth 2.1 access token；存在时以 `Bearer` 下发 |

## 本地开发

```bash
npm install          # workspaces 一次装齐
npm run build        # 两个包一起构建
npm run typecheck
npm test
```

## 许可证

[Apache-2.0](LICENSE)。`onv` 名称与 Logo 不随代码授权，见 [TRADEMARK.md](TRADEMARK.md)。
