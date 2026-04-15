import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin,
} from '@jupyterlab/application';
import { ICommandPalette } from '@jupyterlab/apputils';
import { Widget } from '@lumino/widgets';
import { ISettingRegistry } from '@jupyterlab/settingregistry';
import { IStateDB } from '@jupyterlab/statedb';
import { IStatusBar } from '@jupyterlab/statusbar';
import { INotebookTracker } from '@jupyterlab/notebook';

import { AuthProvider } from './auth/AuthProvider';
import { OAuthCallback } from './auth/OAuthCallback';
import { SmartsBioClient } from './api/SmartsBioClient';
import { WorkspaceSelector } from './workspace/WorkspaceSelector';
import { ChatWidget } from './widgets/ChatWidget';
import { ExplorerWidget } from './widgets/ExplorerWidget';
import { createJupyterCapabilities } from './capabilities';
import { CellInserter } from './notebook/CellInserter';
import { CellContextProvider } from './notebook/CellContextProvider';
import { KernelContextBridge } from './notebook/KernelContextBridge';
import { StatusBarWidget } from './statusbar/StatusBarWidget';
import { ViewerWidgetFactory } from './viewers/ViewerWidgetFactory';
import { openViewerWidget } from './viewers/ViewerWidget';
import { LabIcon } from '@jupyterlab/ui-components';
import { smartsBioIcon } from './icons';
import {
  sequenceLabIcon,
  alignmentLabIcon,
  variantLabIcon,
  structureLabIcon,
  moleculeLabIcon,
  tabularLabIcon,
  textLabIcon,
  pdfLabIcon,
  imageLabIcon,
} from './icons/fileTypeLabIcons';

const PLUGIN_ID = '@smartsbio/jupyterlab-extension:plugin';

// File types handled by the custom viewer factory
const BIOINFORMATICS_EXTENSIONS = [
  '.fasta', '.fa', '.fna', '.ffn', '.faa', '.frn', '.fastq', '.fq',
  '.pdb', '.cif', '.mmcif',
  '.sam', '.bam', '.cram',
  '.vcf', '.bcf',
  '.csv', '.tsv', '.xlsx', '.xls',
  '.mol', '.sdf', '.mol2', '.xyz', '.smi', '.smiles', '.inchi',
  '.xpr',
  '.md', '.docx', '.pdf',
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.tif', '.tiff', '.bmp',
  '.bed', '.bw', '.bigwig',
];

const plugin: JupyterFrontEndPlugin<void> = {
  id: PLUGIN_ID,
  description: 'smarts.bio bioinformatics AI agent for JupyterLab',
  autoStart: true,
  requires: [IStateDB],
  optional: [
    ISettingRegistry,
    ICommandPalette,
    IStatusBar,
    INotebookTracker,
  ],
  activate: (
    app: JupyterFrontEnd,
    stateDB: IStateDB,
    settingRegistry: ISettingRegistry | null,
    palette: ICommandPalette | null,
    statusBar: IStatusBar | null,
    notebookTracker: INotebookTracker | null,
  ) => {
    // ── Settings ──────────────────────────────────────────────────────────────
    // Both AuthProvider and SmartsBioClient need a sync config getter.
    // We use mutable defaults and update them when settings load.
    const config = {
      apiBaseUrl: 'https://api.smarts.bio',
      websiteBaseUrl: 'https://chat.smarts.bio',
    };
    if (settingRegistry) {
      settingRegistry.load(PLUGIN_ID).then(settings => {
        const api = settings.get('apiBaseUrl').composite as string;
        const web = settings.get('websiteBaseUrl').composite as string;
        if (api) config.apiBaseUrl = api;
        if (web) config.websiteBaseUrl = web;
      }).catch(() => {/* use defaults */});
    }
    const getConfig = () => config;

    // ── Core services ─────────────────────────────────────────────────────────
    const auth = new AuthProvider(stateDB, getConfig);
    const client = new SmartsBioClient(auth, getConfig);
    const workspaceSelector = new WorkspaceSelector(stateDB, auth, client);

    // ── Notebook helpers ──────────────────────────────────────────────────────
    const cellInserter = new CellInserter(notebookTracker ?? null);
    const cellContextProvider = new CellContextProvider(notebookTracker ?? null);
    const kernelBridge = new KernelContextBridge(notebookTracker ?? null);

    // ── Widgets ───────────────────────────────────────────────────────────────
    const chatWidget = new ChatWidget(auth, client, workspaceSelector, cellInserter);
    chatWidget.id = 'smarts-bio-chat';
    chatWidget.title.label = '';
    chatWidget.title.icon = smartsBioIcon;
    chatWidget.title.caption = 'smarts.bio AI Chat';

    const capabilities = createJupyterCapabilities(client, auth, cellInserter, {
      openViewer: async (fileKey, fileName, ext) => {
        const widget = await openViewerWidget(
          fileKey, fileName, ext, client, workspaceSelector.selectedWorkspaceId,
        );
        app.shell.add(widget, 'main');
        app.shell.activateById(widget.id);
      },
      analyzeFile: (_fileKey, fileName) => {
        chatWidget.insertText(fileName);
        app.shell.activateById(chatWidget.id);
        void app.commands.execute('smarts-bio:open-chat');
      },
      refreshFiles: () => explorerWidget.refresh(),
    });

    const explorerWidget = new ExplorerWidget(auth, workspaceSelector, capabilities);
    explorerWidget.id = 'smarts-bio-explorer';
    explorerWidget.title.label = '';
    explorerWidget.title.icon = smartsBioIcon;
    explorerWidget.title.caption = 'smarts.bio Files & Processes';

    // Chat in right sidebar; Explorer (Files + Processes) in left sidebar
    app.shell.add(chatWidget, 'right', { rank: 400 });
    app.shell.add(explorerWidget, 'left', { rank: 401 });

    // ── Auto-open chat on sign-in ─────────────────────────────────────────────
    auth.onAuthChange((profile) => {
      if (profile) {
        app.shell.activateById(chatWidget.id);
      }
    });

    // ── Status bar ────────────────────────────────────────────────────────────
    if (statusBar) {
      new StatusBarWidget(statusBar, auth, workspaceSelector);
    }

    // ── OAuth callback listener ───────────────────────────────────────────────
    const oauthCallback = new OAuthCallback(auth);
    oauthCallback.start();

    // ── Restore persisted auth + workspace selection (fire-and-forget) ───────
    void auth.restore().then(() => workspaceSelector.restore());

    // ── Register file viewer factory ──────────────────────────────────────────
    const docRegistry = app.docRegistry;
    if (docRegistry) {
      // Map each extension to its matching LabIcon (same colors as the smarts.bio file explorer)
      const EXT_LAB_ICON: Record<string, LabIcon> = {
        '.fasta': sequenceLabIcon, '.fa': sequenceLabIcon, '.fna': sequenceLabIcon,
        '.ffn': sequenceLabIcon, '.faa': sequenceLabIcon, '.frn': sequenceLabIcon,
        '.fastq': sequenceLabIcon, '.fq': sequenceLabIcon,
        '.bam': alignmentLabIcon, '.sam': alignmentLabIcon, '.cram': alignmentLabIcon,
        '.vcf': variantLabIcon, '.bcf': variantLabIcon, '.bed': variantLabIcon,
        '.pdb': structureLabIcon, '.cif': structureLabIcon, '.mmcif': structureLabIcon,
        '.mol': moleculeLabIcon, '.sdf': moleculeLabIcon, '.mol2': moleculeLabIcon,
        '.xyz': moleculeLabIcon, '.smi': moleculeLabIcon, '.smiles': moleculeLabIcon, '.inchi': moleculeLabIcon,
        '.csv': tabularLabIcon, '.tsv': tabularLabIcon, '.xlsx': tabularLabIcon, '.xls': tabularLabIcon,
        '.xpr': textLabIcon,
        '.md': textLabIcon, '.docx': textLabIcon, '.pdf': pdfLabIcon,
        '.png': imageLabIcon, '.jpg': imageLabIcon, '.jpeg': imageLabIcon, '.gif': imageLabIcon,
        '.webp': imageLabIcon, '.svg': imageLabIcon, '.tif': imageLabIcon, '.tiff': imageLabIcon, '.bmp': imageLabIcon,
      };

      // Register bioinformatics file types with per-type icons
      for (const ext of BIOINFORMATICS_EXTENSIONS) {
        const icon = EXT_LAB_ICON[ext];
        docRegistry.addFileType({
          name: `smarts-bio${ext}`,
          extensions: [ext],
          mimeTypes: ['application/octet-stream'],
          ...(icon ? { icon } : { iconClass: 'jp-smartsbioFileIcon' }),
        });
      }

      const factory = new ViewerWidgetFactory({
        name: 'smarts.bio Viewer',
        fileTypes: BIOINFORMATICS_EXTENSIONS.map(e => `smarts-bio${e}`),
        defaultFor: BIOINFORMATICS_EXTENSIONS.map(e => `smarts-bio${e}`),
      });
      docRegistry.addWidgetFactory(factory);
    }

    // ── Add "Analyze with smarts.bio" notebook toolbar button ─────────────────
    if (notebookTracker) {
      notebookTracker.widgetAdded.connect((_, panel) => {
        panel.toolbar.insertItem(
          10,
          'smarts-bio-analyze',
          createToolbarButton(() => {
            app.commands.execute('smarts-bio:analyze-cell');
          }),
        );
      });
    }

    // ── Commands ──────────────────────────────────────────────────────────────
    const { commands } = app;

    // Auth
    commands.addCommand('smarts-bio:sign-in', {
      label: 'smarts.bio: Sign In',
      execute: () => auth.signIn(),
    });

    commands.addCommand('smarts-bio:sign-out', {
      label: 'smarts.bio: Sign Out',
      execute: () => auth.signOut(),
    });

    // Panel navigation
    commands.addCommand('smarts-bio:open-chat', {
      label: 'smarts.bio: Open Chat',
      execute: () => {
        app.shell.activateById(chatWidget.id);
      },
    });

    commands.addCommand('smarts-bio:new-chat', {
      label: 'smarts.bio: New Chat',
      execute: () => {
        chatWidget.newConversation();
        app.shell.activateById(chatWidget.id);
      },
    });

    commands.addCommand('smarts-bio:open-explorer', {
      label: 'smarts.bio: Open File Explorer',
      execute: () => {
        app.shell.activateById(explorerWidget.id);
      },
    });

    commands.addCommand('smarts-bio:open-processes', {
      label: 'smarts.bio: Open Processes',
      execute: () => {
        explorerWidget.showProcesses();
        app.shell.activateById(explorerWidget.id);
      },
    });

    commands.addCommand('smarts-bio:open-settings', {
      label: 'smarts.bio: Open Settings',
      execute: () => {
        commands.execute('settingeditor:open', { query: 'smarts.bio' });
      },
    });

    // Workspace
    commands.addCommand('smarts-bio:select-workspace', {
      label: 'smarts.bio: Select Workspace',
      execute: () => workspaceSelector.pick(),
    });

    // File operations
    commands.addCommand('smarts-bio:upload-file', {
      label: 'smarts.bio: Upload File',
      execute: () => {
        explorerWidget.triggerUpload();
        app.shell.activateById(explorerWidget.id);
      },
    });

    commands.addCommand('smarts-bio:upload-to-folder', {
      label: 'smarts.bio: Upload to Folder',
      execute: (args) => {
        const folder = args['folder'] as string | undefined;
        explorerWidget.triggerUpload(folder);
        app.shell.activateById(explorerWidget.id);
      },
    });

    commands.addCommand('smarts-bio:refresh-files', {
      label: 'smarts.bio: Refresh Files',
      execute: () => explorerWidget.refresh(),
    });

    commands.addCommand('smarts-bio:open-file-viewer', {
      label: 'smarts.bio: Open File Viewer',
      execute: async (args) => {
        const fileKey = args['fileKey'] as string;
        const fileName = args['fileName'] as string;
        const ext = args['ext'] as string;
        if (!fileKey || !fileName || !ext) return;

        const widget = await openViewerWidget(
          fileKey, fileName, ext, client, workspaceSelector.selectedWorkspaceId,
        );
        app.shell.add(widget, 'main');
        app.shell.activateById(widget.id);
      },
    });

    commands.addCommand('smarts-bio:analyze-file', {
      label: 'smarts.bio: Analyze File',
      execute: (args) => {
        const fileKey = args['fileKey'] as string;
        const fileName = args['fileName'] as string;
        if (!fileKey || !fileName) return;
        chatWidget.attachContext({ type: 'selection', label: fileName, content: fileKey });
        app.shell.activateById(chatWidget.id);
      },
    });

    commands.addCommand('smarts-bio:download-file', {
      label: 'smarts.bio: Download File',
      execute: async (args) => {
        const fileKey = args['fileKey'] as string;
        if (!fileKey) return;
        const wsId = workspaceSelector.selectedWorkspaceId;
        const url = await client.getFileDownloadUrl(wsId, fileKey);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileKey.split('/').pop() ?? 'download';
        a.click();
      },
    });

    commands.addCommand('smarts-bio:rename-file', {
      label: 'smarts.bio: Rename File',
      execute: async (args) => {
        const fileKey = args['fileKey'] as string;
        if (!fileKey) return;
        const newName = window.prompt('New file name:', fileKey.split('/').pop() ?? '');
        if (!newName) return;
        const wsId = workspaceSelector.selectedWorkspaceId;
        await client.renameFile(wsId, fileKey, newName);
        explorerWidget.refresh();
      },
    });

    commands.addCommand('smarts-bio:move-file', {
      label: 'smarts.bio: Move File',
      execute: async (args) => {
        const fileKey = args['fileKey'] as string;
        if (!fileKey) return;
        const dest = window.prompt('Move to folder (leave empty for root):');
        if (dest === null) return;
        const wsId = workspaceSelector.selectedWorkspaceId;
        await client.moveFile(wsId, fileKey, dest);
        explorerWidget.refresh();
      },
    });

    commands.addCommand('smarts-bio:delete-file', {
      label: 'smarts.bio: Delete File',
      execute: async (args) => {
        const fileKey = args['fileKey'] as string;
        const fileName = fileKey?.split('/').pop() ?? fileKey;
        if (!fileKey) return;
        if (!window.confirm(`Delete "${fileName}"?`)) return;
        const wsId = workspaceSelector.selectedWorkspaceId;
        await client.deleteFile(wsId, fileKey);
        explorerWidget.refresh();
      },
    });

    commands.addCommand('smarts-bio:new-folder-here', {
      label: 'smarts.bio: New Folder',
      execute: async (args) => {
        const parent = (args['parent'] as string | undefined) ?? '';
        const name = window.prompt('Folder name:');
        if (!name) return;
        const wsId = workspaceSelector.selectedWorkspaceId;
        await client.createFolder(wsId, name, parent || undefined);
        explorerWidget.refresh();
      },
    });

    commands.addCommand('smarts-bio:rename-folder', {
      label: 'smarts.bio: Rename Folder',
      execute: async (args) => {
        const folder = args['folder'] as string;
        if (!folder) return;
        const newName = window.prompt('New folder name:', folder.split('/').pop() ?? folder);
        if (!newName) return;
        const wsId = workspaceSelector.selectedWorkspaceId;
        await client.renameFolder(wsId, folder, newName);
        explorerWidget.refresh();
      },
    });

    commands.addCommand('smarts-bio:delete-folder', {
      label: 'smarts.bio: Delete Folder',
      execute: async (args) => {
        const folder = args['folder'] as string;
        if (!folder) return;
        if (!window.confirm(`Delete folder "${folder}" and all its contents?`)) return;
        const wsId = workspaceSelector.selectedWorkspaceId;
        await client.deleteFolder(wsId, folder);
        explorerWidget.refresh();
      },
    });

    // Selection helpers (work on highlighted text in a notebook cell)
    commands.addCommand('smarts-bio:analyze-selection', {
      label: 'smarts.bio: Analyze Selection',
      execute: () => {
        const ctx = cellContextProvider.getActiveCellContext();
        if (ctx) {
          chatWidget.attachContext(ctx);
        }
        app.shell.activateById(chatWidget.id);
      },
    });

    commands.addCommand('smarts-bio:blast-selection', {
      label: 'smarts.bio: BLAST Selection',
      execute: () => {
        const ctx = cellContextProvider.getActiveCellContext();
        if (ctx) {
          chatWidget.attachContext(ctx);
          chatWidget.sendMessage(`Run BLAST on the selected sequence from ${ctx.label}`);
        }
        app.shell.activateById(chatWidget.id);
      },
    });

    // ── Jupyter-only commands ─────────────────────────────────────────────────

    commands.addCommand('smarts-bio:analyze-cell', {
      label: 'smarts.bio: Analyze Active Cell',
      execute: () => {
        const ctx = cellContextProvider.getActiveCellContext();
        if (ctx) {
          chatWidget.attachContext(ctx);
        }
        app.shell.activateById(chatWidget.id);
      },
    });

    commands.addCommand('smarts-bio:insert-cell-below', {
      label: 'smarts.bio: Insert Output as New Cell',
      execute: (args) => {
        const code = args['code'] as string;
        if (code) {
          cellInserter.insertCode(code);
        }
      },
    });

    commands.addCommand('smarts-bio:attach-kernel-context', {
      label: 'smarts.bio: Attach Kernel Variables as Context',
      execute: async () => {
        const ctx = await kernelBridge.getKernelVariableContext();
        if (ctx) {
          chatWidget.attachContext(ctx);
        }
        app.shell.activateById(chatWidget.id);
      },
    });

    // ── Command palette entries ───────────────────────────────────────────────
    if (palette) {
      const category = 'smarts.bio';
      [
        'smarts-bio:sign-in',
        'smarts-bio:sign-out',
        'smarts-bio:open-chat',
        'smarts-bio:new-chat',
        'smarts-bio:open-explorer',
        'smarts-bio:open-processes',
        'smarts-bio:open-settings',
        'smarts-bio:select-workspace',
        'smarts-bio:upload-file',
        'smarts-bio:refresh-files',
        'smarts-bio:analyze-cell',
        'smarts-bio:attach-kernel-context',
      ].forEach(command => palette.addItem({ command, category }));
    }

    console.log('[smarts.bio] JupyterLab extension activated');
  },
};

/** Creates a simple toolbar button widget. */
function createToolbarButton(onClick: () => void): Widget {
  const node = document.createElement('button');
  node.className = 'jp-ToolbarButton';
  node.title = 'Analyze with smarts.bio';
  node.style.cssText = 'font-size:11px;padding:2px 8px;border:none;background:none;cursor:pointer;opacity:0.8;';
  node.textContent = '🧬 Analyze';
  node.addEventListener('click', onClick);
  return new Widget({ node });
}

export default plugin;
