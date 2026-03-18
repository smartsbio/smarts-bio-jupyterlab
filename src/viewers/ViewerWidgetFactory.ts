// NOTE: JupyterLab-specific — integrates with IDocumentRegistry so double-clicking
// bioinformatics files in the JupyterLab file browser opens the custom viewer.
import { ABCWidgetFactory, DocumentRegistry, DocumentWidget } from '@jupyterlab/docregistry';
import { Widget } from '@lumino/widgets';

/**
 * Widget factory for local bioinformatics files opened via the JupyterLab file browser.
 * For smarts.bio remote files use the smarts-bio:open-file-viewer command instead.
 */
export class ViewerWidgetFactory extends ABCWidgetFactory<
  DocumentWidget<Widget>,
  DocumentRegistry.IModel
> {
  protected createNewWidget(
    context: DocumentRegistry.IContext<DocumentRegistry.IModel>,
  ): DocumentWidget<Widget> {
    const fileName = context.path.split('/').pop() ?? context.path;
    const ext = '.' + (fileName.split('.').pop()?.toLowerCase() ?? '');

    const iframe = document.createElement('iframe');
    iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin');
    iframe.style.cssText = 'width:100%;height:100%;border:none;display:block;';
    iframe.srcdoc = `<html><body style="font-family:system-ui;padding:20px;color:#888">
      Loading ${fileName}…<br><small>Reading local file content</small>
    </body></html>`;

    const contentDiv = document.createElement('div');
    contentDiv.style.cssText = 'width:100%;height:100%;overflow:hidden;';
    contentDiv.appendChild(iframe);

    const content = new Widget({ node: contentDiv });
    const widget = new DocumentWidget({ content, context });
    widget.title.label = fileName;
    widget.title.closable = true;

    // Load file content once context is ready
    context.ready.then(async () => {
      try {
        const fileData = context.model.toString();
        const { sequenceHtml } = await import('./sequenceViewer');
        const { variantHtml } = await import('./variantViewer');
        const { csvHtml } = await import('./csvViewer');
        const { structureHtml } = await import('./structureViewer');

        const SEQUENCE = new Set(['.fasta', '.fa', '.fna', '.ffn', '.faa', '.frn', '.fastq', '.fq']);
        let html: string;
        if (SEQUENCE.has(ext)) {
          html = sequenceHtml(fileName, fileData);
        } else if (ext === '.vcf') {
          html = variantHtml(fileName, fileData);
        } else if (ext === '.csv' || ext === '.tsv') {
          html = csvHtml(fileName, ext, fileData);
        } else if (ext === '.pdb' || ext === '.cif' || ext === '.mmcif') {
          html = structureHtml(fileName, ext, fileData);
        } else {
          html = `<html><body style="font-family:monospace;padding:16px;white-space:pre-wrap">
            ${fileData.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}
          </body></html>`;
        }
        iframe.srcdoc = html;
      } catch (err: any) {
        iframe.srcdoc = `<html><body style="padding:20px;color:#f85149">Failed to load viewer: ${err?.message ?? err}</body></html>`;
      }
    });

    return widget;
  }
}
