import React, { useEffect, useRef } from 'react';
import { Paperclip, ChevronRight } from 'react-bootstrap-icons';
import { renderFileIcon } from '../../utils/fileIcons';
import type { FileItem } from '../App';

interface Props {
  files: FileItem[];
  activeIndex: number;
  isLoading: boolean;
  browsePath: string;
  onSelect: (file: FileItem) => void;
  onClose: () => void;
}

export function AtFileDropdown({ files, activeIndex, isLoading, browsePath, onSelect, onClose }: Props): React.ReactElement {
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.headerLeft}>
          <Paperclip size={11} style={{ marginRight: 5, flexShrink: 0 }} />
          {browsePath ? browsePath + '/' : 'smarts.bio Files'}
        </span>
        <button style={styles.closeBtn} onMouseDown={e => { e.preventDefault(); onClose(); }}>✕</button>
      </div>
      <div style={styles.list}>
        {isLoading && <div style={styles.empty}>Loading files…</div>}
        {!isLoading && files.length === 0 && <div style={styles.empty}>No files found</div>}
        {!isLoading && files.map((file, idx) => {
          const isActive = idx === activeIndex;
          return (
            <button
              key={file.path}
              ref={isActive ? activeRef : undefined}
              style={{
                ...styles.item,
                background: isActive ? 'var(--vscode-list-activeSelectionBackground)' : 'transparent',
                color: isActive ? 'var(--vscode-list-activeSelectionForeground)' : 'var(--vscode-foreground)',
              }}
              onMouseDown={e => { e.preventDefault(); onSelect(file); }}
            >
              <span style={styles.icon}>
                {renderFileIcon(file.name, file.isDirectory, 13)}
              </span>
              <span style={styles.itemBody}>
                <span style={styles.itemName}>{file.name}{file.isDirectory ? '/' : ''}</span>
                <span style={{ ...styles.itemPath, color: isActive ? 'inherit' : 'var(--vscode-descriptionForeground)' }}>
                  {file.path}
                </span>
              </span>
              {file.isDirectory && (
                <ChevronRight size={12} color="var(--vscode-descriptionForeground)" style={{ flexShrink: 0 }} />
              )}
            </button>
          );
        })}
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
    maxHeight: '280px',
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
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
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
  item: {
    display: 'flex',
    alignItems: 'center',
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
    display: 'flex',
    alignItems: 'center',
    flexShrink: 0,
  },
  itemBody: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1px',
    minWidth: 0,
    flex: 1,
  },
  itemName: {
    fontSize: '12px',
    fontWeight: 500,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  itemPath: {
    fontSize: '10px',
    fontFamily: 'var(--vscode-editor-font-family, monospace)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  empty: {
    padding: '12px',
    fontSize: '12px',
    color: 'var(--vscode-descriptionForeground)',
    textAlign: 'center',
  },
};
