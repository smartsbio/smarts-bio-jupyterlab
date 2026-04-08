// Shared helper that picks the right @smartsbio/ui viewer component for a given file.
import React from 'react';
import {
  SequenceViewer,
  AlignmentViewer,
  VariantViewer,
  StructureViewer,
  CsvViewer,
  DocumentViewer,
  PdfViewer,
  ViewerShell,
} from '@smartsbio/ui';

export const SEQUENCE_EXTS  = new Set(['.fasta', '.fa', '.fna', '.ffn', '.faa', '.frn', '.fastq', '.fq']);
export const STRUCTURE_EXTS = new Set(['.pdb', '.cif', '.mmcif']);
export const ALIGNMENT_EXTS = new Set(['.sam', '.bam']);
export const VARIANT_EXTS   = new Set(['.vcf', '.bed']);
export const CSV_EXTS       = new Set(['.csv', '.tsv', '.xlsx', '.xls']);
export const DOCUMENT_EXTS  = new Set(['.md', '.docx']);
export const PDF_EXTS       = new Set(['.pdf']);
/** Formats that have no viewer — too binary/compressed to display meaningfully. */
export const BINARY_EXTS    = new Set(['.cram', '.bcf', '.bw', '.bigwig']);

export function detectIsDark(): boolean {
  return document.body.getAttribute('data-jp-theme-light') !== 'true';
}

interface ViewerProps {
  onSave?: (content: string) => Promise<void>;
  onDownload?: () => void;
  onUpload?: () => void;
}

/** Return the appropriate @smartsbio/ui viewer React element for the given file. */
export function renderViewer(
  fileName: string,
  ext: string,
  content: string | Uint8Array,
  { onSave, onDownload, onUpload }: ViewerProps = {},
): React.ReactElement {
  const isDark = detectIsDark();
  const shared = { fileContent: content, fileName, isDark, onSave, onDownload, onUpload };

  if (SEQUENCE_EXTS.has(ext))  return <SequenceViewer  {...shared} />;
  if (STRUCTURE_EXTS.has(ext)) return <StructureViewer {...shared} />;
  if (ALIGNMENT_EXTS.has(ext)) return <AlignmentViewer {...shared} />;
  if (VARIANT_EXTS.has(ext))   return <VariantViewer   {...shared} />;
  if (CSV_EXTS.has(ext))       return <CsvViewer       {...shared} />;
  if (DOCUMENT_EXTS.has(ext))  return <DocumentViewer  {...shared} />;
  if (PDF_EXTS.has(ext))       return <PdfViewer       fileContent={content} fileName={fileName} isDark={isDark} onDownload={onDownload} onUpload={onUpload} />;

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
