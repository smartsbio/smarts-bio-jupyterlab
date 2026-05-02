// NOTE: This file is mirrored from smarts-bio-vscode/src/api/SmartsBioClient.ts
// If you fix a bug here, check if the same fix applies there.
// Changes from VS Code version:
//   - Removed `vscode`, `fs`, `path` imports
//   - `getApiBase()` replaced with injected `getConfig()` callback
//   - `uploadFile()` accepts File/Blob instead of filesystem path
import { AuthProvider } from '../auth/AuthProvider';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  id: string;
}

export interface ContextAttachment {
  type: 'selection' | 'file';
  label: string;
  content: string;
  fileKey?: string;
}

export interface StreamChunk {
  type: 'text' | 'tool_use' | 'tool_result' | 'done' | 'error';
  content?: string;
  toolName?: string;
  error?: string;
}

export interface Job {
  id: string;
  name: string;
  tool: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'error' | 'pending';
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  errorMessage?: string;
  executionMode?: 'distributed' | 'external' | 'local';
}

export interface WorkspaceInfo {
  workspaceId: string;
  name: string;
}

export interface OrgWithWorkspaces {
  organizationId: string;
  name: string;
  type: string;
  plan: string;
  workspaces: WorkspaceInfo[];
}

export interface UploadedFile {
  fileKey: string;
  fileName: string;
  sizeBytes: number;
  workspaceId: string;
}

export interface CatalogTool {
  id: string;
  name: string;
  description: string;
  category: string;
}

export interface CatalogPipeline {
  id: string;
  name: string;
  description: string;
  category: string;
}

export interface WorkspaceFileItem {
  key: string;
  name: string;
  type: 'file' | 'folder';
  size?: number;
  lastModified?: string;
  format?: string;
}

export type ConfigGetter = () => { apiBaseUrl: string };

/**
 * All smarts.bio API communication lives here.
 * In JupyterLab this runs directly in the browser (no extension host boundary).
 */
export class SmartsBioClient {
  constructor(
    private readonly auth: AuthProvider,
    private readonly getConfig: ConfigGetter,
  ) {}

  private getApiBase(): string {
    return this.getConfig().apiBaseUrl;
  }

  private async request<T>(
    method: string,
    endpoint: string,
    body?: unknown,
    retried = false,
  ): Promise<T> {
    const token = await this.auth.getToken();
    const response = await fetch(`${this.getApiBase()}${endpoint}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (response.status === 401 && !retried) {
      const refreshed = await this.auth.handleUnauthorized();
      if (refreshed) {
        return this.request<T>(method, endpoint, body, true);
      }
      throw new Error('Authentication required. Please sign in to smarts.bio.');
    }

    if (!response.ok) {
      const text = await response.text().catch(() => response.statusText);
      throw new Error(`smarts.bio API error ${response.status}: ${text}`);
    }

    return response.json() as Promise<T>;
  }

  /**
   * Stream a query to the smarts.bio agent via SSE.
   * Yields StreamChunk objects as they arrive.
   */
  async *streamQuery(
    message: string,
    conversationId: string,
    workspaceId: string,
    context?: ContextAttachment,
    signal?: AbortSignal,
  ): AsyncGenerator<StreamChunk> {
    const token = await this.auth.getToken();

    const response = await fetch(`${this.getApiBase()}/v1/query/stream`, {
      method: 'POST',
      signal,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({
        prompt: message,
        conversation_id: conversationId,
        workspace_id: workspaceId,
        context: context
          ? {
              type: context.type,
              label: context.label,
              content: context.content,
              fileKey: context.fileKey,
            }
          : undefined,
      }),
    });

    if (response.status === 401) {
      const refreshed = await this.auth.handleUnauthorized();
      if (!refreshed) {
        yield { type: 'error', error: 'Authentication required. Please sign in.' };
        return;
      }
      yield* this.streamQuery(message, conversationId, workspaceId, context, signal);
      return;
    }

    if (!response.ok || !response.body) {
      yield {
        type: 'error',
        error: `API error ${response.status}: ${response.statusText}`,
      };
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const chunk = parseSseLine(line);
          if (chunk) {
            yield chunk;
            if (chunk.type === 'done' || chunk.type === 'error') {
              return;
            }
          }
        }
      }
    } catch (err: any) {
      // Swallow AbortError — caller handles the stopped state
      if (err?.name !== 'AbortError') throw err;
      return;
    } finally {
      reader.cancel();
    }

    yield { type: 'done' };
  }

  /**
   * Confirm a script plan and stream the generation result.
   * Called after the user approves a script plan proposed by the agent.
   */
  async *streamConfirmScript(
    threadId: string,
    workspaceId: string,
    sessionId: string,
    signal?: AbortSignal,
  ): AsyncGenerator<StreamChunk> {
    const token = await this.auth.getToken();

    const response = await fetch(`${this.getApiBase()}/v1/query/confirm-script`, {
      method: 'POST',
      signal,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({ thread_id: threadId, workspace_id: workspaceId, session_id: sessionId }),
    });

    if (response.status === 401) {
      const refreshed = await this.auth.handleUnauthorized();
      if (!refreshed) {
        yield { type: 'error', error: 'Authentication required. Please sign in.' };
        return;
      }
      yield* this.streamConfirmScript(threadId, workspaceId, sessionId, signal);
      return;
    }

    if (!response.ok || !response.body) {
      yield { type: 'error', error: `API error ${response.status}: ${response.statusText}` };
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const chunk = parseSseLine(line);
          if (chunk) {
            yield chunk;
            if (chunk.type === 'done' || chunk.type === 'error') return;
          }
        }
      }
    } catch (err: unknown) {
      const name = err instanceof Error ? err.name : '';
      if (name !== 'AbortError') throw err;
      return;
    } finally {
      reader.cancel();
    }

    yield { type: 'done' };
  }

  async stopQuery(conversationId: string): Promise<void> {
    try {
      await this.request('POST', '/v1/query/stop', { conversation_id: conversationId });
    } catch {
      // Best-effort — if the agent is already done, ignore
    }
  }

  async getOrganizationsWithWorkspaces(): Promise<OrgWithWorkspaces[]> {
    const result = await this.request<{ status: string; data: OrgWithWorkspaces[] }>(
      'GET',
      '/v1/user/organizations',
    );
    return result.data ?? [];
  }

  async getUserProfile(): Promise<{
    userId: string;
    name: string;
    email: string;
    plan: string;
    computeCreditsRemaining: number;
    computeCreditsTotal: number;
    defaultWorkspaceId: string;
  }> {
    return this.request('GET', '/v1/user/profile');
  }

  async getJobs(workspaceId: string): Promise<Job[]> {
    const result = await this.request<{ processes?: any[]; data?: any[] } | any[]>(
      'GET',
      `/v1/pipelines?workspace_id=${encodeURIComponent(workspaceId)}`,
    );
    const raw: any[] = Array.isArray(result)
      ? result
      : (result as any).processes ?? (result as any).data ?? [];

    return raw.map((p: any): Job => {
      const startedAt: string | undefined = p.startedAt ?? p.createdAt;
      const completedAt: string | undefined = p.completedAt;
      const durationMs =
        startedAt && completedAt
          ? new Date(completedAt).getTime() - new Date(startedAt).getTime()
          : undefined;
      return {
        id: p.processId ?? p._id ?? p.id ?? '',
        name: p.name ?? p.toolName ?? 'Process',
        tool: p.toolName ?? p.tool ?? '',
        status: p.status ?? 'pending',
        startedAt,
        completedAt,
        durationMs,
        errorMessage: typeof p.error === 'string' ? p.error : (p.error?.message ?? p.errorMessage),
        executionMode: p.executionMode,
      };
    });
  }

  async cancelJob(jobId: string, workspaceId: string): Promise<void> {
    await this.request(
      'DELETE',
      `/v1/pipelines/${jobId}?workspace_id=${encodeURIComponent(workspaceId)}`,
    );
  }

  async getFiles(workspaceId: string, folderPath?: string): Promise<WorkspaceFileItem[]> {
    let url = `/v1/files?workspace_id=${encodeURIComponent(workspaceId)}`;
    if (folderPath) {
      url += `&path=${encodeURIComponent(folderPath)}`;
    }
    const result = await this.request<{ status: string; data: { files: WorkspaceFileItem[] } }>(
      'GET',
      url,
    );
    return result.data?.files ?? [];
  }

  async getFileDownloadUrl(workspaceId: string, fileKey: string): Promise<string> {
    const result = await this.request<{ status: string; data: { downloadUrl: string } }>(
      'GET',
      `/v1/files/download?workspace_id=${encodeURIComponent(workspaceId)}&key=${encodeURIComponent(fileKey)}`,
    );
    return result.data.downloadUrl;
  }

  async deleteFile(workspaceId: string, fileKey: string): Promise<void> {
    await this.request(
      'DELETE',
      `/v1/files?workspace_id=${encodeURIComponent(workspaceId)}&key=${encodeURIComponent(fileKey)}`,
    );
  }

  async renameFile(workspaceId: string, fileKey: string, newName: string): Promise<string> {
    const result = await this.request<{ status: string; data: { newFileKey: string } }>(
      'PUT',
      '/v1/files/rename',
      { workspace_id: workspaceId, fileKey, newName },
    );
    return result.data.newFileKey;
  }

  async moveFile(
    workspaceId: string,
    fileKey: string,
    destinationPath: string,
  ): Promise<string> {
    const result = await this.request<{ status: string; data: { newFileKey: string } }>(
      'PUT',
      '/v1/files/move',
      { workspace_id: workspaceId, fileKey, destinationPath },
    );
    return result.data.newFileKey;
  }

  async createFolder(workspaceId: string, name: string, parentPath?: string): Promise<string> {
    const result = await this.request<{ status: string; data: { folderKey: string } }>(
      'POST',
      '/v1/files/folder',
      { workspace_id: workspaceId, name, path: parentPath ?? '' },
    );
    return result.data.folderKey;
  }

  /**
   * Upload a file from the browser.
   * Accepts a File or Blob (from <input type="file"> or drag-and-drop).
   * Files >10 MB use the presigned S3 flow.
   */
  async uploadFile(file: File, workspaceId: string, path?: string): Promise<UploadedFile> {
    // Browsers expose dragged directories as File objects with no MIME type and no
    // file extension (macOS reports size=192 for dirs, not 0, so we cannot rely on size).
    // Attempting to upload them causes ERR_ACCESS_DENIED.
    const hasExtension = file.name.includes('.');
    if (file.type === '' && !hasExtension) {
      throw new Error(`Cannot upload directory: ${file.name}`);
    }

    const sizeBytes = file.size;

    if (sizeBytes > 10 * 1024 * 1024) {
      return this._uploadLargeFile(file, workspaceId, path);
    }

    // Small file: direct multipart upload
    const token = await this.auth.getToken();
    const formData = new FormData();
    formData.append('file', file, file.name);
    formData.append('workspace_id', workspaceId);
    if (path) formData.append('path', path);

    const response = await fetch(`${this.getApiBase()}/v1/files/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`File upload failed: ${response.statusText}`);
    }

    return response.json() as Promise<UploadedFile>;
  }

  /** Fetch the public tool + pipeline catalog (no auth required). */
  async getCatalog(): Promise<{ tools: CatalogTool[]; pipelines: CatalogPipeline[] }> {
    const base = this.getApiBase();
    const [toolsRes, pipelinesRes] = await Promise.all([
      fetch(`${base}/v1/catalog/tools`),
      fetch(`${base}/v1/catalog/pipelines`),
    ]);

    const toolsData = toolsRes.ok
      ? ((await toolsRes.json()) as { tools?: CatalogTool[] })
      : {};
    const pipelinesRaw = pipelinesRes.ok
      ? ((await pipelinesRes.json()) as { pipelines?: any[] }).pipelines ?? []
      : [];

    const pipelines: CatalogPipeline[] = pipelinesRaw.map((p: any) => ({
      id: p.id ?? p.pipelineId,
      name: p.name,
      description: p.description,
      category: p.category,
    }));

    return {
      tools: toolsData.tools ?? [],
      pipelines,
    };
  }

  /** Alias with (fileKey, workspaceId) order — used by ViewerWidget. */
  async getFileUrl(fileKey: string, workspaceId: string): Promise<string> {
    return this.getFileDownloadUrl(workspaceId, fileKey);
  }

  /**
   * Download file content as a string.
   * Pass asBase64=true for binary files (BAM, BCF) — returns base64-encoded data.
   */
  async getFileContent(fileKey: string, workspaceId: string, asBase64 = false): Promise<string> {
    return this.getFileContentWithProgress(fileKey, workspaceId, asBase64, null);
  }

  /**
   * Download file content with progress reporting.
   * onProgress receives a value 0–100 as bytes arrive. Pass null to skip tracking.
   */
  async getFileContentWithProgress(
    fileKey: string,
    workspaceId: string,
    asBase64: boolean,
    onProgress: ((percent: number) => void) | null,
  ): Promise<string> {
    const { apiBaseUrl } = this.getConfig();
    const token = await this.auth.getToken();
    const url = `${apiBaseUrl}/v1/files/content?workspace_id=${encodeURIComponent(workspaceId)}&key=${encodeURIComponent(fileKey)}`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch file: ${response.statusText}`);
    }

    if (!onProgress || !response.body) {
      // Fast path — no progress tracking needed
      if (asBase64) {
        const buffer = await response.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let binary = '';
        bytes.forEach(b => (binary += String.fromCharCode(b)));
        return btoa(binary);
      }
      return response.text();
    }

    // Stream with progress
    const contentLength = response.headers.get('Content-Length');
    const total = contentLength ? parseInt(contentLength, 10) : 0;
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;

    onProgress(0);
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      if (total > 0) {
        onProgress(Math.min(99, Math.round((received / total) * 100)));
      }
    }
    onProgress(100);

    // Assemble all chunks
    const allBytes = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) {
      allBytes.set(chunk, offset);
      offset += chunk.length;
    }

    if (asBase64) {
      let binary = '';
      allBytes.forEach(b => (binary += String.fromCharCode(b)));
      return btoa(binary);
    }
    return new TextDecoder().decode(allBytes);
  }

  async renameFolder(workspaceId: string, folderPath: string, newName: string): Promise<void> {
    await this.request('PUT', '/v1/files/rename', {
      workspace_id: workspaceId,
      fileKey: folderPath,
      newName,
      isFolder: true,
    });
  }

  async deleteFolder(workspaceId: string, folderPath: string): Promise<void> {
    await this.request(
      'DELETE',
      `/v1/files?workspace_id=${encodeURIComponent(workspaceId)}&key=${encodeURIComponent(folderPath)}&isFolder=true`,
    );
  }

  private async _uploadLargeFile(file: File, workspaceId: string, path?: string): Promise<UploadedFile> {
    // Step 1: Get presigned URL
    const { uploadUrl, fileKey } = await this.request<{ uploadUrl: string; fileKey: string }>(
      'POST',
      '/v1/files/upload-url',
      { fileName: file.name, sizeBytes: file.size, workspace_id: workspaceId, path: path ?? '' },
    );

    // Step 2: Upload directly to S3
    const uploadResponse = await fetch(uploadUrl, { // S3 presigned URL — no apiBase needed
      method: 'PUT',
      body: file,
      headers: { 'Content-Type': 'application/octet-stream' },
    });

    if (!uploadResponse.ok) {
      throw new Error(`S3 upload failed: ${uploadResponse.statusText}`);
    }

    // Step 3: Confirm upload with backend
    return this.request<UploadedFile>('POST', '/v1/files/upload-confirm', {
      fileKey,
      fileName: file.name,
    });
  }

  /**
   * Save text content back to an existing workspace file, preserving its exact S3 key.
   * Uses the presigned-URL flow so the PUT overwrites the same object in-place.
   * fileKey: full S3 key, e.g. "organizations/{orgId}/workspaces/{wsId}/files/path/chart.json"
   */
  async saveFileContent(workspaceId: string, fileKey: string, content: string): Promise<void> {
    // Extract workspace-relative path from the full S3 key
    const marker = '/files/';
    const idx = fileKey.indexOf(marker);
    const relPath = idx >= 0 ? fileKey.slice(idx + marker.length) : fileKey;
    const parts = relPath.split('/');
    const fname = parts.pop()!;
    const directory = parts.join('/');

    const ext = fname.split('.').pop()?.toLowerCase() ?? '';
    const contentTypeMap: Record<string, string> = {
      json: 'application/json', xpr: 'application/json',
      csv: 'text/csv', tsv: 'text/tab-separated-values',
      txt: 'text/plain', md: 'text/markdown',
      py: 'text/x-python',
    };
    const contentType = contentTypeMap[ext] ?? 'text/plain';

    // Use the direct upload endpoint (multipart/form-data) so the S3 write is performed
    // server-side. This avoids the S3 CORS block that occurs when the browser (running on
    // localhost:8888 in JupyterLab) tries to PUT directly to an S3 presigned URL.
    const { apiBaseUrl } = this.getConfig();
    const token = await this.auth.getToken();

    const form = new FormData();
    form.append('file', new Blob([content], { type: contentType }), fname);
    form.append('workspace_id', workspaceId);
    if (directory) form.append('path', directory);

    const res = await fetch(`${apiBaseUrl}/v1/files/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: res.statusText }));
      throw new Error((err as any).message ?? `Upload failed: ${res.status}`);
    }
  }

  async updateFileMetadata(workspaceId: string, fileKey: string, metadata: Record<string, unknown>): Promise<void> {
    await this.request('PATCH', '/v1/files/metadata', { workspace_id: workspaceId, fileKey, metadata });
  }

  /**
   * Stream analysis events from bio-analytics for a workspace file.
   * Yields named SSE events as they arrive (progress, classification, metrics, etc.)
   */
  async *streamAnalysis(
    fileKey: string,
    viewerType: string,
    workspaceId: string,
    parameters?: Record<string, unknown>,
  ): AsyncGenerator<{ event: string; data: Record<string, unknown> }> {
    const token = await this.auth.getToken();
    const response = await fetch(`${this.getApiBase()}/v1/analytics/stream`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({ fileKey, viewerType, workspaceId, parameters: parameters ?? {} }),
    });

    if (response.status === 401) {
      const refreshed = await this.auth.handleUnauthorized();
      if (!refreshed) {
        yield { event: 'error', data: { message: 'Authentication required. Please sign in.' } };
        return;
      }
      yield* this.streamAnalysis(fileKey, viewerType, workspaceId, parameters);
      return;
    }

    if (!response.ok || !response.body) {
      yield { event: 'error', data: { message: `API error ${response.status}: ${response.statusText}` } };
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let eventName = 'message';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (line === '') {
            eventName = 'message';
          } else if (line.startsWith('event: ')) {
            eventName = line.slice('event: '.length).trim();
          } else if (line.startsWith('data: ')) {
            if (eventName === 'done') return;
            try {
              const data = JSON.parse(line.slice('data: '.length)) as Record<string, unknown>;
              yield { event: eventName, data };
            } catch { /* skip malformed lines */ }
          }
        }
      }
    } finally {
      reader.cancel();
    }
  }

  /**
   * Stream analysis events for a LOCAL file by sending its content directly.
   * Mirrors VS Code's streamAnalysisLocal: POSTs { fileContent, isBinary, fileName, viewerType }.
   */
  async *streamAnalysisLocal(
    fileContent: string,
    isBinary: boolean,
    fileName: string,
    viewerType: string,
    parameters?: Record<string, unknown>,
    signal?: AbortSignal,
  ): AsyncGenerator<{ event: string; data: Record<string, unknown> }> {
    const token = await this.auth.getToken();
    let response: Response;
    try {
      response = await fetch(`${this.getApiBase()}/v1/analytics/stream`, {
        method: 'POST',
        signal,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body: JSON.stringify({ fileContent, isBinary, fileName, viewerType, parameters: parameters ?? {} }),
      });
    } catch (err: unknown) {
      if ((err as { name?: string })?.name !== 'AbortError') {
        yield { event: 'error', data: { message: (err as Error)?.message ?? 'Network error' } };
      }
      return;
    }

    if (response.status === 401) {
      const refreshed = await this.auth.handleUnauthorized();
      if (!refreshed) {
        yield { event: 'error', data: { message: 'Authentication required. Please sign in.' } };
        return;
      }
      yield* this.streamAnalysisLocal(fileContent, isBinary, fileName, viewerType, parameters, signal);
      return;
    }

    if (!response.ok || !response.body) {
      yield { event: 'error', data: { message: `API error ${response.status}: ${response.statusText}` } };
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let eventName = 'message';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (line === '') {
            eventName = 'message';
          } else if (line.startsWith('event: ')) {
            eventName = line.slice('event: '.length).trim();
          } else if (line.startsWith('data: ')) {
            if (eventName === 'done') return;
            try {
              const data = JSON.parse(line.slice('data: '.length)) as Record<string, unknown>;
              yield { event: eventName, data };
            } catch { /* skip malformed lines */ }
          }
        }
      }
    } finally {
      reader.cancel();
    }
  }

  async generatePdf(workspaceId: string, markdown: string, title: string): Promise<void> {
    const result = await this.request<{ status: string; data: { pdfBase64: string } }>(
      'POST',
      '/v1/reports/generate-pdf',
      { workspace_id: workspaceId, title, markdown },
    );
    const base64 = result.data.pdfBase64;
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.replace(/[^a-zA-Z0-9_\- ]/g, '_')}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

function parseSseLine(line: string): StreamChunk | null {
  if (!line.startsWith('data: ')) {
    return null;
  }

  const dataStr = line.slice('data: '.length);
  if (dataStr === '[DONE]') {
    return { type: 'done' };
  }

  try {
    const data = JSON.parse(dataStr) as Record<string, unknown>;

    if (data.status === 'complete' && typeof data.result === 'string') {
      return { type: 'text', content: data.result };
    }

    if (data.status === 'error') {
      return { type: 'error', error: (data.message as string) || 'An error occurred' };
    }

    if (typeof data.status === 'string') {
      return { type: 'tool_use', toolName: data.status };
    }

    return null;
  } catch {
    return null;
  }
}
