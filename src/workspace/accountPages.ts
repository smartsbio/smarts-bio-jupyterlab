/**
 * Opens the website's standalone management pages (/workspaces,
 * /organization) in a new browser tab. Members, invites and roles are
 * server-side state, so we link to the one UI that manages them.
 *
 * `client` and `theme` follow the pages' external-return contract
 * (bioinformatics-frontend/utils/externalReturn.ts). There is no `return`:
 * JupyterLab has no URL scheme to come back through, so the page says
 * "you can close this tab" and the user is back in the notebook tab.
 */
export function openAccountPage(websiteBaseUrl: string, path: string): void {
  const url = new URL(path, websiteBaseUrl.replace(/\/$/, '') + '/');
  url.searchParams.set('client', 'jupyterlab');
  const isLight = document.body.getAttribute('data-jp-theme-light') !== 'false';
  url.searchParams.set('theme', isLight ? 'light' : 'dark');
  window.open(url.toString(), '_blank', 'noopener');
}

/** The current workspace's page (Overview / Members / Settings), or the list. */
export function openWorkspaceManagement(websiteBaseUrl: string, workspaceId: string | undefined): void {
  openAccountPage(
    websiteBaseUrl,
    workspaceId ? `/workspaces?ws=${encodeURIComponent(workspaceId)}` : '/workspaces',
  );
}
