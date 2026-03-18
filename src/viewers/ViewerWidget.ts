// NOTE: JupyterLab-specific — replaces VS Code ViewerPanel (WebviewPanel + iframe).
// Uses MainAreaWidget with an iframe (srcdoc) to run bioinformatics viewers.
// No IGV.js — all text-based formats are pre-fetched through the API gateway
// (avoids S3 CORS entirely). Binary formats show a download prompt.
import { MainAreaWidget } from '@jupyterlab/apputils';
import { Widget } from '@lumino/widgets';
import { SmartsBioClient } from '../api/SmartsBioClient';
import { sequenceHtml } from './sequenceViewer';
import { structureHtml } from './structureViewer';
import { alignmentHtml } from './alignmentViewer';
import { variantHtml } from './variantViewer';
import { csvHtml } from './csvViewer';

const SEQUENCE_EXTS = new Set(['.fasta', '.fa', '.fna', '.ffn', '.faa', '.frn', '.fastq', '.fq']);
const STRUCTURE_EXTS = new Set(['.pdb', '.cif', '.mmcif']);
const ALIGNMENT_EXTS = new Set(['.sam', '.bam', '.cram']);
const VARIANT_EXTS  = new Set(['.vcf', '.bcf', '.bed']);
const CSV_EXTS      = new Set(['.csv', '.tsv']);
// Binary compressed formats that have no viewer — cannot be displayed as text
// .bam is handled separately via base64 → alignmentViewer (same as VS Code)
const BINARY_EXTS   = new Set(['.cram', '.bcf', '.bw', '.bigwig']);

function binaryUnsupportedHtml(fileName: string): string {
  return `<html><body style="font-family:system-ui,sans-serif;padding:32px;text-align:center;color:#ccc;background:#1e1e1e">
    <div style="font-size:40px;margin-bottom:16px">📦</div>
    <p style="font-size:16px;font-weight:600;color:#fff">${fileName}</p>
    <p style="font-size:13px;color:#9ca3af;max-width:380px;margin:0 auto;line-height:1.6">
      This is a binary compressed format and cannot be previewed as text.<br>
      Download the file and open it with IGV, samtools, or a compatible tool.
    </p>
  </body></html>`;
}

/**
 * Determine which viewer to use and fetch the file content.
 * Returns the HTML string for the iframe srcdoc.
 */
/** Detect the current JupyterLab theme. */
function detectIsDark(): boolean {
  return document.body.getAttribute('data-jp-theme-light') !== 'true';
}

export async function buildViewerHtml(
  fileKey: string,
  fileName: string,
  ext: string,
  client: SmartsBioClient,
  workspaceId: string,
): Promise<string> {
  const lext = ext.toLowerCase();
  const isDark = detectIsDark();

  // Binary formats — no viewer, just a friendly message
  if (BINARY_EXTS.has(lext)) {
    return binaryUnsupportedHtml(fileName);
  }

  // BAM: fetch as base64 binary and pass to alignmentViewer (same approach as VS Code)
  if (lext === '.bam') {
    const fileData = await client.getFileContent(fileKey, workspaceId, true);
    return alignmentHtml(fileName, lext, fileData, isDark);
  }

  // All other viewers: pre-fetch content as text through the API gateway
  const fileData = await client.getFileContent(fileKey, workspaceId, false);

  if (SEQUENCE_EXTS.has(lext)) {
    return sequenceHtml(fileName, fileData, isDark);
  }
  if (STRUCTURE_EXTS.has(lext)) {
    return structureHtml(fileName, lext, fileData, isDark);
  }
  if (ALIGNMENT_EXTS.has(lext)) {
    return alignmentHtml(fileName, lext, fileData, isDark);
  }
  if (VARIANT_EXTS.has(lext)) {
    return variantHtml(fileName, fileData, isDark);
  }
  if (CSV_EXTS.has(lext)) {
    return csvHtml(fileName, lext, fileData, isDark);
  }

  // Fallback: plain text viewer
  const bg = isDark ? '#1e1e1e' : '#ffffff';
  const fg = isDark ? '#d4d4d4' : '#1a1a1a';
  return `<html><body style="font-family:monospace;padding:16px;white-space:pre-wrap;word-break:break-all;background:${bg};color:${fg}">
    ${fileData.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
  </body></html>`;
}

/**
 * Open a file viewer in the JupyterLab main area.
 * Creates a MainAreaWidget containing an iframe with the viewer HTML.
 */
export async function openViewerWidget(
  fileKey: string,
  fileName: string,
  ext: string,
  client: SmartsBioClient,
  workspaceId: string,
): Promise<MainAreaWidget<Widget>> {
  const html = await buildViewerHtml(fileKey, fileName, ext, client, workspaceId);

  const iframe = document.createElement('iframe');
  iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin');
  iframe.style.cssText = 'width:100%;height:100%;border:none;display:block;';
  iframe.srcdoc = html;

  const content = new Widget({ node: document.createElement('div') });
  content.node.style.cssText = 'width:100%;height:100%;overflow:hidden;';
  content.node.appendChild(iframe);

  const widget = new MainAreaWidget({ content });
  widget.title.label = fileName;
  widget.title.closable = true;
  widget.title.iconClass = 'jp-bioinfoIcon';

  return widget;
}
