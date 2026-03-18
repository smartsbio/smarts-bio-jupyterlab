import React from 'react';
import { Paperclip, Scissors } from 'react-bootstrap-icons';
import type { ContextAttachment } from '../types';

interface Props {
  context: ContextAttachment;
  onRemove: () => void;
}

export function ContextPill({ context, onRemove }: Props): React.ReactElement {
  const Icon = context.type === 'file' ? Paperclip : Scissors;

  return (
    <div style={styles.pill}>
      <Icon size={12} color="var(--vscode-descriptionForeground)" style={{ flexShrink: 0 }} />
      <span style={styles.label} title={context.content}>
        {context.label}
      </span>
      <button style={styles.removeBtn} onClick={onRemove} title="Remove context">
        ✕
      </button>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  pill: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '4px 10px',
    margin: '0 10px 4px',
    background: 'var(--vscode-editor-background)',
    border: '1px solid var(--vscode-panel-border)',
    borderRadius: '12px',
    fontSize: '12px',
    flexShrink: 0,
  },
  label: {
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    color: 'var(--vscode-foreground)',
  },
  removeBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--vscode-descriptionForeground)',
    cursor: 'pointer',
    fontSize: '12px',
    padding: '0',
    lineHeight: 1,
    fontFamily: 'var(--vscode-font-family)',
  },
};
