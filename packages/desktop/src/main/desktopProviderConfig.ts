import { app } from "electron";
import { join } from "node:path";
import { ZCODE_ENV } from "@zcode/shared";
import { isMaeExternalSilenceEnabled } from "@zcode/shared/mae"; // mae: 外联静默——provider 目录本地化(#7)

export function resolveZCodeBuiltinProviderConfigFilePath(options?: {
  readonly appPath?: string;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly isPackaged?: boolean;
  readonly resourcesPath?: string;
}): string {
  const explicitPath = (options?.env ?? process.env)["ZCODE_BUILTIN_PROVIDER_CONFIG_FILE"]?.trim();
  if (explicitPath) return explicitPath;
  // mae: 默认外联静默——目录文件名换 mae 裁剪版(仅 API-key 型第三方),显式授权官方身份才回官方目录(#7)
  const maeCatalog = isMaeExternalSilenceEnabled(options?.env);
  if (options?.isPackaged ?? app.isPackaged) {
    return join(
      options?.resourcesPath ?? process.resourcesPath,
      "config/provider",
      maeCatalog ? "mae-builtin.json" : "zcode-builtin.json",
    );
  }
  // 开发态没有 resources 复制步骤，必须与构建注入的产品环境读取同一份源文件。
  const filename = ZCODE_ENV === "production" ? "zcode-builtin.json" : "zcode-builtin.test.json";
  return join(
    options?.appPath ?? app.getAppPath(),
    "../../config/provider",
    maeCatalog ? filename.replace("zcode-builtin", "mae-builtin") : filename,
  );
}
