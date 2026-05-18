import React from 'react';
import { ReactWidget } from '@jupyterlab/apputils';
import { BioSearchTool } from '@smartsbio/ui';
import { SmartsBioClient } from '../api/SmartsBioClient';

function isJupyterDark(): boolean {
  return document.body.getAttribute('data-jp-theme-light') !== 'true';
}

export class BioSearchWidget extends ReactWidget {
  private _initialQuery?: string;
  private _onOpenInGraph?: (entity: { id: string; type: string }) => void;
  private _onAskInChat?: (message: string) => void;
  private _themeObserver: MutationObserver;

  constructor(
    private readonly client: SmartsBioClient,
    options: {
      initialQuery?: string;
      onOpenInGraph?: (entity: { id: string; type: string }) => void;
      onAskInChat?: (message: string) => void;
    } = {},
  ) {
    super();
    this.addClass('smarts-bio-panel');
    this._initialQuery = options.initialQuery;
    this._onOpenInGraph = options.onOpenInGraph;
    this._onAskInChat = options.onAskInChat;

    this._themeObserver = new MutationObserver(() => this.update());
    this._themeObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ['data-jp-theme-light'],
    });
  }

  /** Pre-fill the search box (called from context-menu commands). */
  setQuery(query: string): void {
    this._initialQuery = query;
    this.update();
  }

  protected render(): React.ReactElement {
    return (
      <BioSearchTool
        fetchSearchStream={(query, signal) => this.client.fetchBioSearchStream(query, signal)}
        onOpenInGraph={this._onOpenInGraph}
        initialQuery={this._initialQuery}
        isDark={isJupyterDark()}
        isAuthenticated={this.client.isAuthenticated}
        onSignIn={() => this.client.signIn()}
        onAskInChat={this._onAskInChat}
      />
    );
  }

  dispose(): void {
    this._themeObserver.disconnect();
    super.dispose();
  }
}
