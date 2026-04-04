// NOTE: JupyterLab-specific — provides active notebook cell content as context for chat.
import { INotebookTracker } from '@jupyterlab/notebook';
import type { ContextAttachment } from '@smartsbio/ui';

export class CellContextProvider {
  constructor(private readonly notebookTracker: INotebookTracker | null) {}

  /** Returns the content of the currently active notebook cell as a ContextAttachment. */
  getActiveCellContext(): ContextAttachment | null {
    const notebook = this.notebookTracker?.currentWidget?.content;
    if (!notebook) return null;

    const activeCell = notebook.activeCell;
    if (!activeCell) return null;

    const cellType = activeCell.model.type;
    const content = activeCell.model.sharedModel.getSource();
    if (!content.trim()) return null;

    const notebookName = this.notebookTracker?.currentWidget?.title.label ?? 'Notebook';
    const cellIndex = notebook.activeCellIndex;
    const label = `${notebookName} · Cell ${cellIndex + 1} (${cellType})`;

    return {
      type: 'selection',
      label,
      content,
    };
  }

  /** Returns the visible outputs of the active cell as a ContextAttachment. */
  getActiveCellOutputContext(): ContextAttachment | null {
    const notebook = this.notebookTracker?.currentWidget?.content;
    if (!notebook) return null;

    const activeCell = notebook.activeCell;
    if (!activeCell || activeCell.model.type !== 'code') return null;

    // @ts-ignore — CodeCellModel has outputs
    const outputs = activeCell.model.outputs;
    if (!outputs || outputs.length === 0) return null;

    const outputTexts: string[] = [];
    for (let i = 0; i < outputs.length; i++) {
      const output = outputs.get(i);
      const text = output.toJSON().text;
      if (typeof text === 'string') {
        outputTexts.push(text);
      } else if (Array.isArray(text)) {
        outputTexts.push(text.join(''));
      }
    }

    const content = outputTexts.join('\n').trim();
    if (!content) return null;

    const notebookName = this.notebookTracker?.currentWidget?.title.label ?? 'Notebook';
    const cellIndex = notebook.activeCellIndex;

    return {
      type: 'selection',
      label: `${notebookName} · Cell ${cellIndex + 1} output`,
      content,
    };
  }
}
