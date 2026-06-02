// Local file viewer factory — integrates with IDocumentRegistry so double-clicking
// a bioinformatics file in the JupyterLab file browser opens the @smartsbio/ui viewer.
import React, { useState, useEffect, useCallback } from 'react';
import { ReactWidget } from '@jupyterlab/apputils';
import { ABCWidgetFactory, DocumentRegistry, DocumentWidget } from '@jupyterlab/docregistry';
import { ViewerShell } from '@smartsbio/ui';
import { detectIsDark, renderViewer, extToViewerType, WSI_EXTS } from './renderViewer';
import type { SmartsBioClient } from '../api/SmartsBioClient';
import type { AuthProvider } from '../auth/AuthProvider';

interface LocalViewerFactoryOptions extends DocumentRegistry.IWidgetFactoryOptions {
  client?: SmartsBioClient;
  auth?: AuthProvider;
}

// Extensions loaded with the 'base64' model factory.
// These map to the BinaryViewerWidgetFactory in index.ts.
export const LOCAL_BINARY_EXTS = new Set([
  // Images
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.tif', '.tiff', '.bmp', '.svg',
  // Documents
  '.pdf', '.docx', '.xlsx', '.xls',
  // Alignment / index formats
  '.bam', '.bai', '.cram',
  // Variant / signal tracks
  '.bcf', '.bw', '.bigwig',
  // DICOM medical imaging
  '.dcm', '.dicom',
]);

function base64ToUint8Array(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes  = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// ── Local viewer pane ─────────────────────────────────────────────────────────

function WsiLocalMessage({
  isDark,
  isAuthenticated,
  onSignIn,
}: {
  isDark: boolean;
  isAuthenticated: boolean;
  onSignIn?: () => void;
}): React.ReactElement {
  const bg  = isDark ? '#1e1e1e' : '#f9f9f9';
  const fg  = isDark ? '#e0e0e0' : '#333';
  const sub = isDark ? '#aaa'    : '#666';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', background: bg, padding: '0 32px', gap: 10, textAlign: 'center' }}>
      <div style={{ fontSize: 36 }}>🔬</div>
      <div style={{ fontSize: 15, fontWeight: 600, color: fg }}>Whole Slide Image</div>
      <div style={{ fontSize: 13, color: sub, maxWidth: 440, lineHeight: 1.6 }}>
        WSI files are too large to open locally and require a tile server to render.
      </div>
      {!isAuthenticated ? (
        <>
          <div style={{ fontSize: 13, color: sub, maxWidth: 440, lineHeight: 1.6 }}>
            Sign in, then drag this file into the <strong>smarts.bio File Explorer</strong> to upload and open it.
          </div>
          <button
            onClick={onSignIn}
            style={{
              marginTop: 4, padding: '8px 20px', fontSize: 13, fontWeight: 600,
              background: 'var(--jp-brand-color1, #1976d2)', color: '#fff',
              border: 'none', borderRadius: 6, cursor: 'pointer',
            }}
          >
            Sign in to smarts.bio
          </button>
        </>
      ) : (
        <div style={{ fontSize: 13, color: sub, maxWidth: 440, lineHeight: 1.8, textAlign: 'left' }}>
          <div>1. Drag this file into the <strong>smarts.bio File Explorer</strong> (left sidebar) to upload it.</div>
          <div>2. Once uploaded, click the file in the Explorer to open the viewer.</div>
        </div>
      )}
    </div>
  );
}

function LocalViewerPane({
  fileName,
  ext,
  isBinary,
  contentPromise,
  saveContent,
  onAnalyze,
  onCommand,
  isAuthenticated,
}: {
  fileName: string;
  ext: string;
  isBinary: boolean;
  contentPromise: Promise<string>;
  saveContent: ((text: string) => Promise<void>) | null;
  onAnalyze?: (...args: unknown[]) => AsyncIterable<{ event: string; data: Record<string, unknown> }>;
  onCommand?: (cmd: string) => void;
  isAuthenticated: boolean;
}): React.ReactElement {
  const [content, setContent] = useState<string | Uint8Array | null>(null);
  const [error, setError]     = useState<string | null>(null);
  const isDark = detectIsDark();

  // WSI: tile-server based — never read local file content (files are 2-20 GB).
  // The viewer renders with an empty fileUrl and shows a "workspace required" state.
  const isWsi = WSI_EXTS.has(ext);

  useEffect(() => {
    if (isWsi) return;
    let cancelled = false;
    contentPromise
      .then(raw => {
        if (cancelled) return;
        setContent(isBinary ? base64ToUint8Array(raw) : raw);
      })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : String(err)); });
    return () => { cancelled = true; };
  }, [contentPromise, isBinary, isWsi]);

  const handleSave = useCallback(async (edited: string) => {
    if (!saveContent) return;
    await saveContent(edited);
    setContent(edited);
  }, [saveContent]);

  // Intercept smarts-bio: scheme links (e.g. the "Sign in" link in the analysis
  // error panel). React's onClick fires before browser default, so preventDefault
  // suppresses the no-op custom-protocol navigation attempt.
  const handleClick = useCallback((e: React.MouseEvent) => {
    if (!onCommand) return;
    const a = (e.target as HTMLElement).closest('a');
    if (!a) return;
    const href = a.getAttribute('href') ?? '';
    if (href.startsWith('smarts-bio:')) {
      e.preventDefault();
      onCommand(href.slice('smarts-bio:'.length));
    }
  }, [onCommand]);

  if (error)            return <ViewerShell error={error} isDark={isDark} />;

  // WSI local: never downloadable — show an informative message instead.
  if (isWsi) {
    return (
      <WsiLocalMessage
        isDark={isDark}
        isAuthenticated={isAuthenticated}
        onSignIn={onCommand ? () => onCommand('sign-in') : undefined}
      />
    );
  }

  if (content === null) return <ViewerShell loading       isDark={isDark} />;

  return (
    <div style={{ height: '100%' }} onClick={handleClick}>
      {renderViewer(fileName, ext, content, {
        onSave:    saveContent ? handleSave : undefined,
        onAnalyze,
      })}
    </div>
  );
}

// ── ReactWidget wrapper ────────────────────────────────────────────────────────

class LocalViewerWidget extends ReactWidget {
  private _fileName:        string;
  private _ext:             string;
  private _isBinary:        boolean;
  private _contentPromise:  Promise<string>;
  private _saveContent:     ((text: string) => Promise<void>) | null;
  private _onAnalyze:       ((...args: unknown[]) => AsyncIterable<{ event: string; data: Record<string, unknown> }>) | undefined;
  private _onCommand:       ((cmd: string) => void) | undefined;
  private _isAuthenticated: boolean;

  constructor(
    fileName:        string,
    ext:             string,
    isBinary:        boolean,
    contentPromise:  Promise<string>,
    saveContent:     ((text: string) => Promise<void>) | null,
    onAnalyze:       ((...args: unknown[]) => AsyncIterable<{ event: string; data: Record<string, unknown> }>) | undefined,
    onCommand:       ((cmd: string) => void) | undefined,
    isAuthenticated: boolean,
  ) {
    super();
    this._fileName        = fileName;
    this._ext             = ext;
    this._isBinary        = isBinary;
    this._contentPromise  = contentPromise;
    this._saveContent     = saveContent;
    this._onAnalyze       = onAnalyze;
    this._onCommand       = onCommand;
    this._isAuthenticated = isAuthenticated;
    this.addClass('smarts-bio-panel');
  }

  protected render(): React.ReactElement {
    return (
      <LocalViewerPane
        fileName={this._fileName}
        ext={this._ext}
        isBinary={this._isBinary}
        contentPromise={this._contentPromise}
        saveContent={this._saveContent}
        onAnalyze={this._onAnalyze}
        onCommand={this._onCommand}
        isAuthenticated={this._isAuthenticated}
      />
    );
  }
}

// ── Widget factory ─────────────────────────────────────────────────────────────

export class ViewerWidgetFactory extends ABCWidgetFactory<
  DocumentWidget<LocalViewerWidget>,
  DocumentRegistry.IModel
> {
  private _client: SmartsBioClient | undefined;
  private _auth:   AuthProvider    | undefined;

  constructor(options: LocalViewerFactoryOptions) {
    super(options);
    this._client = options.client;
    this._auth   = options.auth;
  }

  protected createNewWidget(
    context: DocumentRegistry.IContext<DocumentRegistry.IModel>,
  ): DocumentWidget<LocalViewerWidget> {
    const fileName = context.path.split('/').pop() ?? context.path;
    const ext      = '.' + (fileName.split('.').pop()?.toLowerCase() ?? '');
    const isBinary = LOCAL_BINARY_EXTS.has(ext);

    // For text files the 'text' model returns UTF-8 content.
    // For binary files the 'base64' model (BinaryViewerWidgetFactory) returns a
    // raw base64 string — LocalViewerPane decodes it to Uint8Array.
    const contentPromise = context.ready.then(() => context.model.toString());

    const saveContent = isBinary
      ? null
      : async (text: string) => {
          context.model.fromString(text);
          await context.save();
        };

    const client    = this._client;
    const auth      = this._auth;
    const viewerType = extToViewerType(ext);

    // onAnalyze: same pattern as VS Code's LocalViewerProvider.
    // Posts file content to /v1/analytics/stream and streams SSE analysis events.
    //
    // SequenceViewer calls: onAnalyze(sequenceType, fastaDataUri, signal)
    //   args[0] = 'dna' | 'rna' | 'protein'
    //   args[1] = data:text/plain;base64,<base64(selectedFasta)>
    //   args[2] = AbortSignal
    // Other viewers: onAnalyze(signal?) or no args
    const onAnalyze = client
      ? async function* (...args: unknown[]) {
          if (auth && !auth.isAuthenticated) {
            yield {
              event: 'error' as const,
              data: { auth_required: true, message: 'Sign in to smarts.bio to analyze files.', register_url: 'smarts-bio:sign-in' },
            };
            return;
          }

          const sequenceType = typeof args[0] === 'string' ? args[0] : undefined;
          const dataUri = typeof args[1] === 'string' && (args[1] as string).startsWith('data:') ? args[1] as string : undefined;
          const signal = args[2] instanceof AbortSignal ? args[2] as AbortSignal
                       : args[0] instanceof AbortSignal ? args[0] as AbortSignal : undefined;
          const parameters: Record<string, unknown> = sequenceType ? { sequence_type: sequenceType } : {};

          let sendContent: string;
          let sendIsBinary = isBinary;

          if (dataUri) {
            // SequenceViewer already prepared the selected sequence — use it directly
            // instead of reading the full (possibly huge) file from disk.
            const b64 = dataUri.split(',')[1] ?? '';
            try {
              sendContent = atob(b64);
              sendIsBinary = false;
            } catch {
              try { sendContent = await contentPromise; }
              catch (err) { yield { event: 'error' as const, data: { message: (err as Error)?.message ?? 'Failed to read file.' } }; return; }
            }
          } else {
            try { sendContent = await contentPromise; }
            catch (err) { yield { event: 'error' as const, data: { message: (err as Error)?.message ?? 'Failed to read file.' } }; return; }
          }

          yield* client.streamAnalysisLocal(sendContent, sendIsBinary, fileName, viewerType, parameters, signal);
        }
      : undefined;

    // Convert smarts-bio: URI scheme links (e.g. the sign-in link in the analysis
    // error panel) into real actions — same role as vscode-command: in VS Code.
    const onCommand = auth
      ? (cmd: string) => { if (cmd === 'sign-in') auth.signIn(); }
      : undefined;

    const content = new LocalViewerWidget(fileName, ext, isBinary, contentPromise, saveContent, onAnalyze, onCommand, auth?.isAuthenticated ?? false);

    const widget = new DocumentWidget({ content, context });
    widget.title.label    = fileName;
    widget.title.closable = true;

    return widget;
  }
}
