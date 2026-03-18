// NOTE: This file is mirrored from smarts-bio-vscode/src/auth/AuthProvider.ts
// Changes from VS Code version:
//   - context.secrets → localStorage (access/refresh tokens)
//   - context.globalState → IStateDB (profile cache)
//   - PKCE state → sessionStorage (ephemeral, cleared on tab close)
//   - vscode.env.openExternal → window.open (popup)
//   - OAuth redirect URI: vscode:// → https://chat.smarts.bio/connect/jupyterlab
//   - Token exchange endpoint: /connect/vscode/token → /connect/jupyterlab/token
//   - Token refresh endpoint: /connect/vscode/refresh → /connect/jupyterlab/refresh
//   - vscode.Disposable → plain object with dispose()
import { IStateDB } from '@jupyterlab/statedb';

const TOKEN_KEY = 'smarts-bio.accessToken';
const REFRESH_TOKEN_KEY = 'smarts-bio.refreshToken';
const PROFILE_STATE_DB_KEY = 'smarts-bio:userProfile';

export interface UserProfile {
  userId: string;
  name: string;
  email: string;
  plan: 'free' | 'pro' | 'team' | 'enterprise';
  computeCreditsRemaining: number;
  computeCreditsTotal: number;
  defaultWorkspaceId: string;
}

type AuthChangeListener = (profile: UserProfile | null) => void;

export interface Disposable {
  dispose(): void;
}

export type ConfigGetter = () => { apiBaseUrl: string; websiteBaseUrl: string };

export class AuthProvider {
  private _profile: UserProfile | null = null;
  private _listeners: AuthChangeListener[] = [];
  private _refreshTimer: ReturnType<typeof setInterval> | undefined;
  private _pendingState: string | null = null;
  private _pendingVerifier: string | null = null;

  constructor(
    private readonly stateDB: IStateDB,
    private readonly getConfig: ConfigGetter,
  ) {}

  get isAuthenticated(): boolean {
    return this._profile !== null;
  }

  get profile(): UserProfile | null {
    return this._profile;
  }

  onAuthChange(listener: AuthChangeListener): Disposable {
    this._listeners.push(listener);
    return {
      dispose: () => {
        this._listeners = this._listeners.filter(l => l !== listener);
      },
    };
  }

  /** Restore session from localStorage on extension activation. */
  async restore(): Promise<void> {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      return;
    }

    try {
      await this._fetchAndCacheProfile(token);
      this._scheduleRefresh();
    } catch {
      // Token may be expired — try refresh
      await this._tryRefresh();
    }
  }

  /**
   * Launch OAuth2 Authorization Code + PKCE flow.
   * Opens a popup window; the smarts.bio website posts back the auth code
   * via window.opener.postMessage once the user authenticates.
   */
  async signIn(): Promise<void> {
    const state = crypto.randomUUID();
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await sha256Base64url(codeVerifier);

    // Store PKCE values in instance properties (reliable in-memory storage)
    this._pendingState = state;
    this._pendingVerifier = codeVerifier;

    const { websiteBaseUrl } = this.getConfig();
    const redirectUri = `${websiteBaseUrl}/connect/jupyterlab/callback`;
    const authUrl =
      `${websiteBaseUrl}/connect/jupyterlab?` +
      `state=${encodeURIComponent(state)}` +
      `&code_challenge=${encodeURIComponent(codeChallenge)}` +
      `&code_challenge_method=S256` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}`;

    window.open(authUrl, 'smarts-bio-auth', 'width=520,height=680,popup=1');
  }

  /** Called by OAuthCallback when the popup posts back the auth code. */
  async handleCallback(code: string, state: string): Promise<void> {
    if (!this._pendingState || state !== this._pendingState) {
      // Stale or duplicate message (e.g. React Strict Mode fires effects twice) — ignore silently.
      return;
    }

    const verifier = this._pendingVerifier!;

    // Clear pending PKCE state
    this._pendingState = null;
    this._pendingVerifier = null;

    const { websiteBaseUrl } = this.getConfig();
    const redirectUri = `${websiteBaseUrl}/connect/jupyterlab/callback`;
    const response = await fetch(`${websiteBaseUrl}/api/connect/jupyterlab/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        code_verifier: verifier,
        redirect_uri: redirectUri,
      }),
    });

    if (!response.ok) {
      throw new Error(`Token exchange failed: ${response.statusText}`);
    }

    const { access_token, refresh_token } = (await response.json()) as {
      access_token: string;
      refresh_token: string;
    };

    localStorage.setItem(TOKEN_KEY, access_token);
    localStorage.setItem(REFRESH_TOKEN_KEY, refresh_token);

    await this._fetchAndCacheProfile(access_token);
    this._scheduleRefresh();
  }

  /** Sign out: delete all stored credentials and reset state. */
  async signOut(): Promise<void> {
    this._clearRefreshTimer();
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    await this.stateDB.remove(PROFILE_STATE_DB_KEY);
    this._profile = null;
    this._notifyListeners();
  }

  /** Get the current access token. */
  async getToken(): Promise<string> {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      throw new Error('Not authenticated. Please sign in to smarts.bio.');
    }
    return token;
  }

  /** Called by API client when it receives a 401 response. */
  async handleUnauthorized(): Promise<boolean> {
    return this._tryRefresh();
  }

  private async _tryRefresh(): Promise<boolean> {
    const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
    if (!refreshToken) {
      this._profile = null;
      this._notifyListeners();
      return false;
    }

    const { websiteBaseUrl } = this.getConfig();
    try {
      const response = await fetch(`${websiteBaseUrl}/api/connect/jupyterlab/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });

      if (!response.ok) {
        await this.signOut();
        return false;
      }

      const { access_token, refresh_token: newRefreshToken } = (await response.json()) as {
        access_token: string;
        refresh_token: string;
      };

      localStorage.setItem(TOKEN_KEY, access_token);
      localStorage.setItem(REFRESH_TOKEN_KEY, newRefreshToken);
      await this._fetchAndCacheProfile(access_token);
      this._scheduleRefresh();
      return true;
    } catch {
      return false;
    }
  }

  private async _fetchAndCacheProfile(token: string): Promise<void> {
    const { apiBaseUrl } = this.getConfig();
    const response = await fetch(`${apiBaseUrl}/v1/user/profile`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch user profile');
    }

    const json = (await response.json()) as { status: string; data: UserProfile } | UserProfile;
    const profile =
      'data' in json && json.data ? json.data : (json as UserProfile);
    this._profile = profile;
    await this.stateDB.save(PROFILE_STATE_DB_KEY, profile as any);
    this._notifyListeners();
  }

  private _scheduleRefresh(): void {
    this._clearRefreshTimer();
    // Refresh profile every 5 minutes to keep credits up to date
    this._refreshTimer = setInterval(async () => {
      try {
        const token = localStorage.getItem(TOKEN_KEY);
        if (token) {
          await this._fetchAndCacheProfile(token);
        }
      } catch {
        // Silently fail background refresh
      }
    }, 5 * 60 * 1000);
  }

  private _clearRefreshTimer(): void {
    if (this._refreshTimer !== undefined) {
      clearInterval(this._refreshTimer);
      this._refreshTimer = undefined;
    }
  }

  private _notifyListeners(): void {
    for (const listener of this._listeners) {
      listener(this._profile);
    }
  }
}

// --- PKCE helpers ---

function generateCodeVerifier(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(64));
  return base64UrlEncode(bytes);
}

async function sha256Base64url(input: string): Promise<string> {
  const encoded = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
  return base64UrlEncode(new Uint8Array(hashBuffer));
}

function base64UrlEncode(buf: Uint8Array): string {
  let str = '';
  buf.forEach(b => (str += String.fromCharCode(b)));
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}
