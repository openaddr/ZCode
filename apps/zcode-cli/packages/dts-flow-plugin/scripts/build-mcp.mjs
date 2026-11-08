// mae: dts-flow 插件构建(esbuild 打包 @mae/dts-flow 源码进单文件 ESM,供宿主 plugin-host 动态 import)
import { chmod } from "node:fs/promises";
import { resolve } from "node:path";
import { build } from "esbuild";

const packageRoot = resolve(import.meta.dirname, "..");
const serverOutputPath = resolve(packageRoot, "dist", "mcp", "server.js");

await build({
  bundle: true,
  entryPoints: [resolve(packageRoot, "src", "mcp", "server.ts")],
  format: "esm",
  legalComments: "none",
  outfile: serverOutputPath,
  platform: "node",
  target: "node24",
});

await chmod(serverOutputPath, 0o755);
