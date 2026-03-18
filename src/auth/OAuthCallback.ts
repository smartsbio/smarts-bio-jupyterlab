import { AuthProvider } from './AuthProvider';

/**
 * Listens for the OAuth2 callback message from the sign-in popup window.
 *
 * Flow:
 * 1. User clicks "Sign In" → AuthProvider.signIn() opens a popup
 * 2. User authenticates on smarts.bio
 * 3. smarts.bio website redirects to /connect/jupyterlab/callback
 * 4. That callback page calls: window.opener.postMessage({ code, state }, origin)
 * 5. This listener receives the message and calls AuthProvider.handleCallback()
 */
export class OAuthCallback {
  private _handler: ((event: MessageEvent) => void) | null = null;

  constructor(private readonly auth: AuthProvider) {}

  start(): void {
    this._handler = async (event: MessageEvent) => {
      // Only accept messages that look like our OAuth callback
      const data = event.data;
      if (
        typeof data !== 'object' ||
        data === null ||
        data.type !== 'smarts-bio-oauth' ||
        typeof data.code !== 'string' ||
        typeof data.state !== 'string'
      ) {
        return;
      }

      try {
        await this.auth.handleCallback(data.code, data.state);
      } catch (err: any) {
        console.error('[smarts.bio] OAuth callback error:', err?.message ?? err);
      }
    };

    window.addEventListener('message', this._handler);
  }

  dispose(): void {
    if (this._handler) {
      window.removeEventListener('message', this._handler);
      this._handler = null;
    }
  }
}
