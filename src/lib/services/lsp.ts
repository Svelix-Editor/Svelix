import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

// 診断情報の型定義
export interface Diagnostic {
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
  severity?: number;
  code?: number | string;
  source?: string;
  message: string;
}

export interface PublishDiagnosticsParams {
  uri: string;
  diagnostics: Diagnostic[];
}

// 診断情報を受け取るコールバックの型
type DiagnosticsCallback = (params: PublishDiagnosticsParams) => void;

export class LspService {
  private static instance: LspService;
  private messageId = 0;
  private unlistenFunctions: UnlistenFn[] = [];
  private diagnosticsCallbacks: DiagnosticsCallback[] = [];

  private constructor() {}

  static getInstance(): LspService {
    if (!LspService.instance) {
      LspService.instance = new LspService();
    }
    return LspService.instance;
  }

  // 診断情報のリスナーを登録
  onDiagnostics(callback: DiagnosticsCallback) {
    this.diagnosticsCallbacks.push(callback);
    return () => {
      this.diagnosticsCallbacks = this.diagnosticsCallbacks.filter(cb => cb !== callback);
    };
  }

  async start(cmd: string, args: string[]): Promise<string> {
    // 既存のリスナーを解除
    this.cleanup();
    
    // イベントリスナーの設定
    const unlistenMsg = await listen<string>('lsp-message', (event) => {
      // console.log('[LSP Message]', event.payload);
      // ここでJSONをパースしてレスポンスを処理する
      try {
        const msg = JSON.parse(event.payload);
        // console.log('Parsed LSP Message:', msg);

        // 診断情報の通知を処理
        if (msg.method === 'textDocument/publishDiagnostics' && msg.params) {
            this.diagnosticsCallbacks.forEach(cb => cb(msg.params));
        }

      } catch (e) {
        console.error('Failed to parse LSP message', e);
      }
    });

    const unlistenLog = await listen<string>('lsp-log', (event) => {
      console.log('[LSP Log]', event.payload);
    });

    const unlistenError = await listen<string>('lsp-error', (event) => {
      console.error('[LSP Error]', event.payload);
    });

    this.unlistenFunctions.push(unlistenMsg, unlistenLog, unlistenError);

    return await invoke('start_lsp', { cmd, args });
  }

  async send(method: string, params: any): Promise<number> {
    const id = this.messageId++;
    const message = JSON.stringify({
      jsonrpc: "2.0",
      id,
      method,
      params
    });

    await invoke('send_lsp_message', { message });
    return id;
  }

  async sendNotification(method: string, params: any): Promise<void> {
    const message = JSON.stringify({
      jsonrpc: "2.0",
      method,
      params
    });

    await invoke('send_lsp_message', { message });
  }

  async initialize(rootPath: string): Promise<number> {
    return this.send('initialize', {
      processId: null,
      rootUri: `file://${rootPath}`,
      capabilities: {
        textDocument: {
          synchronization: {
            dynamicRegistration: true,
            willSave: true,
            willSaveWaitUntil: true,
            didSave: true
          },
          completion: {
            dynamicRegistration: true,
            completionItem: {
              snippetSupport: true
            }
          }
        }
      },
      trace: "verbose"
    });
  }

  async didOpen(path: string, content: string, languageId: string = 'rust'): Promise<void> {
    await this.sendNotification('textDocument/didOpen', {
      textDocument: {
        uri: `file://${path}`,
        languageId,
        version: 1,
        text: content
      }
    });
  }

  async didChange(path: string, content: string, version: number): Promise<void> {
    await this.sendNotification('textDocument/didChange', {
      textDocument: {
        uri: `file://${path}`,
        version
      },
      contentChanges: [
        { text: content }
      ]
    });
  }

  cleanup() {
    this.unlistenFunctions.forEach(fn => fn());
    this.unlistenFunctions = [];
  }
}

