// NOTE: JupyterLab-specific — replaces VS Code StatusBarItem (vscode.window.createStatusBarItem).
// Uses app.statusBar.createItem() to show auth/workspace state in the JupyterLab status bar.
import { IStatusBar } from '@jupyterlab/statusbar';
import { Widget } from '@lumino/widgets';
import { AuthProvider } from '../auth/AuthProvider';
import { WorkspaceSelector } from '../workspace/WorkspaceSelector';
import { getThemedSvg } from '../icons';

export class StatusBarWidget {
  private _item: Widget | null = null;
  private _node: HTMLElement;
  private _themeObserver: MutationObserver | null = null;

  constructor(
    statusBar: IStatusBar,
    private readonly auth: AuthProvider,
    private readonly workspaceSelector: WorkspaceSelector,
  ) {
    this._node = document.createElement('div');
    this._node.className = 'smarts-bio-statusbar-item';
    this._node.style.cssText =
      'display:flex;align-items:center;gap:6px;padding:0 8px;cursor:pointer;font-size:12px;';
    this._node.title = 'smarts.bio — click to select workspace';
    this._node.addEventListener('click', () => this.workspaceSelector.pick());

    const widget = new Widget({ node: this._node });

    statusBar.registerStatusItem('smarts-bio:status', {
      item: widget,
      align: 'right',
      rank: 100,
    });

    this._item = widget;
    this._render();

    // Re-render when auth or workspace changes
    auth.onAuthChange(() => this._render());
    workspaceSelector.onWorkspaceChange(() => this._render());

    // Re-render when JupyterLab theme changes (data-jp-theme-light toggled on body)
    this._themeObserver = new MutationObserver(() => this._render());
    this._themeObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ['data-jp-theme-light'],
    });
  }

  private _logoSvg(): string {
    // Inline the themed SVG at 14×14 for the status bar
    const svg = getThemedSvg();
    return svg.replace('<svg ', '<svg width="14" height="14" style="flex-shrink:0;vertical-align:middle" ');
  }

  private _render(): void {
    const logo = this._logoSvg();

    if (!this.auth.isAuthenticated) {
      this._node.innerHTML = `${logo}<span style="opacity:0.6">smarts.bio: not signed in</span>`;
      return;
    }

    const wsName = this.workspaceSelector.selectedWorkspaceName;
    const orgName = this.workspaceSelector.selectedOrgName;

    if (!wsName) {
      this._node.innerHTML = `${logo}<span>smarts.bio</span>`;
      return;
    }

    const label = orgName ? `${orgName} / ${wsName}` : wsName;
    this._node.innerHTML = `${logo}<span>${label}</span>`;
  }

  dispose(): void {
    this._themeObserver?.disconnect();
    this._item?.dispose();
  }
}
