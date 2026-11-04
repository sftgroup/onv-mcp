// SPDX-License-Identifier: Apache-2.0
import { defineConfig } from 'tsup';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string;
};

export default defineConfig({
  entry: ['src/server.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  splitting: false,
  treeshake: true,
  target: 'node18',
  outDir: 'dist',
  // `@onvcodes/sdk` 是仓内 `file:` 依赖，发布到 npm 时不能作为运行时依赖（消费者装不到）
  // ⇒ 打包进产物，包内不再引用它
  noExternal: ['@onvcodes/sdk'],
  // 版本号以 package.json 为唯一事实源（serverInfo 不再硬编码）
  define: { __ONV_MCP_VERSION__: JSON.stringify(pkg.version) },
});
