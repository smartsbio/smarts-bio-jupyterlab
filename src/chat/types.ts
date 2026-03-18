// NOTE: Copied verbatim from smarts-bio-vscode/webview-ui/chat/types.ts

export interface UserProfile {
  userId: string;
  name: string;
  email: string;
  plan: 'free' | 'pro' | 'team' | 'enterprise';
  computeCreditsRemaining: number;
  computeCreditsTotal: number;
  defaultWorkspaceId: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isError?: boolean;
}

export interface ContextAttachment {
  type: 'selection' | 'file';
  label: string;
  content: string;
  fileKey?: string;
}
