// Combined sidebar widget with Files and Processes tabs.
// Uses FilesPanel + ProcessesPanel from @smartsbio/ui via SmartsBioProvider context.
import React from 'react';
import { ReactWidget } from '@jupyterlab/apputils';
import { SmartsBioProvider, FilesPanel, ProcessesPanel } from '@smartsbio/ui';
import type { SmartsBioCapabilities, UserProfile } from '@smartsbio/ui';
import { AuthProvider } from '../auth/AuthProvider';
import { WorkspaceSelector } from '../workspace/WorkspaceSelector';
import { overrideWindowPrompt } from '../capabilities';

type Tab = 'files' | 'processes';

interface PanelProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  capabilities: SmartsBioCapabilities;
  workspaceId: string;
  profile: UserProfile | null;
  refreshToken: number;
}

function ExplorerInner({
  activeTab,
  onTabChange,
  capabilities,
  workspaceId,
  profile,
  refreshToken,
}: PanelProps): React.ReactElement {
  return (
    <SmartsBioProvider value={{ capabilities, workspaceId, profile }}>
      <div style={styles.root}>
        <div style={styles.tabBar}>
          <button
            style={{ ...styles.tab, ...(activeTab === 'files' ? styles.tabActive : {}) }}
            onClick={() => onTabChange('files')}
          >
            Files
          </button>
          <button
            style={{ ...styles.tab, ...(activeTab === 'processes' ? styles.tabActive : {}) }}
            onClick={() => onTabChange('processes')}
          >
            Processes
          </button>
        </div>
        <div style={styles.panelBody}>
          {activeTab === 'files' && <FilesPanel refreshToken={refreshToken} />}
          {activeTab === 'processes' && <ProcessesPanel />}
        </div>
      </div>
    </SmartsBioProvider>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
  },
  tabBar: {
    display: 'flex',
    borderBottom: '1px solid var(--sb-border, var(--jp-border-color1))',
    flexShrink: 0,
  },
  tab: {
    flex: 1,
    padding: '6px 0',
    background: 'none',
    border: 'none',
    borderBottom: '2px solid transparent',
    cursor: 'pointer',
    fontSize: '11px',
    fontWeight: 600,
    color: 'var(--sb-foreground-muted, var(--jp-ui-font-color2))',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    fontFamily: 'var(--jp-ui-font-family)',
    marginBottom: '-1px',
  },
  tabActive: {
    color: 'var(--sb-foreground, var(--jp-ui-font-color0))',
    borderBottom: '2px solid var(--sb-accent, var(--jp-brand-color1))',
  },
  panelBody: {
    flex: 1,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
};

export class ExplorerWidget extends ReactWidget {
  private _activeTab: Tab = 'files';
  private _refreshCounter = 0;

  constructor(
    private readonly auth: AuthProvider,
    private readonly workspaceSelector: WorkspaceSelector,
    private readonly capabilities: SmartsBioCapabilities,
  ) {
    super();
    this.addClass('smarts-bio-panel');
    this.addClass('smarts-bio-explorer');
    overrideWindowPrompt();
    auth.onAuthChange(() => this.update());
    workspaceSelector.onWorkspaceChange(() => this.update());
  }

  refresh(): void {
    this._refreshCounter++;
    this.update();
  }

  triggerUpload(_folder?: string): void {
    this._activeTab = 'files';
    this.update();
  }

  showProcesses(): void {
    this._activeTab = 'processes';
    this.update();
  }

  protected render(): React.ReactElement {
    return (
      <ExplorerInner
        activeTab={this._activeTab}
        onTabChange={(tab) => { this._activeTab = tab; this.update(); }}
        capabilities={this.capabilities}
        workspaceId={this.workspaceSelector.selectedWorkspaceId}
        profile={this.auth.profile}
        refreshToken={this._refreshCounter}
      />
    );
  }
}
