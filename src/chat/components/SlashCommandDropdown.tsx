// NOTE: Copied verbatim from smarts-bio-vscode/webview-ui/chat/components/SlashCommandDropdown.tsx
import React, { useEffect, useRef } from 'react';
import type { SlashItem } from '../App';

interface Props {
  commands: SlashItem[];
  activeIndex: number;
  isLoading: boolean;
  onSelect: (command: SlashItem) => void;
  onClose: () => void;
}

const CATEGORY_ICON: Record<string, string> = {
  database:            '🗄️',
  algorithm:           '⚙️',
  utility:             '🔧',
  ai:                  '🤖',
  'quality-control':   '✅',
  alignment:           '📐',
  transcriptomics:     '📊',
  'variant-calling':   '🧬',
  genomics:            '🔬',
  epigenomics:         '🔬',
  'structural-biology':'🧪',
  'drug-discovery':    '💊',
};

export function SlashCommandDropdown({ commands, activeIndex, isLoading, onSelect, onClose }: Props): React.ReactElement {
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const aiTools = commands.filter(c => c.type === 'tool' && c.category === 'ai');
  const tools = commands.filter(c => c.type === 'tool' && c.category !== 'ai');
  const pipelines = commands.filter(c => c.type === 'pipeline');

  let globalIdx = 0;
  const renderItem = (cmd: SlashItem) => {
    const idx = globalIdx++;
    const isActive = idx === activeIndex;
    return (
      <button
        key={cmd.id}
        ref={isActive ? activeRef : undefined}
        style={{
          ...styles.item,
          background: isActive ? 'var(--vscode-list-activeSelectionBackground)' : 'transparent',
          color: isActive ? 'var(--vscode-list-activeSelectionForeground)' : 'var(--vscode-foreground)',
        }}
        onMouseDown={e => { e.preventDefault(); onSelect(cmd); }}
      >
        <span style={styles.icon}>{CATEGORY_ICON[cmd.category] ?? '🔬'}</span>
        <span style={styles.itemBody}>
          <span style={styles.itemTop}>
            <span style={styles.itemName}>{cmd.name}</span>
            <span style={{ ...styles.itemId, color: isActive ? 'inherit' : 'var(--vscode-textLink-foreground)' }}>
              /{cmd.id}
            </span>
          </span>
          <span style={{ ...styles.itemDesc, color: isActive ? 'inherit' : 'var(--vscode-descriptionForeground)' }}>
            {cmd.description}
          </span>
        </span>
      </button>
    );
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span>⚡ Commands</span>
        <button style={styles.closeBtn} onMouseDown={e => { e.preventDefault(); onClose(); }}>✕</button>
      </div>
      <div style={styles.list}>
        {aiTools.length > 0 && (
          <>
            <div style={styles.section}>AI Tools</div>
            {aiTools.map(renderItem)}
          </>
        )}
        {tools.length > 0 && (
          <>
            <div style={styles.section}>Tools</div>
            {tools.map(renderItem)}
          </>
        )}
        {pipelines.length > 0 && (
          <>
            <div style={styles.section}>Pipelines</div>
            {pipelines.map(renderItem)}
          </>
        )}
        {isLoading && commands.length === 0 && (
          <div style={styles.empty}>Loading commands…</div>
        )}
        {!isLoading && commands.length === 0 && (
          <div style={styles.empty}>No commands match</div>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'absolute',
    bottom: '100%',
    left: 0,
    right: 0,
    marginBottom: '4px',
    background: 'var(--vscode-editorWidget-background, var(--vscode-editor-background))',
    border: '1px solid var(--vscode-editorWidget-border, var(--vscode-panel-border))',
    borderRadius: '6px',
    boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
    zIndex: 100,
    display: 'flex',
    flexDirection: 'column',
    maxHeight: '320px',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '6px 10px',
    fontSize: '11px',
    fontWeight: 600,
    color: 'var(--vscode-descriptionForeground)',
    borderBottom: '1px solid var(--vscode-panel-border)',
    flexShrink: 0,
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--vscode-descriptionForeground)',
    cursor: 'pointer',
    fontSize: '11px',
    padding: '0 2px',
    lineHeight: 1,
  },
  list: {
    overflowY: 'auto',
    flex: 1,
  },
  section: {
    padding: '4px 10px 2px',
    fontSize: '10px',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: 'var(--vscode-descriptionForeground)',
    opacity: 0.7,
  },
  item: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '8px',
    width: '100%',
    padding: '5px 10px',
    border: 'none',
    cursor: 'pointer',
    textAlign: 'left',
    fontFamily: 'var(--vscode-font-family)',
    transition: 'background 0.1s',
  },
  icon: {
    fontSize: '14px',
    flexShrink: 0,
    marginTop: '1px',
  },
  itemBody: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1px',
    minWidth: 0,
  },
  itemTop: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    flexWrap: 'wrap',
  },
  itemName: {
    fontSize: '12px',
    fontWeight: 600,
  },
  itemId: {
    fontSize: '11px',
    fontFamily: 'var(--vscode-editor-font-family, monospace)',
    opacity: 0.85,
  },
  itemDesc: {
    fontSize: '11px',
    lineHeight: 1.3,
  },
  empty: {
    padding: '12px',
    fontSize: '12px',
    color: 'var(--vscode-descriptionForeground)',
    textAlign: 'center',
  },
};
