/**
 * mae 全局验收(#34):官方域名 denylist 与启动请求清单纯逻辑。
 *
 * 口径与 specs/mae/README.md「全局验收」一致:启动期对官方域(z.ai 系与
 * bigmodel.cn 系,含 zcode.z.ai / api.z.ai / cdn-zcode.z.ai)零请求。
 * 匹配按 hostname 的 label 后缀(z.ai 命中 zcode.z.ai,但不会命中 notz.ai)。
 */
export const MAE_OFFICIAL_DOMAIN_DENYLIST: readonly string[] = [
  "zcode.z.ai",
  "bigmodel.cn",
  "z.ai",
  "api.z.ai",
  "cdn-zcode.z.ai",
];

export interface MaeOfficialDomainHit {
  domain: string;
  hostname: string;
}

export function isMaeOfficialDeniedHostname(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase().replace(/\.+$/u, "");
  if (!normalized) {
    return false;
  }
  return MAE_OFFICIAL_DOMAIN_DENYLIST.some(
    (domain) => normalized === domain || normalized.endsWith(`.${domain}`),
  );
}

export function findMaeOfficialDomainHits(
  hostnames: readonly string[],
): MaeOfficialDomainHit[] {
  const hitsByHostname = new Map<string, MaeOfficialDomainHit>();
  for (const hostname of hostnames) {
    const normalized = hostname.trim().toLowerCase().replace(/\.+$/u, "");
    if (!normalized || hitsByHostname.has(normalized)) {
      continue;
    }
    const domain = MAE_OFFICIAL_DOMAIN_DENYLIST.find(
      (candidate) => normalized === candidate || normalized.endsWith(`.${candidate}`),
    );
    if (domain) {
      hitsByHostname.set(normalized, { domain, hostname: normalized });
    }
  }
  return [...hitsByHostname.values()].sort((left, right) =>
    left.hostname.localeCompare(right.hostname),
  );
}

/** 抓包代理记录的最小子集(e2e-network-capture 的 E2ENetworkCaptureRecord 兼容形状)。 */
export interface MaeStartupRequestRecord {
  host: string;
  method: string;
  protocol: string;
  status: string;
  url: string;
}

export function collectStartupRequestHostnames(
  records: readonly MaeStartupRequestRecord[],
): string[] {
  return records.map((record) => record.host);
}

export function summarizeStartupRequestsForArtifact(
  records: readonly MaeStartupRequestRecord[],
): MaeStartupRequestRecord[] {
  return [...records]
    .map((record) => ({
      host: record.host,
      method: record.method,
      protocol: record.protocol,
      status: record.status,
      url: record.url,
    }))
    .sort((left, right) => left.url.localeCompare(right.url));
}
