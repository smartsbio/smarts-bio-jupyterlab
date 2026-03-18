// NOTE: Ported from smarts-bio-vscode/src/files/FilesExplorer.ts (TreeDataProvider).
// Converted to a pure React component with lazy folder expansion.
import React, { useEffect, useState, useCallback } from 'react';
import { CloudUpload, ChevronRight, ChevronDown } from 'react-bootstrap-icons';
import { renderFileIcon } from '../utils/fileIcons';
import { SmartsBioClient, WorkspaceFileItem } from '../api/SmartsBioClient';
import { WorkspaceSelector } from '../workspace/WorkspaceSelector';
import { SignedOutView } from '../chat/components/SignedOutView';

interface Props {
  isAuthenticated: boolean;
  workspaceId: string;
  client: SmartsBioClient;
  workspaceSelector: WorkspaceSelector;
  onOpenViewer: (fileKey: string, fileName: string, ext: string) => void;
  onAnalyzeFile: (fileKey: string, fileName: string) => void;
  refreshToken: number;
  onSignIn: () => void;
}

interface FileNode {
  item: WorkspaceFileItem;
  relativePath: string;
  expanded?: boolean;
  children?: FileNode[] | 'loading' | 'error';
}

function FolderChevron({ expanded }: { expanded?: boolean }): React.ReactElement {
  return expanded
    ? <ChevronDown size={10} color="var(--vscode-descriptionForeground, #888)" />
    : <ChevronRight size={10} color="var(--vscode-descriptionForeground, #888)" />;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function FilesPanel({ isAuthenticated, workspaceId, client, workspaceSelector, onOpenViewer, onAnalyzeFile, refreshToken, onSignIn }: Props): React.ReactElement {
  const [rootNodes, setRootNodes] = useState<FileNode[] | 'loading' | 'error' | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; node: FileNode } | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);

  const loadFolder = useCallback(async (path: string): Promise<FileNode[]> => {
    const items = await client.getFiles(workspaceId, path || undefined);
    return items.map(item => ({
      item,
      relativePath: path ? `${path}/${item.name}` : item.name,
    }));
  }, [client, workspaceId]);

  const loadRoot = useCallback(async () => {
    if (!isAuthenticated || !workspaceId) return;
    setRootNodes('loading');
    try {
      const nodes = await loadFolder('');
      setRootNodes(nodes);
    } catch {
      setRootNodes('error');
    }
  }, [isAuthenticated, workspaceId, loadFolder]);

  useEffect(() => {
    loadRoot();
  }, [loadRoot, refreshToken]);

  const toggleFolder = async (node: FileNode) => {
    if (node.item.type !== 'folder') return;
    if (node.expanded) {
      setRootNodes(prev => updateNode(prev as FileNode[], node.relativePath, n => ({ ...n, expanded: false })));
      return;
    }
    setRootNodes(prev => updateNode(prev as FileNode[], node.relativePath, n => ({ ...n, expanded: true, children: 'loading' })));
    try {
      const children = await loadFolder(node.relativePath);
      setRootNodes(prev => updateNode(prev as FileNode[], node.relativePath, n => ({ ...n, children })));
    } catch {
      setRootNodes(prev => updateNode(prev as FileNode[], node.relativePath, n => ({ ...n, children: 'error' })));
    }
  };

  const handleFileClick = (node: FileNode) => {
    if (node.item.type === 'folder') {
      toggleFolder(node);
    } else {
      const ext = '.' + (node.item.name.split('.').pop()?.toLowerCase() ?? '');
      Promise.resolve(onOpenViewer(node.item.key, node.item.name, ext)).catch((err: any) => {
        setUploadStatus(`Failed to open file: ${err?.message ?? err}`);
        setTimeout(() => setUploadStatus(null), 5000);
      });
    }
  };

  const handleContextMenu = (e: React.MouseEvent, node: FileNode) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, node });
  };

  const closeContextMenu = () => setContextMenu(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!workspaceId) return;
    setUploadStatus(`Uploading ${file.name}…`);
    try {
      await client.uploadFile(file, workspaceId);
      setUploadStatus(null);
      await loadRoot();
    } catch (err: any) {
      setUploadStatus(`Upload failed: ${err?.message ?? err}`);
      setTimeout(() => setUploadStatus(null), 4000);
    }
    e.target.value = '';
  };

  if (!isAuthenticated) {
    return <SignedOutView onSignIn={onSignIn} />;
  }
  if (!workspaceId) {
    return <div style={styles.empty}>Select a workspace to browse files.</div>;
  }

  return (
    <div style={styles.root} onClick={closeContextMenu}>
      <div style={styles.toolbar}>
        <span>Files</span>
        <div style={styles.toolbarActions}>
          <label style={styles.uploadLabel} title="Upload file">
            <CloudUpload size={14} />
            <input type="file" style={{ display: 'none' }} onChange={handleFileUpload} />
          </label>
          <button style={styles.iconBtn} title="Refresh" onClick={loadRoot}>⟳</button>
        </div>
      </div>
      {uploadStatus && <div style={styles.uploadStatus}>{uploadStatus}</div>}
      <div style={styles.tree}>
        {rootNodes === 'loading' && <div style={styles.empty}>Loading…</div>}
        {rootNodes === 'error' && <div style={styles.empty}>⚠ Failed to load files</div>}
        {Array.isArray(rootNodes) && rootNodes.length === 0 && (
          <div style={styles.empty}>No files. Upload a file to get started.</div>
        )}
        {Array.isArray(rootNodes) && rootNodes.map(node => (
          <FileNodeRow
            key={node.relativePath}
            node={node}
            depth={0}
            onClick={handleFileClick}
            onContextMenu={handleContextMenu}
          />
        ))}
      </div>
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          node={contextMenu.node}
          client={client}
          workspaceSelector={workspaceSelector}
          onAnalyzeFile={onAnalyzeFile}
          onClose={closeContextMenu}
          onRefresh={loadRoot}
        />
      )}
    </div>
  );
}

function FileNodeRow({
  node,
  depth,
  onClick,
  onContextMenu,
}: {
  node: FileNode;
  depth: number;
  onClick: (node: FileNode) => void;
  onContextMenu: (e: React.MouseEvent, node: FileNode) => void;
}): React.ReactElement {
  const isFolder = node.item.type === 'folder';

  return (
    <>
      <div
        style={{ ...styles.treeRow, paddingLeft: 10 + depth * 16 }}
        onClick={() => onClick(node)}
        onContextMenu={(e) => onContextMenu(e, node)}
      >
        {isFolder && <FolderChevron expanded={node.expanded} />}
        <span style={styles.fileIcon}>{renderFileIcon(node.item.name, node.item.type === 'folder')}</span>
        <span style={styles.fileName}>{node.item.name}</span>
        {node.item.size !== undefined && node.item.type === 'file' && (
          <span style={styles.fileSize}>{formatBytes(node.item.size)}</span>
        )}
      </div>
      {isFolder && node.expanded && (
        <>
          {node.children === 'loading' && (
            <div style={{ ...styles.empty, paddingLeft: 26 + depth * 16, paddingTop: 4, paddingBottom: 4, textAlign: 'left' }}>
              Loading…
            </div>
          )}
          {node.children === 'error' && (
            <div style={{ ...styles.empty, paddingLeft: 26 + depth * 16, paddingTop: 4, paddingBottom: 4, textAlign: 'left' }}>
              ⚠ Failed to load
            </div>
          )}
          {Array.isArray(node.children) && node.children.map(child => (
            <FileNodeRow
              key={child.relativePath}
              node={child}
              depth={depth + 1}
              onClick={onClick}
              onContextMenu={onContextMenu}
            />
          ))}
        </>
      )}
    </>
  );
}

function ContextMenu({
  x, y, node, client, workspaceSelector, onAnalyzeFile, onClose, onRefresh,
}: {
  x: number; y: number; node: FileNode;
  client: SmartsBioClient;
  workspaceSelector: WorkspaceSelector;
  onAnalyzeFile: (fileKey: string, fileName: string) => void;
  onClose: () => void;
  onRefresh: () => void;
}): React.ReactElement {
  const isFile = node.item.type === 'file';

  const runAction = async (action: () => Promise<void>) => {
    onClose();
    try {
      await action();
    } catch (err: any) {
      console.error('[smarts.bio FilesPanel]', err?.message ?? err);
    }
  };

  return (
    <div style={{ ...styles.contextMenu, left: x, top: y }} onClick={e => e.stopPropagation()}>
      {isFile && (
        <>
          <div style={styles.menuItem} onClick={() => runAction(async () => {
            onAnalyzeFile(node.item.key, node.item.name);
          })}>
            Analyze with smarts.bio
          </div>
          <div style={styles.menuItem} onClick={() => runAction(async () => {
            const wsId = workspaceSelector.selectedWorkspaceId;
            const url = await client.getFileDownloadUrl(wsId, node.item.key);
            const a = document.createElement('a');
            a.href = url;
            a.download = node.item.name;
            a.click();
          })}>
            Download
          </div>
          <div style={styles.menuDivider} />
        </>
      )}
      <div style={styles.menuItem} onClick={() => runAction(async () => {
        const newName = prompt('Rename to:', node.item.name);
        if (!newName || newName === node.item.name) return;
        await client.renameFile(workspaceSelector.selectedWorkspaceId, node.item.key, newName);
        onRefresh();
      })}>
        Rename
      </div>
      <div style={{ ...styles.menuItem, color: '#f85149' }} onClick={() => runAction(async () => {
        if (!confirm(`Delete "${node.item.name}"?`)) return;
        await client.deleteFile(workspaceSelector.selectedWorkspaceId, node.item.key);
        onRefresh();
      })}>
        Delete
      </div>
    </div>
  );
}

/** Recursive helper to update a specific node by relativePath */
function updateNode(
  nodes: FileNode[],
  targetPath: string,
  updater: (n: FileNode) => FileNode,
): FileNode[] {
  return nodes.map(n => {
    if (n.relativePath === targetPath) return updater(n);
    if (Array.isArray(n.children)) {
      return { ...n, children: updateNode(n.children, targetPath, updater) };
    }
    return n;
  });
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    fontFamily: 'var(--vscode-font-family)',
    fontSize: 'var(--vscode-font-size)',
    color: 'var(--vscode-foreground)',
    position: 'relative',
  },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '6px 10px',
    borderBottom: '1px solid var(--vscode-panel-border)',
    fontSize: '11px',
    fontWeight: 600,
    color: 'var(--vscode-descriptionForeground)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    flexShrink: 0,
  },
  toolbarActions: {
    display: 'flex',
    gap: '4px',
  },
  iconBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--vscode-descriptionForeground)',
    cursor: 'pointer',
    fontSize: '13px',
    padding: '2px 4px',
    borderRadius: '3px',
  },
  uploadLabel: {
    color: 'var(--vscode-descriptionForeground)',
    cursor: 'pointer',
    fontSize: '13px',
    padding: '2px 4px',
    borderRadius: '3px',
  },
  uploadStatus: {
    padding: '4px 10px',
    fontSize: '11px',
    color: 'var(--vscode-descriptionForeground)',
    background: 'var(--vscode-editor-background)',
    borderBottom: '1px solid var(--vscode-panel-border)',
  },
  tree: {
    flex: 1,
    overflowY: 'auto',
  },
  empty: {
    padding: '16px 14px',
    color: 'var(--vscode-descriptionForeground)',
    fontSize: '12px',
    textAlign: 'center',
    lineHeight: 1.6,
  },
  treeRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '3px 10px',
    cursor: 'pointer',
    userSelect: 'none',
    fontSize: '12px',
  },
  fileIcon: {
    fontSize: '12px',
    flexShrink: 0,
  },
  fileName: {
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  fileSize: {
    fontSize: '10px',
    color: 'var(--vscode-descriptionForeground)',
    flexShrink: 0,
  },
  contextMenu: {
    position: 'fixed',
    background: 'var(--vscode-editorWidget-background, var(--vscode-editor-background))',
    border: '1px solid var(--vscode-panel-border)',
    borderRadius: '4px',
    boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
    zIndex: 200,
    minWidth: '160px',
    padding: '4px 0',
  },
  menuItem: {
    padding: '5px 14px',
    fontSize: '12px',
    cursor: 'pointer',
    color: 'var(--vscode-foreground)',
  },
  menuDivider: {
    height: '1px',
    background: 'var(--vscode-panel-border)',
    margin: '4px 0',
  },
};
