// NOTE: Ported from smarts-bio-vscode/src/panels/ProcessesPanel.ts (HTML template + postMessage).
// Converted to a pure React component — no iframe, no postMessage bridge.
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { SmartsBioClient, Job } from '../api/SmartsBioClient';
import { WorkspaceSelector } from '../workspace/WorkspaceSelector';
import { SignedOutView } from '../chat/components/SignedOutView';

interface Props {
  isAuthenticated: boolean;
  workspaceId: string;
  client: SmartsBioClient;
  workspaceSelector: WorkspaceSelector;
  onSignIn: () => void;
}

type PanelState =
  | { kind: 'loading' }
  | { kind: 'not_authenticated' }
  | { kind: 'no_workspace' }
  | { kind: 'error'; message: string }
  | { kind: 'jobs'; jobs: Job[] };

export function ProcessesPanel({ isAuthenticated, workspaceId, client, onSignIn }: Props): React.ReactElement {
  const [state, setState] = useState<PanelState>({ kind: 'loading' });
  const pollRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  const refresh = useCallback(async () => {
    if (!isAuthenticated) {
      setState({ kind: 'not_authenticated' });
      return;
    }
    if (!workspaceId) {
      setState({ kind: 'no_workspace' });
      return;
    }
    try {
      const jobs = await client.getJobs(workspaceId);
      setState({ kind: 'jobs', jobs });
    } catch (err: any) {
      setState({ kind: 'error', message: `Failed to load processes: ${err?.message ?? err}` });
    }
  }, [isAuthenticated, workspaceId, client]);

  useEffect(() => {
    refresh();
    pollRef.current = setInterval(refresh, 15_000);
    return () => clearInterval(pollRef.current);
  }, [refresh]);

  const cancelJob = async (jobId: string) => {
    try {
      await client.cancelJob(jobId, workspaceId);
      await refresh();
    } catch {
      // Silently ignore
    }
  };

  return (
    <div style={styles.root}>
      <div style={styles.toolbar}>
        <span>Processes</span>
        <button style={styles.refreshBtn} title="Refresh" onClick={refresh}>⟳</button>
      </div>
      <div style={styles.content}>
        {state.kind === 'loading' && (
          <div style={styles.empty}>Loading…</div>
        )}
        {state.kind === 'not_authenticated' && (
          <SignedOutView onSignIn={onSignIn} />
        )}
        {state.kind === 'no_workspace' && (
          <div style={styles.empty}>Select a workspace to see processes.</div>
        )}
        {state.kind === 'error' && (
          <div style={styles.errorMsg}>{state.message}</div>
        )}
        {state.kind === 'jobs' && state.jobs.length === 0 && (
          <div style={styles.empty}>
            No recent processes.<br />Run a pipeline or tool to see it here.
          </div>
        )}
        {state.kind === 'jobs' && state.jobs.map(job => (
          <JobRow key={job.id} job={job} onCancel={cancelJob} />
        ))}
      </div>
    </div>
  );
}

function JobRow({
  job,
  onCancel,
}: {
  job: Job;
  onCancel: (id: string) => void;
}): React.ReactElement {
  const canCancel = job.status === 'running' || job.status === 'queued' || job.status === 'pending';

  return (
    <div style={styles.job}>
      <div style={styles.jobHeader}>
        <span style={styles.jobName} title={job.name}>{job.name}</span>
        <StatusBadge status={job.status} />
        {canCancel && (
          <button style={styles.cancelBtn} onClick={() => onCancel(job.id)}>Cancel</button>
        )}
      </div>
      <div style={styles.jobMeta}>
        {job.tool && <MetaChip icon="⚙" label={job.tool} />}
        {job.executionMode && <ExecBadge mode={job.executionMode} />}
        {job.startedAt && <MetaChip icon="🕐" label={formatDate(job.startedAt)} />}
        {job.durationMs !== undefined && job.durationMs > 0 && (
          <MetaChip icon="⏱" label={formatDuration(job.durationMs)} />
        )}
      </div>
      {job.errorMessage && (
        <div style={styles.jobError} title={job.errorMessage}>
          ⚠ {job.errorMessage}
        </div>
      )}
    </div>
  );
}

const BADGE_STYLES: Record<string, React.CSSProperties> = {
  running:   { background: 'rgba(30,111,217,0.13)',  color: '#4da3ff', animation: 'pulse 1.5s ease-in-out infinite' },
  queued:    { background: 'rgba(136,136,136,0.13)', color: 'var(--vscode-descriptionForeground)' },
  pending:   { background: 'rgba(136,136,136,0.13)', color: 'var(--vscode-descriptionForeground)' },
  completed: { background: 'rgba(34,134,58,0.13)',   color: '#56d364' },
  failed:    { background: 'rgba(218,54,52,0.13)',   color: '#f85149' },
  error:     { background: 'rgba(218,54,52,0.13)',   color: '#f85149' },
  cancelled: { background: 'rgba(136,136,136,0.13)', color: 'var(--vscode-descriptionForeground)' },
};

function StatusBadge({ status }: { status: string }): React.ReactElement {
  const s = BADGE_STYLES[status] ?? BADGE_STYLES.pending;
  return (
    <span style={{ ...styles.badge, ...s }}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function MetaChip({ icon, label }: { icon: string; label: string }): React.ReactElement {
  return (
    <span style={styles.metaChip}>
      <span style={styles.metaIcon}>{icon}</span>
      {label}
    </span>
  );
}

function ExecBadge({ mode }: { mode: string }): React.ReactElement {
  const label =
    mode === 'distributed' ? '☁ smarts Cloud' :
    mode === 'external'    ? '⬡ External API' :
    mode === 'local'       ? '⬛ Local' : mode;
  return <span style={styles.execBadge}>{label}</span>;
}

function formatDuration(ms: number): string {
  if (ms < 0) return '';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return (
    d.toLocaleDateString([], { month: 'short', day: 'numeric' }) +
    ' ' +
    d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    fontFamily: 'var(--vscode-font-family)',
    fontSize: 'var(--vscode-font-size)',
    color: 'var(--vscode-foreground)',
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
  refreshBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--vscode-descriptionForeground)',
    cursor: 'pointer',
    fontSize: '13px',
    padding: '2px 4px',
    borderRadius: '3px',
  },
  content: {
    flex: 1,
    overflowY: 'auto',
    padding: '4px 0',
  },
  empty: {
    padding: '24px 14px',
    color: 'var(--vscode-descriptionForeground)',
    fontSize: '12px',
    textAlign: 'center',
    lineHeight: 1.6,
  },
  errorMsg: {
    padding: '12px 10px',
    color: '#f85149',
    fontSize: '12px',
  },
  job: {
    padding: '8px 10px',
    borderBottom: '1px solid var(--vscode-panel-border)',
    display: 'flex',
    flexDirection: 'column',
    gap: '5px',
  },
  jobHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  jobName: {
    fontSize: '12px',
    fontWeight: 600,
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  badge: {
    fontSize: '10px',
    fontWeight: 600,
    padding: '1px 6px',
    borderRadius: '10px',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    flexShrink: 0,
    whiteSpace: 'nowrap',
  },
  cancelBtn: {
    background: 'none',
    border: '1px solid var(--vscode-panel-border)',
    color: 'var(--vscode-descriptionForeground)',
    cursor: 'pointer',
    fontSize: '10px',
    padding: '1px 7px',
    borderRadius: '3px',
    flexShrink: 0,
    fontFamily: 'var(--vscode-font-family)',
  },
  jobMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap',
  },
  metaChip: {
    display: 'flex',
    alignItems: 'center',
    gap: '3px',
    fontSize: '11px',
    color: 'var(--vscode-descriptionForeground)',
  },
  metaIcon: {
    opacity: 0.7,
    fontSize: '10px',
  },
  execBadge: {
    fontSize: '10px',
    padding: '1px 5px',
    borderRadius: '3px',
    background: 'var(--vscode-editor-background)',
    border: '1px solid var(--vscode-panel-border)',
    color: 'var(--vscode-descriptionForeground)',
    whiteSpace: 'nowrap',
  },
  jobError: {
    fontSize: '11px',
    color: '#f85149',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
};
