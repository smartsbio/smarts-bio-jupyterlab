// NOTE: JupyterLab-specific — replaces VS Code ProcessesPanel (HTML template + postMessage).
// ProcessesWidget is a ReactWidget that renders ProcessesPanel directly as React.
import React from 'react';
import { ReactWidget } from '@jupyterlab/apputils';
import { AuthProvider } from '../auth/AuthProvider';
import { SmartsBioClient } from '../api/SmartsBioClient';
import { WorkspaceSelector } from '../workspace/WorkspaceSelector';
import { ProcessesPanel } from '../panels/ProcessesPanel';

export class ProcessesWidget extends ReactWidget {
  constructor(
    private readonly auth: AuthProvider,
    private readonly client: SmartsBioClient,
    private readonly workspaceSelector: WorkspaceSelector,
  ) {
    super();
    this.addClass('smarts-bio-panel');
    auth.onAuthChange(() => this.update());
    workspaceSelector.onWorkspaceChange(() => this.update());
  }

  protected render(): React.ReactElement {
    return (
      <ProcessesPanel
        isAuthenticated={this.auth.isAuthenticated}
        workspaceId={this.workspaceSelector.selectedWorkspaceId}
        client={this.client}
        workspaceSelector={this.workspaceSelector}
        onSignIn={() => this.auth.signIn()}
      />
    );
  }
}
