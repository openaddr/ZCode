import { stat } from "node:fs/promises";

import {
  type DtsFlowService,
  type DtsFlowServiceDeps,
  KNOWN_DEPENDENCIES,
} from "../app/service.js";
import type { DtsFlowConfig } from "../domain/config.js";
import { isActionable } from "../domain/dts.js";
import { probeDependency } from "../domain/depsProbe.js";
import { type ResolvedModuleBindings, resolveModuleBindings } from "../domain/moduleBindings.js";
import { type DtsGateway, createDtsGateway, tokenFileReader } from "./dtsGateway.js";
import { fsProbeOptions } from "./fsProbe.js";
import {
  createIssueLedger,
  listIssueLedgers,
  loadIssueLedger,
  readIssueEvents,
} from "./ledgerStore.js";
import { fetchCloudModuleBindings, loadLocalModuleBindings, localBindingsPath } from "./moduleBindingsStore.js";

/** 服务工厂(adapters 组合根):把 domain 纯逻辑与 IO 实现接成 DtsFlowService 实例。 */
export function createDtsFlowService(config: DtsFlowConfig, deps: DtsFlowServiceDeps): DtsFlowService {
  const now = deps.now ?? (() => new Date());
  let cachedBindings: ResolvedModuleBindings | null = null;
  let gateway: DtsGateway | null = null;
  const getGateway = (): DtsGateway => {
    if (gateway === null) {
      gateway = createDtsGateway(
        { dtsGatewayUrl: config.dtsGatewayUrl, dtsTokenPath: config.dtsTokenPath, mock: config.mock },
        { fetch: deps.fetch, readToken: tokenFileReader(config.dtsTokenPath) },
      );
    }
    return gateway;
  };

  return {
    config,
    async configSummary() {
      const tokenPresent = await stat(config.dtsTokenPath)
        .then(() => true)
        .catch(() => false);
      return {
        dataDir: config.dataDir,
        binDir: config.binDir,
        employeeId: config.employeeId,
        cloudBaseUrl: config.cloudBaseUrl,
        dtsGatewayUrl: config.dtsGatewayUrl,
        dtsTokenPath: config.dtsTokenPath,
        dtsTokenPresent: tokenPresent,
        httpPort: config.httpPort,
        mock: config.mock,
      };
    },
    async probeDependencies() {
      return Promise.all(
        KNOWN_DEPENDENCIES.map((name) =>
          probeDependency(name, fsProbeOptions(config.binDir, process.env["PATH"], process.platform)),
        ),
      );
    },
    async refreshModuleBindings() {
      cachedBindings = await resolveModuleBindings({
        cloud:
          config.cloudBaseUrl === null
            ? null
            : () => fetchCloudModuleBindings(config.cloudBaseUrl as string, { fetch: deps.fetch, now }),
        local: () => loadLocalModuleBindings(config.dataDir, { now }),
        localHintPath: localBindingsPath(config.dataDir),
      });
      return cachedBindings;
    },
    getCachedModuleBindings() {
      return cachedBindings;
    },
    async listTickets() {
      const tickets = await getGateway().listByOwner(config.employeeId);
      return tickets.map((ticket) => ({ ...ticket, actionable: isActionable(ticket.status) }));
    },
    async getTicket(ticket: string) {
      return getGateway().getTicket(config.employeeId, ticket);
    },
    async createIssue(input) {
      return createIssueLedger(config.dataDir, { ...input, now });
    },
    async listIssues() {
      return listIssueLedgers(config.dataDir);
    },
    async loadIssue(ticket: string) {
      return loadIssueLedger(config.dataDir, ticket);
    },
    async issueEvents(ticket: string, tail?: number) {
      return readIssueEvents(config.dataDir, ticket, tail);
    },
  };
}
