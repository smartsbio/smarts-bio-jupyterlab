// NOTE: JupyterLab-specific — no VS Code equivalent. Queries the active kernel
// for variable names/types/previews and returns them as a ContextAttachment.
import { INotebookTracker } from '@jupyterlab/notebook';
import { KernelMessage } from '@jupyterlab/services';
import type { ContextAttachment } from '../chat/types';

/** Snippet executed in the kernel to introspect variables. */
const INSPECT_SNIPPET = `
import json as _json
_result = {}
try:
    _ns = get_ipython().kernel.shell.user_ns
    for _k, _v in _ns.items():
        if _k.startswith('_'):
            continue
        _t = type(_v).__name__
        try:
            if hasattr(_v, 'shape'):
                _result[_k] = {'type': _t, 'shape': list(_v.shape)}
            elif hasattr(_v, '__len__') and not isinstance(_v, str) and len(_v) < 1000:
                _result[_k] = {'type': _t, 'len': len(_v)}
            else:
                _s = str(_v)
                _result[_k] = {'type': _t, 'preview': (_s[:120] + '…') if len(_s) > 120 else _s}
        except Exception:
            _result[_k] = {'type': _t}
except Exception as _e:
    _result = {'__error__': str(_e)}
print(_json.dumps(_result))
`.trim();

export class KernelContextBridge {
  constructor(private readonly notebookTracker: INotebookTracker | null) {}

  /**
   * Execute a brief introspection snippet in the active kernel and return
   * the variable summary as a ContextAttachment.
   * Returns null if no kernel is available or no variables are found.
   */
  async getKernelVariableContext(): Promise<ContextAttachment | null> {
    const notebook = this.notebookTracker?.currentWidget;
    if (!notebook) return null;

    const kernel = notebook.context.sessionContext.session?.kernel;
    if (!kernel) return null;

    try {
      const future = kernel.requestExecute({ code: INSPECT_SNIPPET, silent: true, store_history: false });

      let output = '';
      future.onIOPub = (msg: KernelMessage.IIOPubMessage) => {
        if (msg.header.msg_type === 'stream') {
          const stream = msg.content as KernelMessage.IStreamMsg['content'];
          if (stream.name === 'stdout') {
            output += stream.text;
          }
        }
      };

      await future.done;

      const trimmed = output.trim();
      if (!trimmed) return null;

      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        return null;
      }

      if ('__error__' in parsed || Object.keys(parsed).length === 0) return null;

      // Format as readable summary
      const lines: string[] = [];
      for (const [name, info] of Object.entries(parsed)) {
        const i = info as Record<string, unknown>;
        if (i.shape) {
          lines.push(`${name}: ${i.type} shape=${JSON.stringify(i.shape)}`);
        } else if (i.len !== undefined) {
          lines.push(`${name}: ${i.type} len=${i.len}`);
        } else if (i.preview) {
          lines.push(`${name}: ${i.type} = ${i.preview}`);
        } else {
          lines.push(`${name}: ${i.type}`);
        }
      }

      const content = lines.join('\n');
      const notebookName = notebook.title.label ?? 'Notebook';

      return {
        type: 'selection',
        label: `${notebookName} · Kernel variables (${lines.length})`,
        content,
      };
    } catch {
      return null;
    }
  }
}
