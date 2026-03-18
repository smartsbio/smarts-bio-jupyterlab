import { CDN, newNonce, shell } from './viewerShell';

/**
 * Molstar 3D structure viewer (PDB / mmCIF).
 *
 * @param structureData - File text pre-fetched by the extension host.
 *   Embedded directly so the WebView never needs to fetch from S3
 *   (which is blocked by CORS for vscode-webview:// origin).
 */
export function structureHtml(fileName: string, ext: string, structureData: string, isDark = true): string {
  const nonce = newNonce();
  const format = ext === '.pdb' ? 'pdb' : 'mmcif';
  const dataJson = JSON.stringify(structureData);
  const fileNameJson = JSON.stringify(fileName);

  const extraHead = `<link rel="stylesheet" href="${CDN.MOLSTAR_CSS}">
  <style>
    #toolbar {
      flex-shrink: 0;
      padding: 5px 10px;
      border-bottom: 1px solid var(--vscode-panel-border, #333);
      background: var(--vscode-sideBar-background, #252526);
      font-family: var(--vscode-font-family, system-ui), sans-serif;
      font-size: 12px;
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .tb-label {
      color: var(--vscode-descriptionForeground, #888);
      font-size: 11px;
      white-space: nowrap;
    }
    .tb-select {
      padding: 2px 5px;
      border-radius: 3px;
      font-size: 11px;
      border: 1px solid var(--vscode-input-border, #555);
      background: var(--vscode-input-background, #3c3c3c);
      color: var(--vscode-input-foreground, #ccc);
      cursor: pointer;
    }
    .tb-sep {
      width: 1px;
      height: 16px;
      background: var(--vscode-panel-border, #444);
      flex-shrink: 0;
    }
    .tb-check {
      display: flex;
      align-items: center;
      gap: 4px;
      color: var(--vscode-foreground, #ccc);
      font-size: 11px;
      cursor: pointer;
      user-select: none;
      white-space: nowrap;
    }
    .tb-check input { cursor: pointer; margin: 0; }
    .color-swatch {
      width: 16px;
      height: 16px;
      border-radius: 3px;
      cursor: pointer;
      border: 2px solid transparent;
      flex-shrink: 0;
    }
    .color-swatch.active { border-color: var(--vscode-button-background, #0e639c); }
    .color-swatch:hover { opacity: 0.85; }
    #molstar-container {
      flex: 1;
      position: relative;
      min-height: 0;
    }
    .msp-canvas3d-container canvas { display: block; }
    .msp-layout-right,
    .msp-layout-right-open { display: none !important; }
    .msp-viewport-controls { display: none !important; }
    .msp-plugin, .msp-plugin-content, .msp-canvas-container, .msp-canvas3d-container {
      border: none !important;
      outline: none !important;
    }
  </style>`;

  const body = /* html */`
  <div id="toolbar">
    <span class="tb-label">Representation</span>
    <select class="tb-select" id="tb-repr">
      <option value="cartoon">Cartoon</option>
      <option value="ball-and-stick">Ball &amp; Stick</option>
      <option value="molecular-surface">Surface</option>
      <option value="spacefill">Spacefill</option>
      <option value="backbone">Backbone</option>
    </select>

    <div class="tb-sep"></div>

    <span class="tb-label">Color</span>
    <select class="tb-select" id="tb-color">
      <option value="chain-id">By Chain</option>
      <option value="element-symbol">By Element</option>
      <option value="residue-name">By Residue</option>
      <option value="secondary-structure">Secondary Structure</option>
      <option value="uniform">Uniform</option>
    </select>

    <div class="tb-sep"></div>

    <label class="tb-check"><input type="checkbox" id="tb-water"> Water</label>
    <label class="tb-check"><input type="checkbox" id="tb-hydrogen"> Hydrogens</label>

    <div class="tb-sep"></div>

    <span class="tb-label">BG</span>
    <div class="color-swatch" data-bg="0x000000" title="Black" style="background:#000"></div>
    <div class="color-swatch" data-bg="0x1a1a2e" title="Dark blue" style="background:#1a1a2e"></div>
    <div class="color-swatch" data-bg="0x1e1e1e" title="VS Code dark" style="background:#1e1e1e"></div>
    <div class="color-swatch" data-bg="0xffffff" title="White" style="background:#fff;outline:1px solid #555"></div>
    <div class="color-swatch" data-bg="0x0a4c6a" title="Teal" style="background:#0a4c6a"></div>
  </div>
  <div id="molstar-container"></div>
  <script src="${CDN.MOLSTAR_JS}" nonce="${nonce}"></script>
  <script nonce="${nonce}">
    const STRUCTURE_DATA = ${dataJson};
    const FORMAT = '${format}';
    const FILE_LABEL = ${fileNameJson};

    const isDark = document.body.classList.contains('vscode-dark') ||
                   document.body.classList.contains('vscode-high-contrast');

    const settings = {
      representation: 'cartoon',
      colorScheme: 'chain-id',
      showWater: false,
      showHydrogen: false,
      bg: isDark ? 0x1e1e1e : 0xffffff,
    };

    function syncSwatches() {
      document.querySelectorAll('.color-swatch').forEach(el => {
        el.classList.toggle('active', parseInt(el.dataset.bg, 16) === settings.bg);
      });
    }
    syncSwatches();

    let viewer = null;
    let isLoading = false;

    async function reloadStructure() {
      if (!viewer || isLoading) return;
      isLoading = true;
      try {
        const plugin = viewer.plugin;

        // Apply background (instant — no need to reload for this)
        if (plugin.canvas3d) {
          plugin.canvas3d.setProps({ renderer: { backgroundColor: settings.bg } });
        }

        // Clear previous state
        await plugin.clear();

        // Load raw structure data via builder API (same as bio-viewers)
        const data = await plugin.builders.data.rawData({
          data: STRUCTURE_DATA,
          label: FILE_LABEL,
        });

        const trajectory = await plugin.builders.structure.parseTrajectory(data, FORMAT);
        const model = await plugin.builders.structure.createModel(trajectory);
        const structure = await plugin.builders.structure.createStructure(model);

        // Add a single representation with chosen type + color
        await plugin.builders.structure.representation.addRepresentation(structure, {
          type: settings.representation,
          color: settings.colorScheme,
        });

        // Post-process: toggle water and hydrogen component visibility
        const structs = plugin.managers.structure.hierarchy.current.structures;
        for (const s of structs) {
          for (const comp of s.components) {
            const label = (comp.cell && comp.cell.obj && comp.cell.obj.label
              ? comp.cell.obj.label : '').toLowerCase();
            const isWater = label === 'water' || label.includes('water');
            const isHydrogen = label === 'hydrogen' || label.includes('hydrogen');
            if (isWater && !settings.showWater) {
              plugin.managers.structure.component.toggleVisibility([comp]);
            }
            if (isHydrogen && !settings.showHydrogen) {
              plugin.managers.structure.component.toggleVisibility([comp]);
            }
          }
        }

      } catch (e) {
        console.error('[structure viewer] reload failed:', e);
      } finally {
        isLoading = false;
      }
    }

    // Init viewer
    (async () => {
      const loadingEl = document.getElementById('loading');
      const loadingText = document.getElementById('loading-text');
      try {
        loadingText.textContent = 'Initialising viewer\u2026';
        viewer = await molstar.Viewer.create('molstar-container', {
          layoutIsExpanded: false,
          layoutShowControls: false,
          layoutShowRemoteState: false,
          layoutShowSequence: false,
          layoutShowLog: false,
          layoutShowLeftPanel: false,
          viewportShowExpand: false,
          viewportShowSelectionMode: false,
          viewportShowAnimation: false,
          collapseRightPanel: true,
        });

        loadingEl.style.display = 'none';
        await reloadStructure();
      } catch (e) {
        const msg = (e && (e.message || String(e))) || 'Unknown error';
        loadingEl.innerHTML = '<div class="error-msg">Failed to load structure: ' + msg + '</div>';
      }
    })();

    // Toolbar event handlers
    document.getElementById('tb-repr').addEventListener('change', function() {
      settings.representation = this.value;
      reloadStructure();
    });

    document.getElementById('tb-color').addEventListener('change', function() {
      settings.colorScheme = this.value;
      reloadStructure();
    });

    document.getElementById('tb-water').addEventListener('change', function() {
      settings.showWater = this.checked;
      reloadStructure();
    });

    document.getElementById('tb-hydrogen').addEventListener('change', function() {
      settings.showHydrogen = this.checked;
      reloadStructure();
    });

    document.querySelectorAll('.color-swatch').forEach(el => {
      el.addEventListener('click', function() {
        settings.bg = parseInt(this.dataset.bg, 16);
        syncSwatches();
        // Background updates instantly — no full reload needed
        if (viewer && viewer.plugin && viewer.plugin.canvas3d) {
          viewer.plugin.canvas3d.setProps({ renderer: { backgroundColor: settings.bg } });
        }
      });
    });
  </script>`;

  return shell(nonce, fileName, extraHead, body,
    'display:flex; flex-direction:column;', isDark);
}
