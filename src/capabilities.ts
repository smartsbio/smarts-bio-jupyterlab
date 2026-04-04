// JupyterLab implementation of SmartsBioCapabilities.
// Since ReactWidgets run in the same JS context (no iframe/postMessage boundary),
// all methods are direct calls to SmartsBioClient — no bridge needed.
import type { SmartsBioCapabilities, FileItem } from '@smartsbio/ui';
import { SmartsBioClient } from './api/SmartsBioClient';
import { AuthProvider } from './auth/AuthProvider';
import { CellInserter } from './notebook/CellInserter';

export interface JupyterCallbacks {
  openViewer(fileKey: string, fileName: string, ext: string): void;
  analyzeFile(fileKey: string, fileName: string): void;
}

export function createJupyterCapabilities(
  client: SmartsBioClient,
  auth: AuthProvider,
  cellInserter: CellInserter,
  callbacks: JupyterCallbacks,
): SmartsBioCapabilities {
  return {
    // ── Chat ──────────────────────────────────────────────────────────────────
    sendMessage: async (text, conversationId, workspaceId, context, dispatch, signal, _mode) => {
      const messageId = crypto.randomUUID();
      dispatch({ type: 'STREAM_START', messageId });
      try {
        const stream = client.streamQuery(text, conversationId, workspaceId, context, signal);
        for await (const chunk of stream) {
          if (signal.aborted) break;
          if (chunk.type === 'text') {
            dispatch({ type: 'STREAM_CHUNK', messageId, content: chunk.content ?? '' });
          } else if (chunk.type === 'tool_use') {
            dispatch({ type: 'TOOL_USE', toolName: chunk.toolName ?? '' });
          } else if (chunk.type === 'error') {
            dispatch({ type: 'STREAM_ERROR', messageId, error: chunk.error ?? chunk.content ?? 'Unknown error' });
            return;
          } else if (chunk.type === 'done') {
            break;
          }
        }
        dispatch({ type: 'STREAM_END', messageId });
      } catch (err: unknown) {
        const name = err instanceof Error ? err.name : '';
        const message = err instanceof Error ? err.message : String(err);
        if (name === 'AbortError') {
          dispatch({ type: 'STREAM_END', messageId });
        } else {
          dispatch({ type: 'STREAM_ERROR', messageId, error: message });
        }
      }
    },

    fetchFiles: async (workspaceId, path) => {
      const items = await client.getFiles(workspaceId, path || undefined);
      return items.map((item): FileItem => ({
        name: item.name,
        path: path ? `${path}/${item.name}` : item.name,
        isDirectory: item.type === 'folder',
        source: 'remote',
        key: item.key,
      })).sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
    },

    getCatalog: async () => {
      const catalog = await client.getCatalog();
      return {
        tools: catalog.tools.map(t => ({ ...t, type: 'tool' as const })),
        pipelines: catalog.pipelines.map(p => ({ ...p, type: 'pipeline' as const })),
      };
    },

    confirmScript: async (threadId, workspaceId, sessionId, dispatch, signal) => {
      const messageId = crypto.randomUUID();
      dispatch({ type: 'STREAM_START', messageId });
      try {
        const stream = client.streamConfirmScript(threadId, workspaceId, sessionId, signal);
        for await (const chunk of stream) {
          if (signal.aborted) break;
          if (chunk.type === 'text') {
            dispatch({ type: 'STREAM_CHUNK', messageId, content: chunk.content ?? '' });
          } else if (chunk.type === 'tool_use') {
            dispatch({ type: 'TOOL_USE', toolName: chunk.toolName ?? '' });
          } else if (chunk.type === 'error') {
            dispatch({ type: 'STREAM_ERROR', messageId, error: chunk.error ?? chunk.content ?? 'Unknown error' });
            return;
          } else if (chunk.type === 'done') {
            break;
          }
        }
        dispatch({ type: 'STREAM_END', messageId });
      } catch (err: unknown) {
        const name = err instanceof Error ? err.name : '';
        const message = err instanceof Error ? err.message : String(err);
        if (name === 'AbortError') {
          dispatch({ type: 'STREAM_END', messageId });
        } else {
          dispatch({ type: 'STREAM_ERROR', messageId, error: message });
        }
      }
    },

    // ── Files panel ───────────────────────────────────────────────────────────
    listFiles: (workspaceId, path) => client.getFiles(workspaceId, path ?? undefined),

    uploadFile: async (file, workspaceId, _onProgress, _path) => {
      await client.uploadFile(file, workspaceId);
    },

    createFolder: async (workspaceId, folderPath) => {
      const lastSlash = folderPath.lastIndexOf('/');
      const name = lastSlash >= 0 ? folderPath.slice(lastSlash + 1) : folderPath;
      const parentPath = lastSlash >= 0 ? folderPath.slice(0, lastSlash) : undefined;
      await client.createFolder(workspaceId, name, parentPath);
    },

    deleteFile: (workspaceId, fileKey) => client.deleteFile(workspaceId, fileKey),

    renameFile: (workspaceId, fileKey, newName) => client.renameFile(workspaceId, fileKey, newName),

    // Return a blob:// URL instead of the S3 presigned URL.
    // S3 URLs are cross-origin so <a download> is ignored by the browser (it
    // navigates instead). Fetching via the API proxy avoids CORS, and blob://
    // URLs are same-origin so the download attribute is always respected.
    getFileDownloadUrl: async (workspaceId, fileKey) => {
      const isBinary = /\.(bam|cram|bcf|bw|bigwig)$/i.test(fileKey);
      if (isBinary) {
        const b64 = await client.getFileContent(fileKey, workspaceId, true);
        const binary = atob(b64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return URL.createObjectURL(new Blob([bytes]));
      }
      const text = await client.getFileContent(fileKey, workspaceId, false);
      return URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    },

    // ── Processes panel ───────────────────────────────────────────────────────
    getJobs: (workspaceId) => client.getJobs(workspaceId),

    cancelJob: (jobId, workspaceId) => client.cancelJob(jobId, workspaceId),

    // ── Platform actions ──────────────────────────────────────────────────────
    onSignIn: () => { void auth.signIn(); },

    onInsertCode: (code) => cellInserter.insertCode(code),

    onOpenViewer: (fileKey, fileName, ext) => callbacks.openViewer(fileKey, fileName, ext),

    onAnalyzeFile: (fileKey, fileName) => callbacks.analyzeFile(fileKey, fileName),

    onDownloadFile: (blobUrl, fileName) => {
      // getFileDownloadUrl already returns a blob:// URL, so download works directly.
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    },
  };
}
