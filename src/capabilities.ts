// JupyterLab implementation of SmartsBioCapabilities.
// Since ReactWidgets run in the same JS context (no iframe/postMessage boundary),
// all methods are direct calls to SmartsBioClient — no bridge needed.
import type { SmartsBioCapabilities, FileItem } from '@smartsbio/ui';
import { SmartsBioClient } from './api/SmartsBioClient';
import { AuthProvider } from './auth/AuthProvider';
import { CellInserter } from './notebook/CellInserter';
import { InputDialog, showDialog, Dialog, Notification } from '@jupyterlab/apputils';
import { Widget } from '@lumino/widgets';

/**
 * Sentinel returned by the overridden window.prompt().
 * FilesPanel calls prompt() synchronously; we intercept this value
 * in renameFile/createFolder to show JupyterLab's async InputDialog instead.
 */
export const PROMPT_SENTINEL = '\x00jlab_prompt_pending';

/**
 * Override window.prompt to return a sentinel so FilesPanel's rename/create-folder
 * flows delegate to JupyterLab's native InputDialog (which is async-friendly).
 * Call this once before mounting the FilesPanel widget.
 */
export function overrideWindowPrompt(): void {
  (window as any).prompt = (_message?: string, _defaultValue?: string): string => {
    return PROMPT_SENTINEL;
  };
}

export interface JupyterCallbacks {
  openViewer(fileKey: string, fileName: string, ext: string): void;
  analyzeFile(fileKey: string, fileName: string): void;
  refreshFiles(): void;
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

    uploadFile: async (file, workspaceId, _onProgress, path) => {
      // In JupyterLab, webkitGetAsEntry returns null for directories so folder drag
      // falls back to the raw directory File object. Detect and notify the user.
      const hasExtension = file.name.includes('.');
      if (file.type === '' && !hasExtension) {
        Notification.warning(
          `Folder drag is not supported in JupyterLab. Use the Upload button to upload "${file.name}".`,
          { autoClose: 5000 },
        );
        return;
      }
      await client.uploadFile(file, workspaceId, path);
    },

    createFolder: async (workspaceId, folderPath) => {
      let resolvedPath = folderPath;
      if (folderPath.endsWith(PROMPT_SENTINEL)) {
        const parentPath = folderPath.slice(0, -PROMPT_SENTINEL.length).replace(/\/$/, '');
        const result = await InputDialog.getText({ title: 'New Folder', label: 'Folder name' });
        if (!result.button.accept || !result.value?.trim()) return;
        resolvedPath = parentPath ? `${parentPath}/${result.value.trim()}` : result.value.trim();
      }
      const lastSlash = resolvedPath.lastIndexOf('/');
      const name = lastSlash >= 0 ? resolvedPath.slice(lastSlash + 1) : resolvedPath;
      const parentPath = lastSlash >= 0 ? resolvedPath.slice(0, lastSlash) : undefined;
      await client.createFolder(workspaceId, name, parentPath);
    },

    deleteFile: (workspaceId, fileKey) => client.deleteFile(workspaceId, fileKey),

    renameFile: async (workspaceId, fileKey, newName) => {
      let actualName = newName;
      if (newName === PROMPT_SENTINEL) {
        const currentName = fileKey.split('/').pop() ?? '';
        const result = await InputDialog.getText({ title: 'Rename', text: currentName, label: 'New name' });
        if (!result.button.accept || !result.value?.trim()) return fileKey;
        actualName = result.value.trim();
      }
      return client.renameFile(workspaceId, fileKey, actualName);
    },

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

    onConfirmDelete: (message, detail) =>
      showDialog({
        title: message,
        body: detail ?? '',
        buttons: [Dialog.cancelButton(), Dialog.warnButton({ label: 'Delete' })],
      }).then(r => r.button.accept),

    onMoveFile: async (fileKey, fileName) => {
      const workspaceId = auth.profile?.defaultWorkspaceId ?? '';
      if (!workspaceId) return;

      const pathStack: string[] = [];

      while (true) {
        const currentPath = pathStack[pathStack.length - 1] ?? '';
        let subfolders: string[] = [];
        try {
          const items = await client.getFiles(workspaceId, currentPath || undefined);
          subfolders = items
            .filter(i => i.type === 'folder')
            .map(i => i.name.includes('/') ? i.name.split('/').pop()! : i.name);
        } catch { /* ignore */ }

        // Build a simple select widget
        const pathLabel = currentPath ? `/ ${currentPath}` : '/ (workspace root)';
        const selectId = `sb-move-select-${Date.now()}`;
        const options = [
          `<option value="__here__">📁 Move here  (${pathLabel})</option>`,
          ...(pathStack.length > 0 ? [`<option value="__back__">← Back</option>`] : []),
          ...subfolders.map(f => `<option value="__enter__:${f}">📂 ${f}</option>`),
        ].join('');

        const div = document.createElement('div');
        div.innerHTML = `
          <p style="margin:0 0 8px">Move <strong>${fileName}</strong> to:</p>
          <select id="${selectId}" style="width:100%;padding:4px;font-size:13px">${options}</select>
        `;
        const body = new Widget({ node: div });

        const result = await showDialog({
          title: `Move File — ${pathLabel}`,
          body,
          buttons: [Dialog.cancelButton(), Dialog.okButton({ label: 'Move' })],
          focusNodeSelector: `#${selectId}`,
        });

        if (!result.button.accept) return;

        const select = div.querySelector(`#${selectId}`) as HTMLSelectElement;
        const value = select?.value ?? '__here__';

        if (value === '__here__') {
          try {
            await client.moveFile(workspaceId, fileKey, currentPath);
            callbacks.refreshFiles();
          } catch (e) {
            await showDialog({ title: 'Move failed', body: String(e), buttons: [Dialog.okButton()] });
          }
          return;
        } else if (value === '__back__') {
          pathStack.pop();
        } else if (value.startsWith('__enter__:')) {
          const folderName = value.slice('__enter__:'.length);
          pathStack.push(currentPath ? `${currentPath}/${folderName}` : folderName);
        }
      }
    },

    onNewFileRequest: async (folderPath) => {
      const workspaceId = auth.profile?.defaultWorkspaceId ?? '';
      if (!workspaceId) return;

      const FILE_TYPES: { label: string; ext: string; template: string }[] = [
        { label: 'FASTA sequence (.fasta)', ext: 'fasta', template: '>sequence_name\nACGTACGT\n' },
        { label: 'FASTA sequence (.fa)',    ext: 'fa',    template: '>sequence_name\nACGTACGT\n' },
        { label: 'FASTQ reads (.fastq)',    ext: 'fastq', template: '@read_name\nACGTACGT\n+\nIIIIIIII\n' },
        { label: 'VCF variant (.vcf)',      ext: 'vcf',   template: '##fileformat=VCFv4.2\n#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO\n' },
        { label: 'PDB structure (.pdb)',    ext: 'pdb',   template: 'REMARK  Created with smarts.bio\n' },
        { label: 'SDF molecule (.sdf)',     ext: 'sdf',    template: '\n  smarts.bio\n\n  0  0  0  0  0  0            999 V2000\nM  END\n$$$$\n' },
        { label: 'MOL molecule (.mol)',     ext: 'mol',    template: '\n  smarts.bio\n\n  0  0  0  0  0  0            999 V2000\nM  END\n' },
        { label: 'SMILES (.smi)',           ext: 'smi',    template: '' },
        { label: 'SMILES (.smiles)',        ext: 'smiles', template: '' },
        { label: 'XYZ coordinates (.xyz)',  ext: 'xyz',    template: '0\n\n' },
        { label: 'Tripos MOL2 (.mol2)',     ext: 'mol2',   template: '@<TRIPOS>MOLECULE\n\n0 0 0 0 0\nSMALL\nNO_CHARGES\n\n@<TRIPOS>ATOM\n@<TRIPOS>BOND\n' },
        { label: 'InChI (.inchi)',          ext: 'inchi',  template: '' },
        { label: 'Python script (.py)',     ext: 'py',    template: '# Python script\n\n' },
        { label: 'R script (.r)',           ext: 'r',     template: '# R script\n\n' },
        { label: 'Shell script (.sh)',      ext: 'sh',    template: '#!/bin/bash\n\n' },
        { label: 'JavaScript (.js)',        ext: 'js',    template: '' },
        { label: 'TypeScript (.ts)',        ext: 'ts',    template: '' },
        { label: 'CSV data (.csv)',         ext: 'csv',   template: '' },
        { label: 'TSV data (.tsv)',         ext: 'tsv',   template: '' },
        { label: 'JSON (.json)',            ext: 'json',  template: '{\n}\n' },
        { label: 'YAML (.yaml)',            ext: 'yaml',  template: '' },
        { label: 'Plain text (.txt)',       ext: 'txt',   template: '' },
        { label: 'Markdown (.md)',          ext: 'md',    template: '# Title\n\n' },
      ];

      // Step 1 — pick file type
      const typeResult = await InputDialog.getItem({
        title: folderPath ? `New File in ${folderPath.split('/').pop()}` : 'New File',
        label: 'File type',
        items: FILE_TYPES.map(t => t.label),
      });
      if (!typeResult.button.accept || !typeResult.value) return;

      const picked = FILE_TYPES.find(t => t.label === typeResult.value)!;

      // Step 2 — enter file name (without extension)
      const nameResult = await InputDialog.getText({
        title: `New ${picked.label}`,
        label: `File name (without extension — .${picked.ext} will be added automatically)`,
        placeholder: 'e.g. my_sequences',
      });
      if (!nameResult.button.accept || !nameResult.value?.trim()) return;

      const fileName = `${nameResult.value.trim()}.${picked.ext}`;
      const uploadPath = folderPath || undefined;

      try {
        const blob = new Blob([picked.template], { type: 'text/plain' });
        const file = new File([blob], fileName, { type: 'text/plain' });
        await client.uploadFile(file, workspaceId, uploadPath);
        callbacks.refreshFiles();
        Notification.success(`Created ${fileName}`, { autoClose: 3000 });
      } catch (e) {
        Notification.error(`Failed to create file: ${e}`, { autoClose: 5000 });
      }
    },

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
