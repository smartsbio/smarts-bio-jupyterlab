// NOTE: Adapted from smarts-bio-vscode/webview-ui/chat/App.tsx
// Key changes from VS Code version:
//   - Removed all postMessage / window.addEventListener('message') bridge
//   - All actions are passed as direct React props/callbacks from ChatWidget
//   - No more vscode.ts import
//   - Added onStop, onSignOut, onFetchFiles as explicit props
import React, { useReducer, useCallback } from 'react';
import { SignedOutView } from './components/SignedOutView';
import { ChatView } from './components/ChatView';
import type { UserProfile, ChatMessage, ContextAttachment } from './types';

export interface SlashItem {
  id: string;
  name: string;
  description: string;
  category: string;
  type: 'tool' | 'pipeline';
}

export interface FileItem {
  name: string;
  path: string;
  isDirectory: boolean;
  source: 'local' | 'remote';
  key?: string;
}

interface AppState {
  profile: UserProfile | null;
  messages: ChatMessage[];
  streamingMessageId: string | null;
  streamingContent: string;
  toolStatus: string | null;
  context: ContextAttachment | null;
  isLoading: boolean;
  sendOnEnter: boolean;
  slashCatalog: SlashItem[] | null;
  fileList: FileItem[] | null;
  fileBrowsePath: string;
}

export type AppAction =
  | { type: 'SET_PROFILE'; profile: UserProfile | null }
  | { type: 'SET_CONFIG'; sendOnEnter: boolean }
  | { type: 'ADD_USER_MESSAGE'; text: string; id: string }
  | { type: 'STREAM_START'; messageId: string }
  | { type: 'STREAM_CHUNK'; messageId: string; content: string }
  | { type: 'TOOL_USE'; toolName: string }
  | { type: 'STREAM_END'; messageId: string }
  | { type: 'STREAM_ERROR'; messageId: string; error: string }
  | { type: 'SET_CONTEXT'; context: ContextAttachment | null }
  | { type: 'SET_SLASH_CATALOG'; items: SlashItem[] }
  | { type: 'SET_FILE_LIST'; files: FileItem[]; browsePath: string }
  | { type: 'RESET' };

function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_PROFILE':
      return { ...state, profile: action.profile };

    case 'ADD_USER_MESSAGE':
      return {
        ...state,
        messages: [
          ...state.messages,
          { id: action.id, role: 'user', content: action.text, timestamp: new Date() },
        ],
      };

    case 'STREAM_START':
      return {
        ...state,
        streamingMessageId: action.messageId,
        streamingContent: '',
        toolStatus: null,
        isLoading: true,
      };

    case 'STREAM_CHUNK':
      return {
        ...state,
        streamingContent: state.streamingContent + (action.content ?? ''),
        toolStatus: null,
      };

    case 'TOOL_USE':
      return { ...state, toolStatus: formatToolStatus(action.toolName) };

    case 'STREAM_END': {
      if (!state.streamingMessageId) {
        return { ...state, isLoading: false, toolStatus: null };
      }
      const assistantMessage: ChatMessage = {
        id: state.streamingMessageId,
        role: 'assistant',
        content: state.streamingContent,
        timestamp: new Date(),
      };
      return {
        ...state,
        messages: [...state.messages, assistantMessage],
        streamingMessageId: null,
        streamingContent: '',
        toolStatus: null,
        isLoading: false,
      };
    }

    case 'STREAM_ERROR':
      return {
        ...state,
        messages: [
          ...state.messages,
          {
            id: action.messageId,
            role: 'assistant',
            content: `Error: ${action.error}`,
            timestamp: new Date(),
            isError: true,
          },
        ],
        streamingMessageId: null,
        streamingContent: '',
        toolStatus: null,
        isLoading: false,
      };

    case 'SET_CONFIG':
      return { ...state, sendOnEnter: action.sendOnEnter };

    case 'SET_CONTEXT':
      return { ...state, context: action.context };

    case 'SET_SLASH_CATALOG':
      return { ...state, slashCatalog: action.items };

    case 'SET_FILE_LIST':
      return { ...state, fileList: action.files, fileBrowsePath: action.browsePath };

    case 'RESET':
      return {
        ...state,
        messages: [],
        streamingMessageId: null,
        streamingContent: '',
        toolStatus: null,
        context: null,
      };

    default:
      return state;
  }
}

const initialState: AppState = {
  profile: null,
  messages: [],
  streamingMessageId: null,
  streamingContent: '',
  toolStatus: null,
  context: null,
  isLoading: false,
  sendOnEnter: true,
  slashCatalog: null,
  fileList: null,
  fileBrowsePath: '',
};

const TOOL_LABELS: Record<string, string> = {
  blast_search: 'Running BLAST search…',
  ncbi_search: 'Searching NCBI…',
  ncbi_fetch: 'Fetching from NCBI…',
  pubmed_search: 'Searching PubMed…',
  string_db: 'Querying STRING DB…',
  gatk: 'Running GATK…',
  file_reader: 'Reading file…',
  web_search: 'Searching the web…',
  sequence_alignment: 'Running alignment…',
  variant_calling: 'Running variant calling…',
  format_conversion: 'Converting format…',
};

function formatToolStatus(toolName: string): string {
  return TOOL_LABELS[toolName] ?? toolName;
}

export interface AppProps {
  /** Initial profile (may be null if not yet authenticated) */
  profile: UserProfile | null;
  sendOnEnter: boolean;
  slashCatalog: SlashItem[] | null;
  /** Called when the user submits a message; the widget handles streaming */
  onSend: (text: string) => void;
  /** Called when the user clicks Stop during streaming */
  onStop: () => void;
  /** Called when the user clicks New Chat */
  onNewChat: () => void;
  /** Called when the user clicks Sign In */
  onSignIn: () => void;
  /** Called when the user clicks a suggestion chip */
  onSuggestion: (text: string) => void;
  /** Called when user clicks "Insert into Editor" on a code block */
  onInsertCode: (code: string) => void;
  /** Called when context pill is removed */
  onClearContext: () => void;
  /** Called when @ file dropdown needs to list a path */
  onFetchFiles: (path: string) => void;
  /** Dispatch reference — ChatWidget uses this to push stream updates */
  dispatchRef: React.MutableRefObject<React.Dispatch<AppAction> | null>;
}

export function App({
  profile: initialProfile,
  sendOnEnter: initialSendOnEnter,
  slashCatalog: initialCatalog,
  onSend,
  onStop,
  onNewChat,
  onSignIn,
  onSuggestion,
  onInsertCode,
  onClearContext,
  onFetchFiles,
  dispatchRef,
}: AppProps): React.ReactElement {
  const [state, dispatch] = useReducer(reducer, {
    ...initialState,
    profile: initialProfile,
    sendOnEnter: initialSendOnEnter,
    slashCatalog: initialCatalog,
  });

  // Expose dispatch to the parent widget for streaming updates
  dispatchRef.current = dispatch;

  const handleSend = useCallback(
    (text: string) => {
      if (!text.trim() || state.isLoading) return;
      const id = Math.random().toString(36).slice(2);
      dispatch({ type: 'ADD_USER_MESSAGE', text, id });
      onSend(text);
    },
    [state.isLoading, onSend],
  );

  const handleSuggestion = useCallback(
    (text: string) => {
      const id = Math.random().toString(36).slice(2);
      dispatch({ type: 'ADD_USER_MESSAGE', text, id });
      onSuggestion(text);
    },
    [onSuggestion],
  );

  const handleClearContext = useCallback(() => {
    dispatch({ type: 'SET_CONTEXT', context: null });
    onClearContext();
  }, [onClearContext]);

  if (!state.profile) {
    return <SignedOutView onSignIn={onSignIn} />;
  }

  return (
    <ChatView
      profile={state.profile}
      messages={state.messages}
      streamingContent={state.isLoading ? state.streamingContent : null}
      toolStatus={state.isLoading ? state.toolStatus : null}
      context={state.context}
      isLoading={state.isLoading}
      sendOnEnter={state.sendOnEnter}
      slashCatalog={state.slashCatalog}
      fileList={state.fileList}
      fileBrowsePath={state.fileBrowsePath}
      onSend={handleSend}
      onStop={onStop}
      onSuggestion={handleSuggestion}
      onNewChat={onNewChat}
      onInsertCode={onInsertCode}
      onClearContext={handleClearContext}
      onFetchFiles={onFetchFiles}
    />
  );
}
