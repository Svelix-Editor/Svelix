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

function toUri(path: string): string {
    // Windowsのバックスラッシュをスラッシュに変換
    let normalized = path.replace(/\\/g, '/');
    
    // Windowsのドライブレター (C:/...) で始まる場合、スラッシュを追加して file:///C:/... にする
    if (!normalized.startsWith('/')) {
        normalized = '/' + normalized;
    }
    
    // エンコード（スペースなどを%20に）
    return `file://${encodeURI(normalized)}`;
}

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
    // initializeリクエスト
    const id = await this.send('initialize', {
      processId: null,
      rootUri: toUri(rootPath),
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
              snippetSupport: true,
              labelDetailsSupport: true
            }
          },
          hover: {
            dynamicRegistration: true,
            contentFormat: ['markdown', 'plaintext']
          }
        },
        workspace: {
            workspaceFolders: true
        }
      },
      trace: "verbose",
      workspaceFolders: [
        {
            uri: toUri(rootPath),
            name: rootPath.split(/[\\/]/).pop() || 'root'
        }
      ]
    });

    // initialized通知を送る (ハンドシェイク完了)
    await this.sendNotification('initialized', {});
    
    return id;
  }

  async didOpen(path: string, content: string, languageId: string = 'rust'): Promise<void> {
    await this.sendNotification('textDocument/didOpen', {
      textDocument: {
        uri: toUri(path),
        languageId,
        version: 1,
        text: content
      }
    });
  }

  async didChange(path: string, content: string, version: number): Promise<void> {
    await this.sendNotification('textDocument/didChange', {
      textDocument: {
        uri: toUri(path),
        version
      },
      contentChanges: [
        { text: content }
      ]
    });
  }

  async getCompletion(path: string, line: number, character: number): Promise<any[]> {
    const result = await this.sendRequest('textDocument/completion', {
      textDocument: {
        uri: toUri(path)
      },
      position: {
        line,
        character
      },
      context: {
        triggerKind: 1 // Invoked
      }
    });

    if (!result) return [];
    if (Array.isArray(result)) return result;
    return result.items || [];
  }

  // リクエストを送信してレスポンスを待つ
  async sendRequest(method: string, params: any): Promise<any> {
    const id = this.messageId++;
    const message = JSON.stringify({
      jsonrpc: "2.0",
      id,
      method,
      params
    });

    return new Promise((resolve, reject) => {
        // 一時的なリスナーを登録
        const unlisten = listen<string>('lsp-message', (event) => {
            try {
                const msg = JSON.parse(event.payload);
                if (msg.id === id) {
                    unlisten.then(fn => fn()); // リスナー解除
                    if (msg.error) {
                        reject(msg.error);
                    } else {
                        resolve(msg.result);
                    }
                }
            } catch (e) {
                // ignore
            }
        });
        
        invoke('send_lsp_message', { message }).catch(err => {
            unlisten.then(fn => fn());
            reject(err);
        });
        
        // タイムアウト (30秒に延長)
        setTimeout(() => {
            unlisten.then(fn => fn());
            reject('Request timeout');
        }, 30000);
    });
  }

  cleanup() {
    this.unlistenFunctions.forEach(fn => fn());
    this.unlistenFunctions = [];
  }
}

