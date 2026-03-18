// NOTE: Copied from smarts-bio-vscode/webview-ui/chat/components/ChatView.tsx
// Only change: EmptyState hint updated to mention notebook cell context (Jupyter-specific)
import React, { useRef, useEffect, useState, useCallback, KeyboardEvent } from 'react';
import type { UserProfile, ChatMessage, ContextAttachment } from '../types';
import { MessageBubble } from './MessageBubble';
import { ContextPill } from './ContextPill';
import { SlashCommandDropdown } from './SlashCommandDropdown';
import { AtFileDropdown } from './AtFileDropdown';
import type { SlashItem, FileItem } from '../App';

interface Props {
  profile: UserProfile;
  messages: ChatMessage[];
  streamingContent: string | null;
  toolStatus: string | null;
  context: ContextAttachment | null;
  isLoading: boolean;
  sendOnEnter: boolean;
  slashCatalog: SlashItem[] | null;
  fileList: FileItem[] | null;
  fileBrowsePath: string;
  onSend: (text: string) => void;
  onStop: () => void;
  onSuggestion: (text: string) => void;
  onNewChat: () => void;
  onInsertCode: (code: string) => void;
  onClearContext: () => void;
  onFetchFiles: (path: string) => void;
}

export function ChatView({
  profile,
  messages,
  streamingContent,
  toolStatus,
  context,
  isLoading,
  sendOnEnter,
  slashCatalog,
  fileList,
  fileBrowsePath,
  onSend,
  onStop,
  onSuggestion,
  onNewChat,
  onInsertCode,
  onClearContext,
  onFetchFiles,
}: Props): React.ReactElement {
  const [inputText, setInputText] = useState('');
  const [slashQuery, setSlashQuery] = useState<string | null>(null);
  const [slashActive, setSlashActive] = useState(false);
  const [slashIndex, setSlashIndex] = useState(0);
  const [atQuery, setAtQuery] = useState<string | null>(null);
  const [atActive, setAtActive] = useState(false);
  const [atIndex, setAtIndex] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const filteredCommands =
    slashQuery !== null
      ? (slashCatalog ?? []).filter(c => {
          if (!slashQuery) return true;
          const q = slashQuery.toLowerCase();
          return (
            c.id.includes(q) ||
            c.name.toLowerCase().includes(q) ||
            c.description.toLowerCase().includes(q)
          );
        })
      : [];

  const closeSlash = useCallback(() => {
    setSlashActive(false);
    setSlashQuery(null);
    setSlashIndex(0);
  }, []);

  const closeAt = useCallback(() => {
    setAtActive(false);
    setAtQuery(null);
    setAtIndex(0);
  }, []);

  const handleSlashSelect = useCallback(
    (cmd: SlashItem) => {
      setInputText(prev =>
        prev.replace(/(?:^|(\s))\/\S*$/, (_, space) => `${space ?? ''}/${cmd.id} `),
      );
      closeSlash();
      setTimeout(() => inputRef.current?.focus(), 0);
    },
    [closeSlash],
  );

  const atLastSlash = (atQuery ?? '').lastIndexOf('/');
  const atBrowsePath = atLastSlash >= 0 ? (atQuery ?? '').slice(0, atLastSlash) : '';
  const atFilter =
    atLastSlash >= 0 ? (atQuery ?? '').slice(atLastSlash + 1) : (atQuery ?? '');

  const atListReady = fileList !== null && fileBrowsePath === atBrowsePath;
  const filteredFiles =
    atQuery !== null && atListReady
      ? fileList!.filter(
          f => atFilter === '' || f.name.toLowerCase().includes(atFilter.toLowerCase()),
        )
      : [];

  useEffect(() => {
    if (atActive) {
      onFetchFiles(atBrowsePath);
    }
  }, [atActive, atBrowsePath, onFetchFiles]);

  const handleAtSelect = useCallback(
    (file: FileItem) => {
      if (file.isDirectory) {
        const newQuery = file.path + '/';
        setInputText(prev =>
          prev.replace(/(?:^|(\s))@\S*$/, (_, space) => `${space ?? ''}@${newQuery}`),
        );
        setAtQuery(newQuery);
        setAtIndex(0);
      } else {
        setInputText(prev =>
          prev.replace(/(?:^|(\s))@\S*$/, (_, space) => `${space ?? ''}@${file.path} `),
        );
        closeAt();
        setTimeout(() => inputRef.current?.focus(), 0);
      }
    },
    [closeAt],
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) {
      return;
    }
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [inputText]);

  const handleSend = useCallback(() => {
    const text = inputText.trim();
    if (!text || isLoading) {
      return;
    }
    closeSlash();
    closeAt();
    onSend(text);
    setInputText('');
  }, [inputText, isLoading, onSend, closeSlash, closeAt]);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const val = e.target.value;
      setInputText(val);

      const slashMatch = val.match(/(?:^|\s)\/(\S*)$/);
      if (slashMatch) {
        setSlashQuery(slashMatch[1]);
        setSlashActive(true);
        setSlashIndex(0);
        closeAt();
        return;
      }

      const atMatch = val.match(/(?:^|\s)@(\S*)$/);
      if (atMatch) {
        setAtQuery(atMatch[1]);
        setAtActive(true);
        setAtIndex(0);
        closeSlash();
        return;
      }

      closeSlash();
      closeAt();
    },
    [closeSlash, closeAt],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (slashActive && filteredCommands.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setSlashIndex(i => Math.min(i + 1, filteredCommands.length - 1));
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSlashIndex(i => Math.max(i - 1, 0));
          return;
        }
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          const cmd = filteredCommands[slashIndex];
          if (cmd) handleSlashSelect(cmd);
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          closeSlash();
          return;
        }
      }

      if (atActive && (filteredFiles.length > 0 || atListReady)) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setAtIndex(i => Math.min(i + 1, filteredFiles.length - 1));
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setAtIndex(i => Math.max(i - 1, 0));
          return;
        }
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          const f = filteredFiles[atIndex];
          if (f) handleAtSelect(f);
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          closeAt();
          return;
        }
      }

      if (e.key === 'Enter' && !e.shiftKey && sendOnEnter) {
        e.preventDefault();
        handleSend();
      }
    },
    [
      handleSend,
      sendOnEnter,
      slashActive,
      filteredCommands,
      slashIndex,
      handleSlashSelect,
      closeSlash,
      atActive,
      filteredFiles,
      atIndex,
      handleAtSelect,
      closeAt,
      atListReady,
    ],
  );

  const isEmpty = messages.length === 0 && !isLoading;

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <div style={styles.headerBrand}>
            <span style={styles.headerTitle}>smarts.bio</span>
          </div>
          <span style={styles.headerSub}>
            {profile.name} · {profile.plan}
          </span>
        </div>
        <button style={styles.newChatBtn} onClick={onNewChat} title="New Chat">
          + New
        </button>
      </div>

      {/* Messages */}
      <div style={styles.messages}>
        {isEmpty && <EmptyState onSuggestion={onSuggestion} profile={profile} />}

        {messages.map(msg => (
          <MessageBubble
            key={msg.id}
            message={msg}
            onInsertCode={onInsertCode}
            onSuggestion={onSuggestion}
          />
        ))}

        {toolStatus && !streamingContent && (
          <div style={styles.toolStatus}>
            <span style={styles.toolStatusDot} />
            {toolStatus}
          </div>
        )}

        {streamingContent !== null && streamingContent.length > 0 && (
          <MessageBubble
            message={{
              id: 'streaming',
              role: 'assistant',
              content: streamingContent,
              timestamp: new Date(),
            }}
            isStreaming
            onInsertCode={onInsertCode}
            onSuggestion={onSuggestion}
          />
        )}

        <div ref={bottomRef} />
      </div>

      {context && <ContextPill context={context} onRemove={onClearContext} />}

      <div style={styles.inputWrapper}>
        {slashActive && (
          <SlashCommandDropdown
            commands={filteredCommands}
            activeIndex={slashIndex}
            isLoading={slashCatalog === null}
            onSelect={handleSlashSelect}
            onClose={closeSlash}
          />
        )}
        {atActive && (
          <AtFileDropdown
            files={filteredFiles}
            activeIndex={atIndex}
            isLoading={!atListReady}
            browsePath={atBrowsePath}
            onSelect={handleAtSelect}
            onClose={closeAt}
          />
        )}
        <div style={styles.inputArea}>
          <textarea
            ref={inputRef}
            style={styles.input}
            value={inputText}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Ask smarts.bio anything… (type / for commands)"
          />
          <button
            style={{
              ...styles.sendBtn,
              opacity: !isLoading && !inputText.trim() ? 0.5 : 1,
              cursor: !isLoading && !inputText.trim() ? 'not-allowed' : 'pointer',
            }}
            onClick={isLoading ? onStop : handleSend}
            disabled={!isLoading && !inputText.trim()}
          >
            {isLoading ? '⏹' : '↵'}
          </button>
        </div>
      </div>
      <div style={styles.inputHint}>Enter to send · Shift+Enter for newline · / for commands · @ for files</div>
    </div>
  );
}

function EmptyState({
  profile,
  onSuggestion: _onSuggestion,
}: {
  profile: UserProfile;
  onSuggestion: (text: string) => void;
}): React.ReactElement {
  return (
    <div style={styles.empty}>
      <p style={styles.emptyGreeting}>Welcome, {profile.name.split(' ')[0]}!</p>
      <div style={styles.emptySection}>
        <p style={styles.emptyHint}>
          Type <code style={styles.code}>/</code> to browse tools &amp; pipelines
        </p>
        <p style={styles.emptyExample}>
          "<em>/blast</em> this sequence against NCBI nt"
        </p>
        <p style={styles.emptyExample}>
          "<em>/rna-seq</em> pipeline on my 6 samples"
        </p>
      </div>
      <div style={styles.emptySection}>
        <p style={styles.emptyHint}>
          Type <code style={styles.code}>@</code> to attach a file from your workspace
        </p>
        <p style={styles.emptyExample}>
          "Explain the variants in <em>@cohort.vcf</em>"
        </p>
        <p style={styles.emptyExample}>
          "Analyze the structure in <em>@protein.pdb</em>"
        </p>
      </div>
      <p style={styles.emptyHint2}>
        Right-click any notebook cell → <em>Analyze with smarts.bio</em> to attach it as context
      </p>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 12px',
    borderBottom: '1px solid var(--vscode-panel-border)',
    flexShrink: 0,
  },
  headerLeft: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  headerBrand: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  headerTitle: {
    fontWeight: 600,
    fontSize: '13px',
  },
  headerSub: {
    fontSize: '11px',
    color: 'var(--vscode-descriptionForeground)',
  },
  newChatBtn: {
    padding: '3px 8px',
    fontSize: '11px',
    background: 'var(--vscode-button-secondaryBackground)',
    color: 'var(--vscode-button-secondaryForeground)',
    border: 'none',
    borderRadius: '3px',
    cursor: 'pointer',
    fontFamily: 'var(--vscode-font-family)',
  },
  messages: {
    flex: 1,
    overflowY: 'auto',
    padding: '8px 0',
    display: 'flex',
    flexDirection: 'column',
  },
  empty: {
    padding: '16px 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  emptyGreeting: {
    fontWeight: 600,
    margin: '0 0 2px',
  },
  emptyHint: {
    fontSize: '12px',
    color: 'var(--vscode-descriptionForeground)',
    margin: '6px 0 0',
  },
  emptySection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1px',
  },
  emptyExample: {
    fontSize: '11px',
    color: 'var(--vscode-descriptionForeground)',
    paddingLeft: '10px',
    lineHeight: 1.4,
    margin: 0,
  },
  code: {
    fontFamily: 'var(--vscode-editor-font-family, monospace)',
    background: 'var(--vscode-textCodeBlock-background)',
    padding: '0 3px',
    borderRadius: '3px',
    fontSize: '11px',
  },
  emptyHint2: {
    fontSize: '11px',
    color: 'var(--vscode-descriptionForeground)',
    margin: '6px 0 0',
    lineHeight: 1.4,
  },
  inputWrapper: {
    position: 'relative',
    flexShrink: 0,
  },
  inputArea: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: '6px',
    padding: '8px 10px 6px',
    borderTop: '1px solid var(--vscode-panel-border)',
  },
  input: {
    flex: 1,
    background: 'var(--vscode-input-background)',
    color: 'var(--vscode-input-foreground)',
    border: '1px solid var(--vscode-input-border)',
    borderRadius: '4px',
    padding: '6px 8px',
    fontSize: '13px',
    fontFamily: 'var(--vscode-font-family)',
    resize: 'none',
    outline: 'none',
    lineHeight: 1.4,
    minHeight: '60px',
    maxHeight: '200px',
    overflowY: 'auto',
  },
  sendBtn: {
    width: '28px',
    height: '28px',
    background: 'var(--vscode-button-background)',
    color: 'var(--vscode-button-foreground)',
    border: 'none',
    borderRadius: '4px',
    fontSize: '14px',
    cursor: 'pointer',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputHint: {
    fontSize: '10px',
    color: 'var(--vscode-descriptionForeground)',
    textAlign: 'center',
    paddingBottom: '4px',
    flexShrink: 0,
  },
  toolStatus: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 12px',
    fontSize: '12px',
    color: 'var(--vscode-descriptionForeground)',
    fontStyle: 'italic',
  },
  toolStatusDot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    background: 'var(--vscode-progressBar-background)',
    flexShrink: 0,
    animation: 'pulse 1.2s ease-in-out infinite',
  },
};
