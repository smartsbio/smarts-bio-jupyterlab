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
  const isDark = detectIsDark();

  useEffect(() => {
    if (BINARY_EXTS.has(ext)) {
      setError(
        `${fileName} is a binary compressed format and cannot be previewed inline.\n` +
        `Download the file and open it with IGV, samtools, or a compatible tool.`,
      );
      return;
    }

    const asBinary = ext === '.bam' || ext === '.xlsx' || ext === '.xls' || ext === '.pdf' || ext === '.docx';
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
      ? new Blob([content])
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
  // Binary formats (BAM) are fetched as Uint8Array and have no text-edit path,
  // so onSave is only wired for text-based content.
  const handleSave = useCallback(async (edited: string) => {
    const blob = new Blob([edited], { type: 'text/plain' });
    const file = new File([blob], fileName, { type: 'text/plain' });
    await client.uploadFile(file, workspaceId);
    // Refresh content state so the viewer reflects the saved version
    setContent(edited);
  }, [client, workspaceId, fileName]);

  if (error)            return <ViewerShell error={error} isDark={isDark} />;
  if (content === null) return <DownloadProgress progress={progress} isDark={isDark} />;

  // Only offer save for text-based files (not BAM Uint8Array)
  const onSave = typeof content === 'string' ? handleSave : undefined;

  return renderViewer(fileName, ext, content, { onSave, onDownload: handleDownload });
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
