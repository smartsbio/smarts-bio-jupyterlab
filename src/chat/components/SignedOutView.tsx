// NOTE: Adapted from smarts-bio-vscode/webview-ui/chat/components/SignedOutView.tsx
// Key changes:
//   - Removed postMessage import (no VS Code bridge)
//   - "Register" link uses window.open instead of postMessage
//   - Logo is inlined as SVG (no VS Code resource URI needed)
import React from 'react';
import { getThemedSvg } from '../../icons';

interface Props {
  onSignIn: () => void;
}

export function SignedOutView({ onSignIn }: Props): React.ReactElement {
  return (
    <div style={styles.container}>
      <div style={styles.logo}>
        <span
          style={styles.logoImg}
          dangerouslySetInnerHTML={{ __html: getThemedSvg() }}
        />
        <span style={styles.logoText}>smarts.bio</span>
      </div>
      <p style={styles.tagline}>AI-powered bioinformatics directly in your notebook.</p>
      <button style={styles.signInBtn} onClick={onSignIn}>
        Sign In to smarts.bio
      </button>
      <a
        style={styles.registerLink}
        href="#"
        onClick={e => {
          e.preventDefault();
          window.open('https://chat.smarts.bio', '_blank');
        }}
      >
        Don't have an account? Register →
      </a>

      <div style={styles.examples}>
        <p style={styles.examplesTitle}>What you can do:</p>
        {EXAMPLE_QUERIES.map(q => (
          <div key={q} style={styles.exampleChip}>
            {q}
          </div>
        ))}
      </div>
    </div>
  );
}

const EXAMPLE_QUERIES = [
  '"BLAST this sequence against NCBI nt"',
  '"Explain this VCF file"',
  '"Run a multiple sequence alignment"',
  '"Generate a RNA-seq pipeline script"',
];

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: '24px 16px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
    height: '100%',
  },
  logo: {
    marginTop: '16px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  logoImg: {
    display: 'flex',
    width: '32px',
    height: '32px',
    flexShrink: 0,
  },
  logoText: {
    fontSize: '18px',
    fontWeight: 600,
    color: 'var(--vscode-foreground)',
  },
  tagline: {
    fontSize: '13px',
    color: 'var(--vscode-descriptionForeground)',
    textAlign: 'center',
    lineHeight: 1.5,
  },
  signInBtn: {
    marginTop: '8px',
    padding: '8px 20px',
    background: 'var(--vscode-button-background)',
    color: 'var(--vscode-button-foreground)',
    border: 'none',
    borderRadius: '4px',
    fontSize: '13px',
    cursor: 'pointer',
    fontFamily: 'var(--vscode-font-family)',
  },
  registerLink: {
    fontSize: '12px',
    color: 'var(--vscode-textLink-foreground)',
    textDecoration: 'none',
    cursor: 'pointer',
  },
  examples: {
    marginTop: '20px',
    width: '100%',
  },
  examplesTitle: {
    fontSize: '11px',
    fontWeight: 600,
    color: 'var(--vscode-descriptionForeground)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: '8px',
  },
  exampleChip: {
    padding: '6px 10px',
    marginBottom: '6px',
    background: 'var(--vscode-editor-background)',
    border: '1px solid var(--vscode-panel-border)',
    borderRadius: '4px',
    fontSize: '12px',
    color: 'var(--vscode-descriptionForeground)',
    fontStyle: 'italic',
  },
};
