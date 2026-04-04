// NOTE: JupyterLab-specific — replaces the VS Code WebviewViewProvider pattern.
// ChatWidget is a ReactWidget that renders <ChatApp> from @smartsbio/ui directly.
// No postMessage bridge needed — JupyterLab panels run in the same DOM.
import React from 'react';
import { ReactWidget } from '@jupyterlab/apputils';
import { ChatApp, ChatAction } from '@smartsbio/ui';
import type { ContextAttachment } from '@smartsbio/ui';
import { AuthProvider } from '../auth/AuthProvider';
import { SmartsBioClient } from '../api/SmartsBioClient';
import { WorkspaceSelector } from '../workspace/WorkspaceSelector';
import { CellInserter } from '../notebook/CellInserter';

export class ChatWidget extends ReactWidget {
  private _conversationId: string = crypto.randomUUID();
  private _activeStream: AbortController | undefined;
  private _context: ContextAttachment | undefined;
  private _dispatchRef = { current: null as React.Dispatch<ChatAction> | null };

  constructor(
    private readonly auth: AuthProvider,
    private readonly client: SmartsBioClient,
    private readonly workspaceSelector: WorkspaceSelector,
    private readonly cellInserter: CellInserter,
  ) {
    super();
    this.addClass('smarts-bio-panel');

    // Re-render on auth changes so profile flows into ChatApp's initial prop
    auth.onAuthChange((profile) => {
      this._dispatchRef.current?.({ type: 'SET_PROFILE', profile });
      this.update();
    });
  }

  /** Attach context (called from CellContextProvider or file context menu). */
  attachContext(context: ContextAttachment): void {
    this._context = context;
    this._dispatchRef.current?.({ type: 'SET_CONTEXT', context });
  }

  /** Start a new conversation (called by smarts-bio:new-chat command). */
  newConversation(): void {
    this._activeStream?.abort();
    this._context = undefined;
    this._conversationId = crypto.randomUUID();
    this._dispatchRef.current?.({ type: 'RESET' });
  }

  /** Programmatically send a message (called by analyze-cell / analyze-selection commands). */
  async sendMessage(text: string): Promise<void> {
    await this._handleSend(text, 'analysis');
  }

  private _getWorkspaceId(): string {
    return this.workspaceSelector.selectedWorkspaceId || this.auth.profile?.defaultWorkspaceId || '';
  }

  private async _handleSend(text: string, _mode: 'analysis' | 'script'): Promise<void> {
    if (!text.trim() || !this.auth.isAuthenticated) return;

    const workspaceId = this._getWorkspaceId();
    const messageId = crypto.randomUUID();

    this._activeStream?.abort();
    this._activeStream = new AbortController();

    this._dispatchRef.current?.({ type: 'STREAM_START', messageId });

    try {
      const stream = this.client.streamQuery(
        text,
        this._conversationId,
        workspaceId,
        this._context,
        this._activeStream.signal,
      );

      for await (const chunk of stream) {
        if (this._activeStream?.signal.aborted) break;

        if (chunk.type === 'text') {
          this._dispatchRef.current?.({ type: 'STREAM_CHUNK', messageId, content: chunk.content ?? '' });
        } else if (chunk.type === 'tool_use') {
          this._dispatchRef.current?.({ type: 'TOOL_USE', toolName: chunk.toolName ?? '' });
        } else if (chunk.type === 'error') {
          this._dispatchRef.current?.({ type: 'STREAM_ERROR', messageId, error: chunk.content ?? 'Unknown error' });
          return;
        } else if (chunk.type === 'done') {
          break;
        }
      }

      // Clear context after successful send
      this._context = undefined;
      this._dispatchRef.current?.({ type: 'SET_CONTEXT', context: null });
      this._dispatchRef.current?.({ type: 'STREAM_END', messageId });
    } catch (err: unknown) {
      const name = err instanceof Error ? err.name : '';
      const message = err instanceof Error ? err.message : String(err);
      if (name === 'AbortError') {
        this._dispatchRef.current?.({ type: 'STREAM_END', messageId });
      } else {
        this._dispatchRef.current?.({ type: 'STREAM_ERROR', messageId, error: message });
      }
    } finally {
      this._activeStream = undefined;
    }
  }

  private async _handleConfirmScript(threadId: string): Promise<void> {
    const workspaceId = this._getWorkspaceId();
    const messageId = crypto.randomUUID();
    const sessionId = this._conversationId;

    this._activeStream?.abort();
    this._activeStream = new AbortController();

    this._dispatchRef.current?.({ type: 'STREAM_START', messageId });

    try {
      const stream = this.client.streamConfirmScript(
        threadId,
        workspaceId,
        sessionId,
        this._activeStream.signal,
      );

      for await (const chunk of stream) {
        if (this._activeStream?.signal.aborted) break;

        if (chunk.type === 'text') {
          this._dispatchRef.current?.({ type: 'STREAM_CHUNK', messageId, content: chunk.content ?? '' });
        } else if (chunk.type === 'tool_use') {
          this._dispatchRef.current?.({ type: 'TOOL_USE', toolName: chunk.toolName ?? '' });
        } else if (chunk.type === 'error') {
          this._dispatchRef.current?.({ type: 'STREAM_ERROR', messageId, error: chunk.error ?? 'Unknown error' });
          return;
        } else if (chunk.type === 'done') {
          break;
        }
      }

      this._dispatchRef.current?.({ type: 'STREAM_END', messageId });
    } catch (err: unknown) {
      const name = err instanceof Error ? err.name : '';
      const message = err instanceof Error ? err.message : String(err);
      if (name === 'AbortError') {
        this._dispatchRef.current?.({ type: 'STREAM_END', messageId });
      } else {
        this._dispatchRef.current?.({ type: 'STREAM_ERROR', messageId, error: message });
      }
    } finally {
      this._activeStream = undefined;
    }
  }

  private async _handleFetchFiles(path: string): Promise<void> {
    const workspaceId = this._getWorkspaceId();
    if (!workspaceId || !this.auth.isAuthenticated) {
      this._dispatchRef.current?.({ type: 'SET_FILE_LIST', files: [], browsePath: path });
      return;
    }
    try {
      const items = await this.client.getFiles(workspaceId, path || undefined);
      const files = items
        .map(item => ({
          name: item.name,
          path: path ? `${path}/${item.name}` : item.name,
          isDirectory: item.type === 'folder',
          source: 'remote' as const,
          key: item.key,
        }))
        .sort((a, b) => {
          if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
      this._dispatchRef.current?.({ type: 'SET_FILE_LIST', files, browsePath: path });
    } catch {
      this._dispatchRef.current?.({ type: 'SET_FILE_LIST', files: [], browsePath: path });
    }
  }

  private async _handleFetchSlashCatalog(): Promise<void> {
    try {
      const catalog = await this.client.getCatalog();
      const items = [
        ...catalog.tools.map((t: any) => ({ ...t, type: 'tool' as const })),
        ...catalog.pipelines.map((p: any) => ({ ...p, type: 'pipeline' as const })),
      ];
      this._dispatchRef.current?.({ type: 'SET_SLASH_CATALOG', items });
    } catch {
      // Silently ignore — chat still works without autocomplete
    }
  }

  protected render(): React.ReactElement {
    return (
      <ChatApp
        profile={this.auth.profile}
        sendOnEnter={true}
        slashCatalog={null}
        dispatchRef={this._dispatchRef}
        onSend={async (text, mode) => {
          await this._handleSend(text, mode);
          await this._handleFetchSlashCatalog();
        }}
        onStop={() => {
          this._activeStream?.abort();
          this._activeStream = undefined;
          if (this._conversationId) {
            void this.client.stopQuery(this._conversationId);
          }
        }}
        onNewChat={() => this.newConversation()}
        onSignIn={() => { void this.auth.signIn(); }}
        onSuggestion={async (text) => {
          await this._handleSend(text, 'analysis');
        }}
        onInsertCode={(code) => this.cellInserter.insertCode(code)}
        onClearContext={() => {
          this._context = undefined;
        }}
        onFetchFiles={(path) => { void this._handleFetchFiles(path); }}
        onConfirmScript={(threadId) => { void this._handleConfirmScript(threadId); }}
        insertLabel="Insert ↓"
      />
    );
  }

  dispose(): void {
    this._activeStream?.abort();
    super.dispose();
  }
}
