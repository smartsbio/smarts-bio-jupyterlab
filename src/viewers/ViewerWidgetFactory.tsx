// Local file viewer factory — integrates with IDocumentRegistry so double-clicking
// a bioinformatics file in the JupyterLab file browser opens the @smartsbio/ui viewer.
import React, { useState, useEffect, useCallback } from 'react';
import { ReactWidget } from '@jupyterlab/apputils';
import { ABCWidgetFactory, DocumentRegistry, DocumentWidget } from '@jupyterlab/docregistry';
import { ViewerShell } from '@smartsbio/ui';
import { detectIsDark, renderViewer } from './renderViewer';

// ── Local viewer pane ─────────────────────────────────────────────────────────

function LocalViewerPane({
  fileName,
  ext,
  getContent,
  saveContent,
}: {
  fileName: string;
  ext: string;
  getContent: () => string;
  saveContent: (text: string) => Promise<void>;
}): React.ReactElement {
  const [content, setContent] = useState<string | null>(null);
  const [error, setError]     = useState<string | null>(null);
  const isDark = detectIsDark();

  useEffect(() => {
    try {
      setContent(getContent());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [getContent]);

  const handleSave = useCallback(async (edited: string) => {
    await saveContent(edited);
    setContent(edited);
  }, [saveContent]);

  if (error)            return <ViewerShell error={error} isDark={isDark} />;
  if (content === null) return <ViewerShell loading       isDark={isDark} />;

  return renderViewer(fileName, ext, content, { onSave: handleSave });
}

// ── ReactWidget wrapper ────────────────────────────────────────────────────────

class LocalViewerWidget extends ReactWidget {
  private _fileName: string;
  private _ext: string;
  private _getContent: () => string;
  private _saveContent: (text: string) => Promise<void>;

  constructor(
    fileName: string,
    ext: string,
    getContent: () => string,
    saveContent: (text: string) => Promise<void>,
  ) {
    super();
    this._fileName    = fileName;
    this._ext         = ext;
    this._getContent  = getContent;
    this._saveContent = saveContent;
    this.addClass('smarts-bio-panel');
  }

  protected render(): React.ReactElement {
    return (
      <LocalViewerPane
        fileName={this._fileName}
        ext={this._ext}
        getContent={this._getContent}
        saveContent={this._saveContent}
      />
    );
  }
}

// ── Widget factory ─────────────────────────────────────────────────────────────

export class ViewerWidgetFactory extends ABCWidgetFactory<
  DocumentWidget<LocalViewerWidget>,
  DocumentRegistry.IModel
> {
  protected createNewWidget(
    context: DocumentRegistry.IContext<DocumentRegistry.IModel>,
  ): DocumentWidget<LocalViewerWidget> {
    const fileName = context.path.split('/').pop() ?? context.path;
    const ext      = '.' + (fileName.split('.').pop()?.toLowerCase() ?? '');

    const content = new LocalViewerWidget(
      fileName,
      ext,
      // getContent is called lazily from useEffect, after context.ready
      () => context.model.toString(),
      // saveContent writes back to the document model and triggers JupyterLab's save
      async (text: string) => {
        context.model.fromString(text);
        await context.save();
      },
    );

    const widget = new DocumentWidget({ content, context });
    widget.title.label    = fileName;
    widget.title.closable = true;

    // Trigger a re-render once the file content is available
    void context.ready.then(() => content.update());

    return widget;
  }
}
