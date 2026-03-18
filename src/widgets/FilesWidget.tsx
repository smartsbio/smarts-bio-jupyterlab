// NOTE: JupyterLab-specific — replaces VS Code FilesExplorer (TreeDataProvider).
// FilesWidget is a ReactWidget that renders FilesPanel directly as React.
import React from 'react';
import { ReactWidget } from '@jupyterlab/apputils';
import { AuthProvider } from '../auth/AuthProvider';
import { SmartsBioClient } from '../api/SmartsBioClient';
import { WorkspaceSelector } from '../workspace/WorkspaceSelector';
import { FilesPanel } from '../panels/FilesPanel';

export class FilesWidget extends ReactWidget {
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

  /** Called by commands to force a file list reload. */
  refresh(): void {
    this._refreshCounter++;
    this.update();
  }

  /** Called by commands to trigger a file upload dialog. */
  triggerUpload(_folder?: string): void {
    // FilesPanel manages its own upload input; re-render triggers the effect.
    this.update();
  }

  protected render(): React.ReactElement {
    return (
      <FilesPanel
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
