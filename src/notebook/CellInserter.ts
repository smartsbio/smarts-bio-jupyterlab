// NOTE: JupyterLab-specific — replaces VS Code _insertCode (vscode.window.activeTextEditor).
// Inserts generated code as a new cell below the active cell in the active notebook.
import { INotebookTracker } from '@jupyterlab/notebook';
import { NotebookActions } from '@jupyterlab/notebook';

export class CellInserter {
  constructor(private readonly notebookTracker: INotebookTracker | null) {}

  /** Insert code as a new code cell below the active cell in the active notebook. */
  insertCode(code: string): void {
    const notebook = this.notebookTracker?.currentWidget?.content;
    if (!notebook) {
      // Fallback: copy to clipboard with a notification
      navigator.clipboard.writeText(code).catch(() => {});
      return;
    }

    // Insert a new cell below the active cell
    NotebookActions.insertBelow(notebook);

    // Set the new active cell's content to the generated code
    const activeCell = notebook.activeCell;
    if (activeCell) {
      activeCell.model.sharedModel.setSource(code);
    }
  }
}
