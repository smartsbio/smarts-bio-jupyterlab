/**
 * Shared file-type icon renderers used by FilesPanel and AtFileDropdown.
 * DNA icon is from Font Awesome Free 5.15.4 (CC BY 4.0), inlined to avoid an extra dependency.
 */
import React from 'react';
import {
  Icon,
  Folder2, ChevronRight, ChevronDown,
  Virus, BarChartSteps, Pentagon, CloudUpload,
  Grid3x3, FileEarmarkSpreadsheet,
  FileEarmarkCode, FileEarmarkText, FileEarmarkPdf,
  FileEarmarkImage, FileEarmarkZip, FileEarmark,
  Braces,
} from 'react-bootstrap-icons';

// ── Font Awesome DNA helix (CC BY 4.0) ──────────────────────────────────────
const FA_DNA_PATH =
  'M.1 494.1c-1.1 9.5 6.3 17.8 15.9 17.8l32.3.1c8.1 0 14.9-5.9 16-13.9.7-4.9 1.8-11.1' +
  ' 3.4-18.1H380c1.6 6.9 2.9 13.2 3.5 18.1 1.1 8 7.9 14 16 13.9l32.3-.1c9.6 0 17.1-8.3' +
  ' 15.9-17.8-4.6-37.9-25.6-129-118.9-207.7-17.6 12.4-37.1 24.2-58.5 35.4 6.2 4.6 11.4' +
  ' 9.4 17 14.2H159.7c21.3-18.1 47-35.6 78.7-51.4C410.5 199.1 442.1 65.8 447.9 17.9 449' +
  ' 8.4 441.6.1 432 .1L399.6 0c-8.1 0-14.9 5.9-16 13.9-.7 4.9-1.8 11.1-3.4 18.1H67.8c' +
  '-1.6-7-2.7-13.1-3.4-18.1-1.1-8-7.9-14-16-13.9L16.1.1C6.5.1-1 8.4.1 17.9 5.3 60.8' +
  ' 31.4 171.8 160 256 31.5 340.2 5.3 451.2.1 494.1zM224 219.6c-25.1-13.7-46.4-28.4' +
  '-64.3-43.6h128.5c-17.8 15.2-39.1 30-64.2 43.6zM355.1 96c-5.8 10.4-12.8 21.1-21' +
  ' 32H114c-8.3-10.9-15.3-21.6-21-32h262.1zM92.9 416c5.8-10.4 12.8-21.1 21-32h219.4c' +
  '8.3 10.9 15.4 21.6 21.2 32H92.9z';

export function DnaIcon({ size = 14, color = 'currentColor' }: { size?: number; color?: string }): React.ReactElement {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" width={size} height={size} fill={color} style={{ flexShrink: 0, display: 'inline-block' }}>
      <path d={FA_DNA_PATH} />
    </svg>
  );
}

// ── Icon renderer type ───────────────────────────────────────────────────────
export type IconRenderer = (size: number, color: string) => React.ReactElement;

const bi = (C: Icon): IconRenderer => (size, color) => <C size={size} color={color} />;
const dna: IconRenderer = (size, color) => <DnaIcon size={size} color={color} />;

// ── Extension → renderer map ─────────────────────────────────────────────────
export const EXT_ICON: Record<string, IconRenderer> = {
  // Sequence — Font Awesome DNA helix
  fasta: dna, fa: dna, fna: dna, ffn: dna, faa: dna, frn: dna, fastq: dna, fq: dna,
  // Alignment
  bam: bi(BarChartSteps), sam: bi(BarChartSteps), cram: bi(BarChartSteps),
  // Variant / interval
  vcf: bi(Virus), bcf: bi(Virus), bed: bi(Virus),
  // Structure
  pdb: bi(Pentagon), cif: bi(Pentagon), mmcif: bi(Pentagon),
  // Tabular
  csv: bi(Grid3x3), tsv: bi(Grid3x3),
  // Code / notebook
  py: bi(FileEarmarkCode), ipynb: bi(FileEarmarkCode), r: bi(FileEarmarkCode),
  js: bi(FileEarmarkCode), ts: bi(FileEarmarkCode), sh: bi(FileEarmarkCode),
  // Data
  json: bi(Braces), yaml: bi(FileEarmarkSpreadsheet), yml: bi(FileEarmarkSpreadsheet),
  toml: bi(FileEarmarkSpreadsheet), xml: bi(FileEarmarkSpreadsheet),
  // Docs
  txt: bi(FileEarmarkText), md: bi(FileEarmarkText), rst: bi(FileEarmarkText),
  // PDF
  pdf: bi(FileEarmarkPdf),
  // Images
  png: bi(FileEarmarkImage), jpg: bi(FileEarmarkImage), jpeg: bi(FileEarmarkImage),
  svg: bi(FileEarmarkImage), gif: bi(FileEarmarkImage), tiff: bi(FileEarmarkImage),
  // Archives
  gz: bi(FileEarmarkZip), zip: bi(FileEarmarkZip), tar: bi(FileEarmarkZip), bz2: bi(FileEarmarkZip),
};

export const ICON_COLORS: Record<string, string> = {
  fasta: '#4ade80', fa: '#4ade80', fna: '#4ade80', ffn: '#4ade80',
  faa: '#4ade80', frn: '#4ade80', fastq: '#4ade80', fq: '#4ade80',
  bam: '#60a5fa', sam: '#60a5fa', cram: '#60a5fa',
  vcf: '#f472b6', bcf: '#f472b6', bed: '#f472b6',
  pdb: '#c084fc', cif: '#c084fc', mmcif: '#c084fc',
  json: '#fb923c',
  csv: '#34d399', tsv: '#34d399',
  py: '#facc15', ipynb: '#facc15',
  pdf: '#f87171',
};

/** Render the right icon for a file extension at the given size. */
export function renderFileIcon(name: string, isDirectory: boolean, size = 14): React.ReactElement {
  if (isDirectory) return <Folder2 size={size} color="var(--jp-warn-color1, #e8a838)" />;
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  const render = EXT_ICON[ext] ?? bi(FileEarmark);
  const color = ICON_COLORS[ext] ?? 'var(--vscode-descriptionForeground, #888)';
  return render(size, color);
}

// Re-export utility icons used by both panels
export { CloudUpload, ChevronRight, ChevronDown, Folder2 };
