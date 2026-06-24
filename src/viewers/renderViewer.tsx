// Shared helper that picks the right @smartsbio/ui viewer component for a given file.
import React from 'react';
import {
  SequenceViewer,
  AlignmentViewer,
  VariantViewer,
  StructureViewer,
  CsvViewer,
  MoleculeViewer,
  StructuredViewer,
  DocumentViewer,
  PdfViewer,
  ImageViewer,
  DicomViewer,
  ChartViewer,
  ExperimentViewer,
  TreeViewer,
  GenBankViewer,
  GoaViewer,
  WsiViewer,
  SmartsBioProvider,
  ViewerShell,
} from '@smartsbio/ui';
import type { WsiMeta } from '@smartsbio/ui';

export const SEQUENCE_EXTS    = new Set(['.fasta', '.fa', '.fna', '.ffn', '.faa', '.frn', '.fastq', '.fq']);
export const GENBANK_EXTS     = new Set(['.gb', '.gbk', '.gbff', '.genbank']);
export const GOA_EXTS         = new Set(['.goa', '.gaf']);
export const EXPERIMENT_EXTS  = new Set(['.xpr']);
export const STRUCTURE_EXTS = new Set(['.pdb', '.cif', '.mmcif']);
export const ALIGNMENT_EXTS = new Set(['.sam', '.bam']);
export const VARIANT_EXTS   = new Set(['.vcf', '.bed']);
export const CSV_EXTS       = new Set(['.csv', '.tsv', '.xlsx', '.xls']);
export const MOLECULE_EXTS  = new Set(['.mol', '.sdf', '.mol2', '.xyz', '.smi', '.smiles', '.inchi']);
export const STRUCTURED_EXTS = new Set(['.json', '.jsonc', '.jsonl', '.ndjson', '.geojson', '.xml', '.gpx', '.kml', '.rss', '.atom']);
export const TREE_EXTS      = new Set(['.nwk', '.tree', '.phy', '.tre', '.newick']);
export const DOCUMENT_EXTS  = new Set(['.md', '.docx']);
export const PDF_EXTS       = new Set(['.pdf']);
export const IMAGE_EXTS     = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.tif', '.tiff', '.bmp', '.ico']);
/** Formats that have no viewer — too binary/compressed to display meaningfully. */
export const BINARY_EXTS    = new Set(['.cram', '.bcf', '.bw', '.bigwig']);
/** Whole Slide Images — tile-server required, never downloaded directly. */
export const WSI_EXTS       = new Set(['.svs', '.ndpi', '.scn', '.mrxs', '.vms', '.vmu', '.bif']);
/** DICOM medical imaging files — fetched as binary and rendered by DicomViewer. */
export const DICOM_EXTS     = new Set(['.dcm', '.dicom']);

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
  /** WsiViewer: called with the presigned file URL; returns WsiMeta from bio-analytics. */
  onOpenFile?: (fileUrl: string) => Promise<WsiMeta>;
  /** WsiViewer: direct URL of the bio-analytics tile server (no auth needed for tiles). */
  tileServerUrl?: string;
  /** WsiViewer: presigned S3 URL for the WSI file — passed as fileUrl prop. */
  fileUrl?: string;
}

/** Map file extension to the viewerType expected by bio-analytics. */
export function extToViewerType(ext: string): string {
  if (GENBANK_EXTS.has(ext))    return 'genbank';
  if (GOA_EXTS.has(ext))        return 'goa';
  if (SEQUENCE_EXTS.has(ext))   return 'sequence';
  if (STRUCTURE_EXTS.has(ext))  return 'structure';
  if (ALIGNMENT_EXTS.has(ext))  return 'alignment';
  if (VARIANT_EXTS.has(ext))    return 'variant';
  if (CSV_EXTS.has(ext))        return 'data';
  if (MOLECULE_EXTS.has(ext))   return 'molecule';
  if (STRUCTURED_EXTS.has(ext)) return 'structured';
  if (TREE_EXTS.has(ext))       return 'tree';
  if (DOCUMENT_EXTS.has(ext))   return 'document';
  if (PDF_EXTS.has(ext))        return 'pdf';
  if (IMAGE_EXTS.has(ext))      return 'image';
  if (WSI_EXTS.has(ext))        return 'wsi';
  if (DICOM_EXTS.has(ext))      return 'dicom';
  return 'text';
}

/** Return the appropriate @smartsbio/ui viewer React element for the given file. */
export function renderViewer(
  fileName: string,
  ext: string,
  content: string | Uint8Array,
  { onSave, onDownload, onUpload, onAnalyze, onResolveRef, onListFiles, makeFileUrl, workspaceId, isAuthenticated, onExportPdf, onOpenFile, tileServerUrl, fileUrl }: ViewerProps = {},
): React.ReactElement {
  const isDark = detectIsDark();
  const shared = { fileContent: content, fileName, isDark, onSave, onDownload, onUpload, onAnalyze: onAnalyze as any };

  if (GENBANK_EXTS.has(ext))     return <GenBankViewer   {...shared} />;
  if (GOA_EXTS.has(ext))         return <GoaViewer        {...shared} />;
  if (SEQUENCE_EXTS.has(ext))    return <SequenceViewer  {...shared} />;
  if (STRUCTURE_EXTS.has(ext))   return <StructureViewer {...shared} />;
  if (ALIGNMENT_EXTS.has(ext))   return <AlignmentViewer {...shared} />;
  if (VARIANT_EXTS.has(ext))     return <VariantViewer   {...shared} />;
  if (CSV_EXTS.has(ext))         return <CsvViewer       {...shared} />;
  if (MOLECULE_EXTS.has(ext))    return <MoleculeViewer  {...shared} />;
  if (STRUCTURED_EXTS.has(ext))  return <StructuredViewer {...shared} />;
  if (TREE_EXTS.has(ext))        return <TreeViewer       {...shared} />;
  if (DOCUMENT_EXTS.has(ext))    return <DocumentViewer  {...shared} />;
  if (PDF_EXTS.has(ext))         return <PdfViewer       fileContent={content} fileName={fileName} isDark={isDark} onDownload={onDownload} onUpload={onUpload} onAnalyze={onAnalyze as any} />;
  if (IMAGE_EXTS.has(ext))       return <ImageViewer     fileContent={content} fileName={fileName} isDark={isDark} onDownload={onDownload} onUpload={onUpload} onAnalyze={onAnalyze as any} />;
  if (DICOM_EXTS.has(ext))       return <DicomViewer     fileContent={content as Uint8Array} fileName={fileName} isDark={isDark} onDownload={onDownload} />;

  // WSI: tile-server based viewer — never uses file content, needs presigned URL + tile server.
  // When opened from a workspace, fileUrl is the presigned S3 URL and onOpenFile calls bio-analytics
  // to register the slide and return WsiMeta (wsi_id). Without a workspace (local files), the
  // viewer renders with an empty fileUrl and shows a "workspace required" state.
  if (WSI_EXTS.has(ext)) {
    return (
      <WsiViewer
        fileUrl={fileUrl ?? ''}
        onOpenFile={onOpenFile ?? (async () => ({} as WsiMeta))}
        tileServerUrl={tileServerUrl ?? ''}
        isDark={isDark}
        fileName={fileName}
      />
    );
  }

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
