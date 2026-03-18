// NOTE: Adapted from smarts-bio-vscode/src/viewers/viewerShell.ts
// Key change: removed Node.js `crypto` import — uses browser crypto.randomUUID() instead.

/** CDN versions pinned for reproducibility */
export const CDN = {
  MOLSTAR_JS: 'https://cdn.jsdelivr.net/npm/molstar@5.1.2/build/viewer/molstar.js',
  MOLSTAR_CSS: 'https://cdn.jsdelivr.net/npm/molstar@5.1.2/build/viewer/molstar.css',
  IGV_JS: 'https://cdn.jsdelivr.net/npm/igv@3.0.5/dist/igv.min.js',
  PAPAPARSE_JS: 'https://cdn.jsdelivr.net/npm/papaparse@5.4.1/papaparse.min.js',
  PAKO_JS: 'https://cdn.jsdelivr.net/npm/pako@2.1.0/dist/pako.min.js',
};

export function newNonce(): string {
  return crypto.randomUUID().replace(/-/g, '');
}

export function csp(nonce: string): string {
  return [
    `default-src 'none'`,
    `script-src 'nonce-${nonce}' https://cdn.jsdelivr.net 'unsafe-eval'`,
    `style-src 'unsafe-inline' https://cdn.jsdelivr.net`,
    `img-src * data: blob:`,
    `connect-src *`,
    `worker-src blob:`,
    `font-src https://cdn.jsdelivr.net data:`,
  ].join('; ');
}

/**
 * Returns a <style> block that defines all --vscode-* CSS variables used by
 * the viewers, with correct values for dark or light mode.
 * This is injected into each iframe so the var() calls resolve correctly
 * (iframes have no access to the parent window's CSS custom properties).
 */
function themeVars(isDark: boolean): string {
  const v = isDark ? {
    editorBg:            '#1e1e1e',
    editorFg:            '#d4d4d4',
    fg:                  '#cccccc',
    sidebarBg:           '#252526',
    panelBorder:         '#454545',
    inputBg:             '#3c3c3c',
    inputFg:             '#cccccc',
    inputBorder:         '#555555',
    btnBg:               '#0e639c',
    btnFg:               '#ffffff',
    btn2Bg:              '#3a3a3a',
    btn2Fg:              '#cccccc',
    btn2HoverBg:         '#505050',
    focusBorder:         '#007fd4',
    descFg:              '#9d9d9d',
    errorFg:             '#f48771',
    listActiveBg:        '#094771',
    listActiveFg:        '#ffffff',
    listHoverBg:         'rgba(90,93,94,0.31)',
    widgetBorder:        '#454545',
    widgetBg:            '#252526',
  } : {
    editorBg:            '#ffffff',
    editorFg:            '#1a1a1a',
    fg:                  '#1a1a1a',
    sidebarBg:           '#f3f3f3',
    panelBorder:         '#e5e5e5',
    inputBg:             '#ffffff',
    inputFg:             '#1a1a1a',
    inputBorder:         '#cecece',
    btnBg:               '#0078d4',
    btnFg:               '#ffffff',
    btn2Bg:              '#e8e8e8',
    btn2Fg:              '#1a1a1a',
    btn2HoverBg:         '#d0d0d0',
    focusBorder:         '#0090f1',
    descFg:              '#717171',
    errorFg:             '#b01011',
    listActiveBg:        '#0060c0',
    listActiveFg:        '#ffffff',
    listHoverBg:         'rgba(0,0,0,0.06)',
    widgetBorder:        '#d4d4d4',
    widgetBg:            '#f3f3f3',
  };
  return `<style>
  :root {
    --vscode-editor-background:                 ${v.editorBg};
    --vscode-editor-foreground:                 ${v.editorFg};
    --vscode-foreground:                        ${v.fg};
    --vscode-sideBar-background:                ${v.sidebarBg};
    --vscode-panel-border:                      ${v.panelBorder};
    --vscode-input-background:                  ${v.inputBg};
    --vscode-input-foreground:                  ${v.inputFg};
    --vscode-input-border:                      ${v.inputBorder};
    --vscode-button-background:                 ${v.btnBg};
    --vscode-button-foreground:                 ${v.btnFg};
    --vscode-button-secondaryBackground:        ${v.btn2Bg};
    --vscode-button-secondaryForeground:        ${v.btn2Fg};
    --vscode-button-secondaryHoverBackground:   ${v.btn2HoverBg};
    --vscode-focusBorder:                       ${v.focusBorder};
    --vscode-descriptionForeground:             ${v.descFg};
    --vscode-errorForeground:                   ${v.errorFg};
    --vscode-list-activeSelectionBackground:    ${v.listActiveBg};
    --vscode-list-activeSelectionForeground:    ${v.listActiveFg};
    --vscode-list-hoverBackground:              ${v.listHoverBg};
    --vscode-widget-border:                     ${v.widgetBorder};
    --vscode-editorWidget-background:           ${v.widgetBg};
    --vscode-font-family:                       system-ui, sans-serif;
    --vscode-font-size:                         13px;
    --vscode-editor-font-family:                monospace;
  }
</style>`;
}

/**
 * Wraps viewer-specific head + body content in the shared HTML shell.
 * Provides: CSP, loading spinner, error-msg style, VS Code CSS variables.
 * Pass isDark=true to apply dark theme variables and body class.
 */
export function shell(
  nonce: string,
  fileName: string,
  extraHead: string,
  bodyContent: string,
  bodyStyle = '',
  isDark = true,
): string {
  // Adding 'vscode-dark' class makes the existing isDark() checks in each
  // viewer work correctly without any changes to the viewer JS logic.
  const bodyClass = isDark ? 'vscode-dark' : 'vscode-light';
  return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${csp(nonce)}">
  <title>${fileName}</title>
  ${themeVars(isDark)}
  ${extraHead}
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { width: 100%; height: 100vh; overflow: hidden; ${bodyStyle} }
    #loading {
      position: absolute; inset: 0; z-index: 100;
      display: flex; align-items: center; justify-content: center;
      flex-direction: column; gap: 12px;
      font-family: var(--vscode-font-family, system-ui), sans-serif;
      font-size: 13px; color: var(--vscode-descriptionForeground);
      background: var(--vscode-editor-background);
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .spinner {
      width: 28px; height: 28px;
      border: 2px solid var(--vscode-widget-border);
      border-top-color: var(--vscode-focusBorder);
      border-radius: 50%; animation: spin 0.8s linear infinite;
    }
    .error-msg {
      color: var(--vscode-errorForeground);
      padding: 20px; font-size: 13px;
      font-family: var(--vscode-font-family, system-ui), sans-serif;
    }
  </style>
</head>
<body class="${bodyClass}">
  <div id="loading"><div class="spinner"></div><span id="loading-text">Loading…</span></div>
  ${bodyContent}
</body>
</html>`;
}
