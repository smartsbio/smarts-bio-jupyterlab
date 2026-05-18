import React from 'react';
import { ReactWidget } from '@jupyterlab/apputils';
import { GraphViewer } from '@smartsbio/ui';
import type { FetchNetworkParams, NetworkResponse, FetchEntityDetailParams, EntityDetail } from '@smartsbio/ui';
import { SmartsBioClient } from '../api/SmartsBioClient';

function isJupyterDark(): boolean {
  return document.body.getAttribute('data-jp-theme-light') !== 'true';
}

export class GraphExplorerWidget extends ReactWidget {
  private _initialEntity?: { id: string; type: string };
  private _themeObserver: MutationObserver;

  constructor(
    private readonly client: SmartsBioClient,
    options: { initialEntity?: { id: string; type: string } } = {},
  ) {
    super();
    this.addClass('smarts-bio-panel');
    this._initialEntity = options.initialEntity;

    // Re-render when JupyterLab switches between light and dark themes
    this._themeObserver = new MutationObserver(() => this.update());
    this._themeObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ['data-jp-theme-light'],
    });
  }

  /** Navigate to a new entity (called from Bio Search "Open in Graph Explorer"). */
  navigateTo(entity: { id: string; type: string }): void {
    this._initialEntity = entity;
    this.update();
  }

  protected render(): React.ReactElement {
    return (
      <GraphViewer
        fetchNetwork={(params: FetchNetworkParams) =>
          this.client.getGraphNetwork({ ...params, limit: params.limit ?? 50 }) as Promise<NetworkResponse>
        }
        fetchEntityDetail={(params: FetchEntityDetailParams) =>
          this.client.getEntityDetail(params.type, params.id) as Promise<EntityDetail>
        }
        initialEntity={this._initialEntity}
        isDark={isJupyterDark()}
        isAuthenticated={this.client.isAuthenticated}
        onSignIn={() => this.client.signIn()}
      />
    );
  }

  dispose(): void {
    this._themeObserver.disconnect();
    super.dispose();
  }
}
