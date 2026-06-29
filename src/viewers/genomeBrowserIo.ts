/**
 * Builds a GenomeBrowserIO backed by the JupyterLab SmartsBioClient. The widget
 * runs in the notebook page's JS context and holds the bearer token, so it calls
 * the gateway (/v1/graph/*, presigned download URLs) directly — no bridge needed.
 *
 * Index generation goes through the gateway's /v1/files/index endpoint.
 */

import type { GenomeBrowserIO } from '@smartsbio/ui/genome-browser';
import type { SmartsBioClient } from '../api/SmartsBioClient';

const DEFAULT_REF_BASE = 'https://smartsbio-references.s3.amazonaws.com/hg38';

function unwrap<T>(res: unknown): T {
  const r = res as { data?: T } | T;
  return (r as { data?: T })?.data ?? (r as T);
}

export function buildGenomeBrowserIo(
  client: SmartsBioClient,
  workspaceId: string,
  referenceBaseUrl: string = DEFAULT_REF_BASE,
): GenomeBrowserIO {
  return {
    referenceBaseUrl,

    async graphGenes(chromosome, start, end) {
      try {
        return unwrap(await client.getGraphGenes(chromosome, start, end)) ?? [];
      } catch {
        return [];
      }
    },

    async graphVariants(chromosome, start, end) {
      try {
        return unwrap(await client.getGraphVariants(chromosome, start, end)) ?? [];
      } catch {
        return [];
      }
    },

    async graphNetwork(symbol) {
      try {
        const res = await client.getGraphNetwork({ entity: symbol, type: 'gene', depth: 1, limit: 30 });
        const d = unwrap<{ nodes?: unknown[]; centerNode?: { id?: string } }>(res);
        return { nodes: (d?.nodes as never[]) ?? [], centerId: d?.centerNode?.id };
      } catch {
        return { nodes: [] };
      }
    },

    async geneBySymbol(symbol) {
      try {
        const b = (await client.getEntityDetail('gene', symbol)) as {
          data?: { gene?: unknown };
          gene?: unknown;
        };
        return (b?.data?.gene ?? b?.gene ?? (b as { data?: unknown })?.data ?? undefined) as never;
      } catch {
        return undefined;
      }
    },

    async signKeys(keys) {
      const out: Record<string, string> = {};
      await Promise.all(
        keys.map(async (k) => {
          try {
            out[k] = await client.getFileDownloadUrl(workspaceId, k);
          } catch {
            /* object may not exist (e.g. a probed index candidate) — skip it */
          }
        }),
      );
      return out;
    },

    startIndex(fileKey, kind) {
      return client.startIndexJob(workspaceId, fileKey, kind);
    },

    pollIndex(processId) {
      return client.getIndexStatus(processId);
    },
  };
}
