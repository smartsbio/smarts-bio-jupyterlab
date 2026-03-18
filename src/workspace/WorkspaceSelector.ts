// NOTE: Adapted from smarts-bio-vscode/src/workspace/WorkspaceSelector.ts
// Key changes:
//   - context.globalState → IStateDB (JupyterLab persistent state)
//   - vscode.window.showQuickPick → React dialog (openPicker uses a simple DOM prompt)
//   - vscode.Disposable → plain object with dispose()
import { IStateDB } from '@jupyterlab/statedb';
import { SmartsBioClient, OrgWithWorkspaces } from '../api/SmartsBioClient';
import { AuthProvider } from '../auth/AuthProvider';

const SELECTED_ORG_KEY       = 'smarts-bio:selectedOrgId';
const SELECTED_WORKSPACE_KEY = 'smarts-bio:selectedWorkspaceId';
const SELECTED_ORG_NAME_KEY  = 'smarts-bio:selectedOrgName';
const SELECTED_WS_NAME_KEY   = 'smarts-bio:selectedWorkspaceName';

type WorkspaceChangeListener = (workspaceId: string, workspaceName: string, orgName: string) => void;

export interface Disposable {
  dispose(): void;
}

export class WorkspaceSelector implements Disposable {
  private _listeners: WorkspaceChangeListener[] = [];
  private _orgs: OrgWithWorkspaces[] = [];
  private _authDisposable: Disposable;

  // In-memory cache of selected IDs (stateDB is async; we cache for sync access)
  private _workspaceId   = '';
  private _workspaceName = '';
  private _orgName       = '';

  constructor(
    private readonly stateDB: IStateDB,
    private readonly auth: AuthProvider,
    private readonly client: SmartsBioClient,
  ) {
    this._authDisposable = auth.onAuthChange(profile => {
      if (profile) {
        this._initFromProfile(profile);
      } else {
        this._clear();
      }
    });
  }

  get selectedWorkspaceId(): string {
    return this._workspaceId;
  }

  get selectedWorkspaceName(): string {
    return this._workspaceName;
  }

  get selectedOrgName(): string {
    return this._orgName;
  }

  onWorkspaceChange(listener: WorkspaceChangeListener): Disposable {
    this._listeners.push(listener);
    return {
      dispose: () => {
        this._listeners = this._listeners.filter(l => l !== listener);
      },
    };
  }

  /** Restore cached selection from IStateDB on startup. */
  async restore(): Promise<void> {
    try {
      const wsId   = (await this.stateDB.fetch(SELECTED_WORKSPACE_KEY)) as string | null;
      const wsName = (await this.stateDB.fetch(SELECTED_WS_NAME_KEY))   as string | null;
      const oName  = (await this.stateDB.fetch(SELECTED_ORG_NAME_KEY))  as string | null;
      if (wsId) {
        this._workspaceId   = wsId;
        this._workspaceName = wsName ?? '';
        this._orgName       = oName  ?? '';
        this._notify();
      }
    } catch {
      // Silently ignore if state not available yet
    }
  }

  /** Show a workspace picker modal. */
  async pick(): Promise<void> {
    if (!this.auth.isAuthenticated) return;

    try {
      this._orgs = await this.client.getOrganizationsWithWorkspaces();
    } catch {
      return;
    }

    const all = this._orgs.flatMap(org =>
      org.workspaces.map(ws => ({ org, ws })),
    );
    if (all.length === 0) return;

    const selected = await this._showPickerModal(all);
    if (!selected) return;
    await this._select(selected.org, selected.ws.workspaceId, selected.ws.name);
  }

  private _showPickerModal(
    all: Array<{ org: OrgWithWorkspaces; ws: OrgWithWorkspaces['workspaces'][0] }>,
  ): Promise<{ org: OrgWithWorkspaces; ws: OrgWithWorkspaces['workspaces'][0] } | null> {
    return new Promise(resolve => {
      const isLight = document.body.getAttribute('data-jp-theme-light') !== 'false';
      const bg      = isLight ? '#ffffff' : '#1e1e2e';
      const bgHover = isLight ? '#f3f4f6' : '#2a2a3e';
      const bgActive = isLight ? '#e8f0fe' : '#2d3a5c';
      const border  = isLight ? '#e5e7eb' : '#3a3a4a';
      const text    = isLight ? '#111827' : '#e2e8f0';
      const sub     = isLight ? '#6b7280' : '#94a3b8';
      const accent  = '#3b82f6';

      // ── Backdrop ────────────────────────────────────────────────────────────
      const backdrop = document.createElement('div');
      backdrop.style.cssText = [
        'position:fixed;inset:0;z-index:10000',
        'display:flex;align-items:center;justify-content:center',
        `background:${isLight ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.6)'}`,
      ].join(';');

      // ── Modal card ──────────────────────────────────────────────────────────
      const card = document.createElement('div');
      card.style.cssText = [
        `background:${bg};border:1px solid ${border}`,
        'border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,0.3)',
        'width:320px;max-width:90vw;overflow:hidden',
        `font-family:var(--jp-ui-font-family,system-ui,sans-serif);color:${text}`,
      ].join(';');

      // ── Header ──────────────────────────────────────────────────────────────
      const header = document.createElement('div');
      header.style.cssText = `padding:16px 16px 12px;border-bottom:1px solid ${border};display:flex;align-items:center;justify-content:space-between`;
      header.innerHTML = `
        <div style="font-size:13px;font-weight:600">Select Workspace</div>
        <button id="sb-picker-close" style="background:none;border:none;cursor:pointer;color:${sub};font-size:16px;padding:0;line-height:1">✕</button>
      `;

      // ── List ────────────────────────────────────────────────────────────────
      const list = document.createElement('div');
      list.style.cssText = 'overflow-y:auto;max-height:280px;padding:6px 0';
      const multiOrg = this._orgs.length > 1;

      all.forEach((item, idx) => {
        const isSelected = item.ws.workspaceId === this._workspaceId;
        const row = document.createElement('button');
        row.style.cssText = [
          'display:flex;align-items:center;width:100%;border:none;cursor:pointer',
          `background:${isSelected ? bgActive : 'transparent'};text-align:left`,
          'padding:9px 16px;gap:10px;transition:background 0.1s',
        ].join(';');

        const dot = isSelected
          ? `<span style="width:6px;height:6px;border-radius:50%;background:${accent};flex-shrink:0"></span>`
          : `<span style="width:6px;height:6px;flex-shrink:0"></span>`;

        row.innerHTML = `
          ${dot}
          <span style="flex:1;overflow:hidden">
            <span style="font-size:13px;font-weight:500;color:${text};display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
              ${item.ws.name}
            </span>
            ${multiOrg ? `<span style="font-size:11px;color:${sub}">${item.org.name}</span>` : ''}
          </span>
          ${isSelected ? `<span style="font-size:10px;color:${accent};font-weight:600">active</span>` : ''}
        `;

        row.addEventListener('mouseenter', () => {
          if (item.ws.workspaceId !== this._workspaceId) row.style.background = bgHover;
        });
        row.addEventListener('mouseleave', () => {
          if (item.ws.workspaceId !== this._workspaceId) row.style.background = 'transparent';
        });
        row.addEventListener('click', () => {
          cleanup();
          resolve(item);
        });
        row.dataset.idx = String(idx);
        list.appendChild(row);
      });

      // ── Assemble ────────────────────────────────────────────────────────────
      card.appendChild(header);
      card.appendChild(list);
      backdrop.appendChild(card);
      document.body.appendChild(backdrop);

      // ── Scroll selected item into view ──────────────────────────────────────
      const activeIdx = all.findIndex(i => i.ws.workspaceId === this._workspaceId);
      if (activeIdx >= 0) {
        const activeRow = list.querySelectorAll<HTMLButtonElement>('button[data-idx]')[activeIdx];
        activeRow?.scrollIntoView({ block: 'nearest' });
      }

      // ── Cleanup helper ───────────────────────────────────────────────────────
      const cleanup = () => {
        document.removeEventListener('keydown', onKey);
        document.body.removeChild(backdrop);
      };

      // ── Close handlers ───────────────────────────────────────────────────────
      header.querySelector('#sb-picker-close')!.addEventListener('click', () => { cleanup(); resolve(null); });
      backdrop.addEventListener('click', e => { if (e.target === backdrop) { cleanup(); resolve(null); } });

      // ── Keyboard navigation ──────────────────────────────────────────────────
      let focused = activeIdx >= 0 ? activeIdx : 0;
      const rows = () => Array.from(list.querySelectorAll<HTMLButtonElement>('button[data-idx]'));

      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') { cleanup(); resolve(null); return; }
        const rs = rows();
        if (e.key === 'ArrowDown') { e.preventDefault(); focused = Math.min(focused + 1, rs.length - 1); rs[focused].focus(); }
        if (e.key === 'ArrowUp')   { e.preventDefault(); focused = Math.max(focused - 1, 0); rs[focused].focus(); }
        if (e.key === 'Enter') { e.preventDefault(); rs[focused]?.click(); }
      };
      document.addEventListener('keydown', onKey);
      rows()[focused]?.focus();
    });
  }

  private async _initFromProfile(profile: { defaultWorkspaceId: string }): Promise<void> {
    try {
      this._orgs = await this.client.getOrganizationsWithWorkspaces();
    } catch {
      this._notify();
      return;
    }

    const savedId = this._workspaceId || profile.defaultWorkspaceId;

    for (const org of this._orgs) {
      const ws = org.workspaces.find(w => w.workspaceId === savedId);
      if (ws) {
        await this._select(org, ws.workspaceId, ws.name);
        return;
      }
    }

    // Fallback: first available workspace
    const firstOrg = this._orgs[0];
    const firstWs = firstOrg?.workspaces[0];
    if (firstOrg && firstWs) {
      await this._select(firstOrg, firstWs.workspaceId, firstWs.name);
    }
  }

  private async _select(
    org: OrgWithWorkspaces,
    workspaceId: string,
    workspaceName: string,
  ): Promise<void> {
    this._workspaceId   = workspaceId;
    this._workspaceName = workspaceName;
    this._orgName       = org.name;
    await this.stateDB.save(SELECTED_ORG_KEY,       org.organizationId);
    await this.stateDB.save(SELECTED_ORG_NAME_KEY,  org.name);
    await this.stateDB.save(SELECTED_WORKSPACE_KEY, workspaceId);
    await this.stateDB.save(SELECTED_WS_NAME_KEY,   workspaceName);
    this._notify();
  }

  private _clear(): void {
    this._workspaceId   = '';
    this._workspaceName = '';
    this._orgName       = '';
    this._orgs = [];
    this._notify();
  }

  private _notify(): void {
    for (const listener of this._listeners) {
      listener(this._workspaceId, this._workspaceName, this._orgName);
    }
  }

  dispose(): void {
    this._authDisposable.dispose();
  }
}
