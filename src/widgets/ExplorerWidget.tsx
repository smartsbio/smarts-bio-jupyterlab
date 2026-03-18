// Combined sidebar widget with Files and Processes tabs.
// Replaces the separate FilesWidget and ProcessesWidget in the left sidebar.
import React from 'react';
import { ReactWidget } from '@jupyterlab/apputils';
import { AuthProvider } from '../auth/AuthProvider';
import { SmartsBioClient } from '../api/SmartsBioClient';
import { WorkspaceSelector } from '../workspace/WorkspaceSelector';
import { FilesPanel } from '../panels/FilesPanel';
import { ProcessesPanel } from '../panels/ProcessesPanel';

type Tab = 'files' | 'processes';

interface PanelProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  isAuthenticated: boolean;
  workspaceId: string;
  client: SmartsBioClient;
  workspaceSelector: WorkspaceSelector;
  onOpenViewer: (fileKey: string, fileName: string, ext: string) => void;
  onAnalyzeFile: (fileKey: string, fileName: string) => void;
  refreshToken: number;
  onSignIn: () => void;
}

function ExplorerPanel({
  activeTab,
  onTabChange,
  isAuthenticated,
  workspaceId,
  client,
  workspaceSelector,
  onOpenViewer,
  onAnalyzeFile,
  refreshToken,
  onSignIn,
}: PanelProps): React.ReactElement {
  return (
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
        {activeTab === 'files' ? (
          <FilesPanel
            isAuthenticated={isAuthenticated}
            workspaceId={workspaceId}
            client={client}
            workspaceSelector={workspaceSelector}
            onOpenViewer={onOpenViewer}
            onAnalyzeFile={onAnalyzeFile}
            refreshToken={refreshToken}
            onSignIn={onSignIn}
          />
        ) : (
          <ProcessesPanel
            isAuthenticated={isAuthenticated}
            workspaceId={workspaceId}
            client={client}
            workspaceSelector={workspaceSelector}
            onSignIn={onSignIn}
          />
        )}
      </div>
    </div>
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
    borderBottom: '1px solid var(--vscode-panel-border)',
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
    color: 'var(--vscode-descriptionForeground)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    fontFamily: 'var(--vscode-font-family)',
    marginBottom: '-1px',
  },
  tabActive: {
    color: 'var(--vscode-foreground)',
    borderBottom: '2px solid var(--vscode-button-background)',
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
    private readonly client: SmartsBioClient,
    private readonly workspaceSelector: WorkspaceSelector,
    private readonly onOpenViewer: (fileKey: string, fileName: string, ext: string) => void,
    private readonly onAnalyzeFile: (fileKey: string, fileName: string) => void,
  ) {
    super();
    this.addClass('smarts-bio-panel');
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
      <ExplorerPanel
        activeTab={this._activeTab}
        onTabChange={(tab) => { this._activeTab = tab; this.update(); }}
        isAuthenticated={this.auth.isAuthenticated}
        workspaceId={this.workspaceSelector.selectedWorkspaceId}
        client={this.client}
        workspaceSelector={this.workspaceSelector}
        onOpenViewer={this.onOpenViewer}
        onAnalyzeFile={this.onAnalyzeFile}
        refreshToken={this._refreshCounter}
        onSignIn={() => this.auth.signIn()}
      />
    );
  }
}
