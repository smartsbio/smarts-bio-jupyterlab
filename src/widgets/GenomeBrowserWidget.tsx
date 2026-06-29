import React from 'react';
import { ReactWidget } from '@jupyterlab/apputils';
import { GenomeBrowserTool } from '@smartsbio/ui/genome-browser';
import { SmartsBioClient } from '../api/SmartsBioClient';
import { buildGenomeBrowserIo } from '../viewers/genomeBrowserIo';
import { openInGraph } from '../viewers/graphExplorerBridge';

function isJupyterDark(): boolean {
  return document.body.getAttribute('data-jp-theme-light') !== 'true';
}

/**
 * The genome-wide "explore the human genome" browser (no file): genes, KG
 * connections, ClinVar variants and the hg38 reference, all from the gateway.
 * Opening a workspace BAM/VCF uses the in-viewer Genome Browser tab instead.
 */
export class GenomeBrowserWidget extends ReactWidget {
  private _themeObserver: MutationObserver;

  constructor(private readonly client: SmartsBioClient) {
    super();
    this.addClass('smarts-bio-panel');
    this._themeObserver = new MutationObserver(() => this.update());
    this._themeObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ['data-jp-theme-light'],
    });
  }

  protected render(): React.ReactElement {
    // No fileKey/workspaceId → explorer mode (no presigning needed).
    return (
      <GenomeBrowserTool
        io={buildGenomeBrowserIo(this.client, '')}
        isDark={isJupyterDark()}
        onOpenInGraph={openInGraph}
      />
    );
  }

  dispose(): void {
    this._themeObserver.disconnect();
    super.dispose();
  }
}
