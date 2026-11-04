# 发版与发布

本仓由内部主仓导出，**不要直接在本仓修改源码**。

## 维护者：从主仓导出

```bash
# 在内部主仓根目录
scripts/public-mcp/export.sh /tmp/onv-mcp-public

# 校验产物可独立构建
cd /tmp/onv-mcp-public
npm install --no-audit --no-fund
npm run typecheck
npm test
npm run build

# 推送到公开仓（首次需 git init）
git init -b main
git add -A
git commit -s -m "chore: sync from internal main (<日期>)"
git remote add origin https://github.com/sftgroup/onv-mcp.git
git push -u origin main
```

导出脚本会做四类机械化改写：`@onv/sdk` → `@onvcodes/sdk`、`file:` 依赖改为 workspace `*`、
补 `repository` / `homepage`、补 SPDX 文件头。

## 发布 npm 包

```bash
npm login                    # 需要 @onvcodes 作用域发布权限
npm run build
npm publish --workspace packages/mcp-server
npm publish --workspace packages/sdk-ts
```

版本号以 `packages/*/package.json` 为准；发布前请同步以下三处：

1. `packages/mcp-server/package.json` 的 `version`
2. `packages/mcp-server/server.json` 的 `version` 与 `packages[].version`
3. 公开仓 `main` 分支的 tag（`git tag v<version>`）

## 发布 MCP Registry

`server.json` 已带 `repository` 指向本仓，且 `name` 为 `codes.onv/onv-mcp`（命名空间由 `onv.codes`
域名的 DNS TXT 记录证明所有权）。发布命令：

```bash
mcp-publisher validate
mcp-publisher login dns --domain onv.codes --private-key <key>
mcp-publisher publish
```

> Registry 条目**不可删除、版本不可变**，发版前请确认版本号最终。

## CI

`.github/workflows/ci.yml` 在 Node 20 / 22 上执行 `install → typecheck → test → build`。
任何一步失败即视为不可发布。
