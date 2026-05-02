/**
 * LabIcon instances for bioinformatics file types shown in the JupyterLab file browser.
 * Icons are sourced from @smartsbio/ui's getFileIconSvg so they stay in sync with the
 * VS Code icon theme and the smarts.bio FILES panel.
 */
import { LabIcon } from '@jupyterlab/ui-components';
import { getFileIconSvg } from '@smartsbio/ui';

const labIcon = (name: string, ext: string): LabIcon =>
  new LabIcon({ name: `@smartsbio/jupyterlab-extension:${name}`, svgstr: getFileIconSvg(ext) });

export const sequenceLabIcon  = labIcon('sequence',  'fasta');
export const alignmentLabIcon = labIcon('alignment', 'bam');
export const variantLabIcon   = labIcon('variant',   'vcf');
export const structureLabIcon = labIcon('structure', 'pdb');
export const moleculeLabIcon  = labIcon('molecule',  'mol');
export const xprLabIcon       = labIcon('xpr',       'xpr');
export const tabularLabIcon   = labIcon('tabular',   'csv');
export const xlsxLabIcon      = labIcon('xlsx',      'xlsx');
export const textLabIcon      = labIcon('text',      'md');
export const pdfLabIcon       = labIcon('pdf',       'pdf');
export const imageLabIcon     = labIcon('image',     'png');
export const codeLabIcon      = labIcon('code',      'py');
export const jsonLabIcon      = labIcon('json',      'json');
export const dataLabIcon      = labIcon('data',      'yaml');
export const zipLabIcon       = labIcon('zip',       'gz');
