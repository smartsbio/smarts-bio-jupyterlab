// Shared helper that picks the right @smartsbio/ui viewer component for a given file.
import React from 'react';
import {
  SequenceViewer,
  AlignmentViewer,
  VariantViewer,
  StructureViewer,
  CsvViewer,
  MoleculeViewer,
  DocumentViewer,
  PdfViewer,
  ImageViewer,
  ChartViewer,
  ExperimentViewer,
  SmartsBioProvider,
  ViewerShell,
} from '@smartsbio/ui';

export const SEQUENCE_EXTS    = new Set(['.fasta', '.fa', '.fna', '.ffn', '.faa', '.frn', '.fastq', '.fq']);
export const EXPERIMENT_EXTS  = new Set(['.xpr']);
export const STRUCTURE_EXTS = new Set(['.pdb', '.cif', '.mmcif']);
export const ALIGNMENT_EXTS = new Set(['.sam', '.bam']);
export const VARIANT_EXTS   = new Set(['.vcf', '.bed']);
export const CSV_EXTS       = new Set(['.csv', '.tsv', '.xlsx', '.xls']);
export const MOLECULE_EXTS  = new Set(['.mol', '.sdf', '.mol2', '.xyz', '.smi', '.smiles', '.inchi']);
export const DOCUMENT_EXTS  = new Set(['.md', '.docx']);
export const PDF_EXTS       = new Set(['.pdf']);
export const IMAGE_EXTS     = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.tif', '.tiff', '.bmp', '.ico']);
/** Formats that have no viewer — too binary/compressed to display meaningfully. */
export const BINARY_EXTS    = new Set(['.cram', '.bcf', '.bw', '.bigwig']);

export function detectIsDark(): boolean {
  return document.body.getAttribute('data-jp-theme-light') !== 'true';
}

interface ViewerProps {
  onSave?: (content: string) => Promise<void>;
  onDownload?: () => void;
  onUpload?: () => void;
  onAnalyze?: (...args: unknown[]) => AsyncIterable<{ event: string; data: Record<string, unknown> }>;
  onResolveRef?: (ref: string) => Promise<string | null>;
  onListFiles?: (path?: string) => Promise<{ key: string; name: string; type: 'file' | 'folder' }[]>;
  makeFileUrl?: (fileKey: string) => string;
  workspaceId?: string;
  isAuthenticated?: boolean;
  onExportPdf?: (markdown: string, title: string) => Promise<void>;
}

/** Map file extension to the viewerType expected by bio-analytics. */
export function extToViewerType(ext: string): string {
  if (SEQUENCE_EXTS.has(ext))   return 'sequence';
  if (STRUCTURE_EXTS.has(ext))  return 'structure';
  if (ALIGNMENT_EXTS.has(ext))  return 'alignment';
  if (VARIANT_EXTS.has(ext))    return 'variant';
  if (CSV_EXTS.has(ext))        return 'data';
  if (MOLECULE_EXTS.has(ext))   return 'molecule';
  if (DOCUMENT_EXTS.has(ext))   return 'document';
  if (PDF_EXTS.has(ext))        return 'pdf';
  if (IMAGE_EXTS.has(ext))      return 'image';
  return 'text';
}

/** Return the appropriate @smartsbio/ui viewer React element for the given file. */
export function renderViewer(
  fileName: string,
  ext: string,
  content: string | Uint8Array,
  { onSave, onDownload, onUpload, onAnalyze, onResolveRef, onListFiles, makeFileUrl, workspaceId, isAuthenticated, onExportPdf }: ViewerProps = {},
): React.ReactElement {
  const isDark = detectIsDark();
  const shared = { fileContent: content, fileName, isDark, onSave, onDownload, onUpload, onAnalyze: onAnalyze as any };

  if (SEQUENCE_EXTS.has(ext))    return <SequenceViewer  {...shared} />;
  if (STRUCTURE_EXTS.has(ext))   return <StructureViewer {...shared} />;
  if (ALIGNMENT_EXTS.has(ext))   return <AlignmentViewer {...shared} />;
  if (VARIANT_EXTS.has(ext))     return <VariantViewer   {...shared} />;
  if (CSV_EXTS.has(ext))         return <CsvViewer       {...shared} />;
  if (MOLECULE_EXTS.has(ext))    return <MoleculeViewer  {...shared} />;
  if (DOCUMENT_EXTS.has(ext))    return <DocumentViewer  {...shared} />;
  if (PDF_EXTS.has(ext))         return <PdfViewer       fileContent={content} fileName={fileName} isDark={isDark} onDownload={onDownload} onUpload={onUpload} onAnalyze={onAnalyze as any} />;
  if (IMAGE_EXTS.has(ext))       return <ImageViewer     fileContent={content} fileName={fileName} isDark={isDark} onDownload={onDownload} onUpload={onUpload} onAnalyze={onAnalyze as any} />;

  // Vega-Lite chart: detected by caller via $schema inspection
  if (ext === '.chart') return <ChartViewer fileContent={content as string} fileName={fileName} isDark={isDark} onSave={onSave} onDownload={onDownload} onResolveRef={onResolveRef} onListFiles={onListFiles} makeFileUrl={makeFileUrl} />;

  // Experiment viewer (.xpr): needs SmartsBioProvider for WorkspaceFilePicker
  if (EXPERIMENT_EXTS.has(ext)) {
    const noop = () => Promise.resolve() as any;
    const capabilities: any = {
      sendMessage: noop, fetchFiles: async () => [], getCatalog: async () => ({ tools: [], pipelines: [] }),
      listFiles: onListFiles ? (_wsId: string, path?: string) => onListFiles(path) : async () => [],
      uploadFile: noop, createFolder: noop, deleteFile: noop, renameFile: async () => '',
      getFileDownloadUrl: async () => '', getJobs: async () => [], cancelJob: noop,
      onSignIn: noop, onInsertCode: noop, confirmScript: noop,
    };
    return (
      <SmartsBioProvider value={{ capabilities, workspaceId: workspaceId ?? '', orgId: undefined, profile: null }}>
        <ExperimentViewer
          fileContent={content as string}
          fileName={fileName}
          isDark={isDark}
          onSave={onSave}
          onDownload={onDownload}
          isAuthenticated={isAuthenticated ?? false}
          onResolveRef={onResolveRef}
          onExportPdf={onExportPdf}
        />
      </SmartsBioProvider>
    );
  }

  // Fallback: no visual viewer — open directly in editable text mode
  return (
    <ViewerShell
      fileContent={typeof content === 'string' ? content : new TextDecoder().decode(content)}
      fileName={fileName}
      isDark={isDark}
      initialTextMode
      onSave={onSave}
      onDownload={onDownload}
    />
  );
}
