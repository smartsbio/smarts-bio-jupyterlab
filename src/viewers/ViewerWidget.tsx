// Remote file viewer — opens a smarts.bio workspace file in the JupyterLab main area.
// Uses React components from @smartsbio/ui instead of iframe/srcdoc.
import React, { useState, useEffect, useCallback } from 'react';
import { ReactWidget, MainAreaWidget } from '@jupyterlab/apputils';
import { ViewerShell } from '@smartsbio/ui';
import { SmartsBioClient } from '../api/SmartsBioClient';
import {
  BINARY_EXTS,
  detectIsDark,
  renderViewer,
} from './renderViewer';

// ── Loading / error pane ─────────────────────────────────────────────��─────────

function DownloadProgress({
  progress,
  isDark,
}: {
  progress: number | null;
  isDark: boolean;
}): React.ReactElement {
  const pct = progress ?? 0;
  const bg = isDark ? '#1e1e1e' : '#f5f5f5';
  const fg = isDark ? '#e0e0e0' : '#333';
  const trackColor = isDark ? '#333' : '#ddd';
  const barColor = 'var(--sb-progress, var(--jp-brand-color1, #1976d2))';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', background: bg, color: fg, gap: 12 }}>
      <div style={{ fontSize: 13, opacity: 0.8 }}>
        {pct < 100 ? `Downloading… ${pct}%` : 'Processing…'}
      </div>
      <div style={{ width: 220, height: 6, borderRadius: 3, background: trackColor, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: barColor, borderRadius: 3, transition: 'width 0.15s ease' }} />
      </div>
    </div>
  );
}

function RemoteViewerPane({
  fileKey,
  fileName,
  ext,
  client,
  workspaceId,
}: {
  fileKey: string;
  fileName: string;
  ext: string;
  client: SmartsBioClient;
  workspaceId: string;
}): React.ReactElement {
  const [content, setContent] = useState<string | Uint8Array | null>(null);
  const [error, setError]     = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [effectiveExt, setEffectiveExt] = useState(ext);
  const isDark = detectIsDark();

  useEffect(() => {
    if (BINARY_EXTS.has(ext)) {
      setError(
        `${fileName} is a binary compressed format and cannot be previewed inline.\n` +
        `Download the file and open it with IGV, samtools, or a compatible tool.`,
      );
      return;
    }

    const asBinary = ext === '.bam' || ext === '.xlsx' || ext === '.xls' || ext === '.pdf' || ext === '.docx' || ext === '.png' || ext === '.jpg' || ext === '.jpeg' || ext === '.gif' || ext === '.webp' || ext === '.tif' || ext === '.tiff' || ext === '.bmp' || ext === '.ico' || ext === '.svg';
    setProgress(0);

    // The API proxy buffers the full response, so real chunk-level progress isn't
    // available. Simulate smooth progress that asymptotically approaches 90%, then
    // jumps to 100% when the fetch resolves.
    let sim = 0;
    const timer = setInterval(() => {
      sim = Math.min(90, sim + (90 - sim) * 0.12);
      setProgress(Math.round(sim));
    }, 200);

    client.getFileContent(fileKey, workspaceId, asBinary).then(raw => {
      clearInterval(timer);
      if (asBinary) {
        // API returns base64 for binary — decode to Uint8Array for AlignmentViewer
        const binary = atob(raw);
        const bytes  = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        setContent(bytes);
      } else {
        // Content-based detection: JSON with a Vega-Lite $schema → chart viewer
        if (ext === '.json') {
          try {
            const peek = JSON.parse(raw.slice(0, 2000));
            if (typeof peek.$schema === 'string' && peek.$schema.includes('vega.github.io/schema/vega-lite')) {
              setEffectiveExt('.chart');
              // Lazy-tag so the chart icon appears in FilesPanel on next refresh
              client.updateFileMetadata(workspaceId, fileKey, { format: 'vega-lite' }).catch(() => { /* best-effort */ });
            }
          } catch { /* not valid JSON */ }
        }
        setContent(raw);
      }
      setProgress(null);
    }).catch(err => {
      clearInterval(timer);
      setError(err instanceof Error ? err.message : String(err));
      setProgress(null);
    });

    return () => clearInterval(timer);
  }, [fileKey, workspaceId, ext, client, fileName]);

  // Content is already in memory — use it directly to avoid a second fetch
  // and any CORS issues with S3 presigned URLs.
  const handleDownload = useCallback(() => {
    if (!content) return;
    const blob = content instanceof Uint8Array
      ? new Blob([content as BlobPart])
      : new Blob([content], { type: 'text/plain' });
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href     = objectUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(objectUrl);
  }, [content, fileName]);

  // Re-upload the edited text as a new version of the same file.
  // Uses the presigned-URL overwrite flow so the file key stays the same.
  // Binary formats (BAM) are fetched as Uint8Array and have no text-edit path,
  // so onSave is only wired for text-based content.
  const handleSave = useCallback(async (edited: string) => {
    await client.saveFileContent(workspaceId, fileKey, edited);
    // Refresh content state so the viewer reflects the saved version
    setContent(edited);
  }, [client, workspaceId, fileKey]);

  // Extract orgId from the current file's full S3 key so we can reconstruct keys for
  // workspace-relative smartsbio:// URLs (new format: smartsbio://exp1/file.csv).
  const orgId = fileKey.match(/^organizations\/([^/]+)\//)?.[1] ?? null;

  // UUID pattern used to detect the legacy smartsbio://{orgId}/{wsId}/... format.
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  // ChartViewer: resolve smartsbio:// or https:// data refs by fetching through the API.
  // Handles three URI formats:
  //   smartsbio://workspace/{wsId}/{encodedKey}  (old JupyterLab/VS Code format)
  //   smartsbio://{orgId}/{wsId}/{fileKey}       (old IDE / bio-viewers format)
  //   smartsbio://{relPath}                      (new compact format, e.g. exp1/file.csv)
  const onResolveRef = useCallback(async (ref: string): Promise<string | null> => {
    try {
      let wsId: string | null = null;
      let key: string | null = null;

      if (ref.startsWith('smartsbio://workspace/')) {
        // Old Format 1: smartsbio://workspace/{wsId}/{encodedFullKey}
        const rest = ref.slice('smartsbio://workspace/'.length);
        const slashIdx = rest.indexOf('/');
        wsId = rest.slice(0, slashIdx);
        key  = decodeURIComponent(rest.slice(slashIdx + 1));
      } else if (ref.startsWith('smartsbio://')) {
        const rest = ref.slice('smartsbio://'.length);
        const parts = rest.split('/');
        if (parts.length >= 3 && UUID_RE.test(parts[0]) && UUID_RE.test(parts[1])) {
          // Old Format 2: smartsbio://{orgId}/{wsId}/{relPath}
          wsId = parts[1];
          key  = `organizations/${parts[0]}/workspaces/${parts[1]}/${parts.slice(2).join('/')}`;
        } else if (orgId) {
          // New compact format: smartsbio://{workspaceRelPath} (e.g. exp1/file.csv)
          wsId = workspaceId;
          key  = `organizations/${orgId}/workspaces/${workspaceId}/files/${rest}`;
        }
      }

      if (wsId && key) {
        // Use the server-side content proxy to avoid S3 CORS restrictions.
        return await client.getFileContent(key, wsId);
      }

      if (ref.startsWith('http://') || ref.startsWith('https://')) {
        const resp = await fetch(ref);
        return resp.ok ? await resp.text() : null;
      }
      return null;
    } catch {
      return null;
    }
  }, [client, orgId, workspaceId]);

  // ChartViewer: list workspace files for the data-source picker
  const onListFiles = useCallback(
    (path?: string) => client.getFiles(workspaceId, path),
    [client, workspaceId],
  );

  // ChartViewer: build a compact smartsbio:// URI (workspace-relative, no orgId/wsId embedded).
  // Example: organizations/ORG/workspaces/WS/files/exp1/data.csv → smartsbio://exp1/data.csv
  const makeFileUrl = useCallback(
    (key: string) => {
      const prefix = orgId ? `organizations/${orgId}/workspaces/${workspaceId}/files/` : null;
      const relPath = prefix && key.startsWith(prefix) ? key.slice(prefix.length) : key;
      return `smartsbio://${relPath}`;
    },
    [orgId, workspaceId],
  );

  // ExperimentViewer: export PDF via the reports API then trigger browser download.
  // Must be declared before any early returns to satisfy the Rules of Hooks.
  const handleExportPdf = useCallback(async (markdown: string, title: string) => {
    await client.generatePdf(workspaceId, markdown, title);
  }, [client, workspaceId]);

  if (error)            return <ViewerShell error={error} isDark={isDark} />;
  if (content === null) return <DownloadProgress progress={progress} isDark={isDark} />;

  // Only offer save for text-based files (not BAM Uint8Array)
  const onSave = typeof content === 'string' ? handleSave : undefined;

  return renderViewer(fileName, effectiveExt, content, {
    onSave,
    onDownload: handleDownload,
    onResolveRef,
    onListFiles,
    makeFileUrl,
    workspaceId,
    isAuthenticated: true,
    onExportPdf: handleExportPdf,
  });
}

// ── ReactWidget wrapper ────────────────────────────────────────────────────────

class RemoteViewerWidget extends ReactWidget {
  constructor(
    private readonly fileKey:      string,
    private readonly _fileName:    string,
    private readonly ext:          string,
    private readonly client:       SmartsBioClient,
    private readonly workspaceId:  string,
  ) {
    super();
    this.addClass('smarts-bio-panel');
  }

  protected render(): React.ReactElement {
    return (
      <RemoteViewerPane
        fileKey={this.fileKey}
        fileName={this._fileName}
        ext={this.ext}
        client={this.client}
        workspaceId={this.workspaceId}
      />
    );
  }
}

// ── Public API ──────────────────────────────────────────────────────────────��──

export async function openViewerWidget(
  fileKey: string,
  fileName: string,
  ext: string,
  client: SmartsBioClient,
  workspaceId: string,
): Promise<MainAreaWidget<RemoteViewerWidget>> {
  const content = new RemoteViewerWidget(fileKey, fileName, ext, client, workspaceId);
  const widget  = new MainAreaWidget({ content });
  widget.title.label    = fileName;
  widget.title.closable = true;
  return widget;
}
