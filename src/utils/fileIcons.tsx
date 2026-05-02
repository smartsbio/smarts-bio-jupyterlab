/**
 * Shared file-type icon renderers used by the smarts.bio FILES panel.
 * renderFileIcon delegates to getFileIconSvg from @smartsbio/ui so the FILES panel
 * always renders identical icons to the VS Code explorer and JupyterLab file browser.
 */
import React from 'react';
import { Folder2, ChevronRight, ChevronDown, CloudUpload } from 'react-bootstrap-icons';
import { getFileIconSvg, SVG_ICON_COLORS } from '@smartsbio/ui';

export function DnaIcon({ size = 14, color = 'currentColor' }: { size?: number; color?: string }): React.ReactElement {
  const svgStr = getFileIconSvg('fasta', size).replace(/fill="[^"]*"/, `fill="${color}"`);
  return <span dangerouslySetInnerHTML={{ __html: svgStr }} style={{ display: 'inline-flex', flexShrink: 0, lineHeight: 0 }} />;
}

export type IconRenderer = (size: number, color: string) => React.ReactElement;

const svgIcon = (ext: string): IconRenderer =>
  (size) => <span dangerouslySetInnerHTML={{ __html: getFileIconSvg(ext, size) }} style={{ display: 'inline-flex', flexShrink: 0, lineHeight: 0 }} />;

export const EXT_ICON: Record<string, IconRenderer> = {
  fasta: svgIcon('fasta'), fa: svgIcon('fa'), fna: svgIcon('fna'), ffn: svgIcon('ffn'),
  faa: svgIcon('faa'), frn: svgIcon('frn'), fastq: svgIcon('fastq'), fq: svgIcon('fq'),
  gb: svgIcon('gb'), gbk: svgIcon('gbk'), genbank: svgIcon('genbank'),
  bam: svgIcon('bam'), sam: svgIcon('sam'), cram: svgIcon('cram'), bai: svgIcon('bai'),
  vcf: svgIcon('vcf'), bcf: svgIcon('bcf'), bed: svgIcon('bed'),
  pdb: svgIcon('pdb'), ent: svgIcon('ent'), cif: svgIcon('cif'), mmcif: svgIcon('mmcif'),
  mol: svgIcon('mol'), sdf: svgIcon('sdf'), smi: svgIcon('smi'), smiles: svgIcon('smiles'),
  mol2: svgIcon('mol2'), xyz: svgIcon('xyz'), inchi: svgIcon('inchi'), xpr: svgIcon('xpr'),
  csv: svgIcon('csv'), tsv: svgIcon('tsv'), xlsx: svgIcon('xlsx'), xls: svgIcon('xls'),
  py: svgIcon('py'), pyw: svgIcon('pyw'), ipynb: svgIcon('ipynb'), r: svgIcon('r'),
  rmd: svgIcon('rmd'), js: svgIcon('js'), ts: svgIcon('ts'), sh: svgIcon('sh'), bash: svgIcon('bash'),
  json: svgIcon('json'),
  yaml: svgIcon('yaml'), yml: svgIcon('yml'), toml: svgIcon('toml'), xml: svgIcon('xml'),
  txt: svgIcon('txt'), md: svgIcon('md'), rst: svgIcon('rst'), docx: svgIcon('docx'),
  pdf: svgIcon('pdf'),
  png: svgIcon('png'), jpg: svgIcon('jpg'), jpeg: svgIcon('jpeg'), gif: svgIcon('gif'),
  tif: svgIcon('tif'), tiff: svgIcon('tiff'), webp: svgIcon('webp'), bmp: svgIcon('bmp'),
  svg: svgIcon('svg'),
  gz: svgIcon('gz'), zip: svgIcon('zip'), tar: svgIcon('tar'), bz2: svgIcon('bz2'),
};

export const ICON_COLORS: Record<string, string> = { ...SVG_ICON_COLORS };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Folder2Icon = Folder2 as any;

/** Render the right icon for a file extension at the given size. */
export function renderFileIcon(name: string, isDirectory: boolean, size = 14): React.ReactElement {
  if (isDirectory) return <Folder2Icon size={size} color="var(--jp-warn-color1, #e8a838)" />;
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  const svgStr = getFileIconSvg(ext, size);
  return <span dangerouslySetInnerHTML={{ __html: svgStr }} style={{ display: 'inline-flex', flexShrink: 0, lineHeight: 0 }} />;
}

export { CloudUpload, ChevronRight, ChevronDown, Folder2 };
