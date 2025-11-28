<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { basicSetup } from 'codemirror';
  import { EditorState } from '@codemirror/state';
  import { oneDark } from '@codemirror/theme-one-dark';
  import { EditorView, keymap, type ViewUpdate } from '@codemirror/view';
  import { defaultKeymap } from '@codemirror/commands';
  import { open } from '@tauri-apps/plugin-dialog';
  import { readTextFile } from '@tauri-apps/plugin-fs';
  import { Files, Search, GitGraph, Settings, X } from 'lucide-svelte';

  // エディタのコンテナ要素への参照
  let editorElement: HTMLElement;
  // CodeMirrorのエディタインスタンス
  let editorView: EditorView | undefined;

  // 現在開いているファイルのパス
  let currentFilePath = $state<string | null>(null);

  // ファイルを開く関数
  async function openFile() {
    try {
      const selected = await open({
        multiple: false,
        filters: [{
          name: 'Text Files',
          extensions: ['txt', 'md', 'js', 'ts', 'svelte', 'json', 'html', 'css', 'rs']
        }]
      });

      if (selected === null) {
        return; // キャンセルされた場合
      }
      
      const filePath = selected as string;
      const content = await readTextFile(filePath);
      
      currentFilePath = filePath;
      
      // エディタの内容を更新
      if (editorView) {
        editorView.dispatch({
          changes: {
            from: 0,
            to: editorView.state.doc.length,
            insert: content
          }
        });
      }
    } catch (err) {
      console.error('Failed to open file:', err);
      alert('ファイルの読み込みに失敗しました');
    }
  }

  // ファイル名を取得するヘルパー
  function getFileName(path: string | null): string {
    if (!path) return 'Untitled';
    // WindowsとUnix系の両方のパス区切りに対応
    return path.split(/[\\/]/).pop() || 'Untitled';
  }

  onMount(() => {
    if (!editorElement) return;

    // CodeMirrorの初期状態設定
    const startState = EditorState.create({
      doc: '// Welcome to Svelix Editor',
      extensions: [
        basicSetup,
        keymap.of(defaultKeymap),
        oneDark, // ダークテーマ
        EditorView.updateListener.of((update: ViewUpdate) => {
          if (update.docChanged) {
            // ドキュメントが変更されたときの処理（必要に応じて保存機能などを追加）
          }
        })
      ]
    });

    // エディタの作成
    editorView = new EditorView({
      state: startState,
      parent: editorElement
    });
  });

  onDestroy(() => {
    // コンポーネント破棄時にエディタも破棄
    if (editorView) {
      editorView.destroy();
    }
  });
</script>

<div class="main-layout">
  <!-- Activity Bar -->
  <aside class="activity-bar">
    <div class="logo-container">
       <img src="/svelix_logo.png" alt="Svelix" class="logo" />
    </div>
    <div class="actions">
       <button class="action-item active" aria-label="Explorer"><Files size={24} /></button>
       <button class="action-item" aria-label="Search"><Search size={24} /></button>
       <button class="action-item" aria-label="Source Control"><GitGraph size={24} /></button>
    </div>
    <div class="bottom-actions">
       <button class="action-item" aria-label="Settings"><Settings size={24} /></button>
    </div>
  </aside>
  
  <!-- Side Bar -->
  <aside class="sidebar">
    <div class="sidebar-header">
      <span>EXPLORER</span>
    </div>
    <div class="sidebar-content">
      <div class="explorer-section">
        <div class="section-header">NO FOLDER OPENED</div>
        <div class="section-body">
          {#if !currentFilePath}
            <p>You have not yet opened a folder.</p>
            <button onclick={openFile} class="primary-button">Open File</button>
          {:else}
            <div class="opened-file-info">
              <span class="file-icon">📄</span>
              <span class="file-name">{getFileName(currentFilePath)}</span>
            </div>
            <button onclick={openFile} class="primary-button" style="margin-top: 15px;">Open Another File</button>
          {/if}
          <!-- 将来的にはOpen Folderボタンも追加 -->
        </div>
      </div>
    </div>
  </aside>
  
  <!-- Main Editor Area -->
  <main class="editor-area">
    <!-- Tabs -->
    <div class="tabs-bar">
      {#if currentFilePath}
       <div class="tab active">
         <span class="tab-icon">📄</span>
         <span class="tab-name">{getFileName(currentFilePath)}</span>
         <button class="tab-close" aria-label="Close Tab"><X size={14} /></button>
       </div>
      {:else}
        <div class="tab active">
          <span class="tab-icon">📄</span>
          <span class="tab-name">Untitled</span>
          <button class="tab-close" aria-label="Close Tab"><X size={14} /></button>
        </div>
      {/if}
    </div>
    
    <!-- Editor -->
    <div class="editor-content" bind:this={editorElement}></div>
  </main>
  
  <!-- Status Bar -->
  <footer class="status-bar">
    <div class="status-left">
       <span class="status-item"><GitGraph size={12} /> main*</span>
       <span class="status-item">0 errors</span>
    </div>
    <div class="status-right">
       <span class="status-item">Ln 1, Col 1</span>
       <span class="status-item">UTF-8</span>
       <span class="status-item">{currentFilePath ? getFileName(currentFilePath).split('.').pop()?.toUpperCase() : 'TXT'}</span>
    </div>
  </footer>
</div>

<style>
  :global(body) {
    margin: 0;
    padding: 0;
    overflow: hidden;
    background-color: #1e1e1e; /* VSCode Dark+ background */
    color: #cccccc;
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    user-select: none; /* UI selection disabled */
  }

  .main-layout {
    display: grid;
    grid-template-areas:
      "activity-bar sidebar editor"
      "status-bar status-bar status-bar";
    grid-template-columns: 48px 250px 1fr;
    grid-template-rows: 1fr 22px;
    height: 100vh;
    width: 100vw;
  }

  /* Activity Bar */
  .activity-bar {
    grid-area: activity-bar;
    background-color: #333333;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding-top: 10px;
  }

  .logo-container {
    margin-bottom: 20px;
  }

  .logo {
    width: 32px;
    height: 32px;
  }

  .action-item {
    background: transparent;
    border: none;
    color: #858585;
    padding: 10px;
    cursor: pointer;
    display: flex;
    justify-content: center;
    align-items: center;
    width: 100%;
    position: relative;
  }

  .action-item:hover {
    color: white;
  }

  .action-item.active {
    color: white;
    border-left: 2px solid white;
  }

  .bottom-actions {
    margin-top: auto;
    margin-bottom: 10px;
  }

  /* Side Bar */
  .sidebar {
    grid-area: sidebar;
    background-color: #252526;
    border-right: 1px solid #1e1e1e;
    display: flex;
    flex-direction: column;
  }

  .sidebar-header {
    padding: 10px 20px;
    font-size: 11px;
    font-weight: bold;
    color: #bbbbbb;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .sidebar-content {
    flex-grow: 1;
    overflow-y: auto;
  }

  .explorer-section {
    padding: 0;
  }

  .section-header {
    background-color: #383838;
    padding: 4px 10px;
    font-size: 11px;
    font-weight: bold;
    cursor: pointer;
  }

  .section-body {
    padding: 10px;
    font-size: 13px;
    text-align: center;
  }

  .primary-button {
    background-color: #0e639c;
    color: white;
    border: none;
    padding: 6px 12px;
    font-size: 12px;
    cursor: pointer;
    margin-top: 10px;
    width: 100%;
  }
  
  .primary-button:hover {
    background-color: #1177bb;
  }

  .opened-file-info {
    margin-top: 15px;
    padding: 5px;
    background-color: #383838;
    display: flex;
    align-items: center;
    gap: 8px;
    border-radius: 3px;
  }

  .file-name {
    font-size: 13px;
    color: #e7e7e7;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* Editor Area */
  .editor-area {
    grid-area: editor;
    background-color: #1e1e1e;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .tabs-bar {
    background-color: #252526;
    height: 35px;
    display: flex;
    overflow-x: auto;
  }

  .tab {
    background-color: #1e1e1e;
    color: #ffffff;
    padding: 0 10px;
    display: flex;
    align-items: center;
    border-right: 1px solid #252526;
    border-top: 1px solid #007acc; /* Active tab indicator */
    min-width: 120px;
    max-width: 200px;
    cursor: pointer;
    font-size: 13px;
  }
  
  .tab-icon {
    margin-right: 6px;
  }

  .tab-name {
    flex-grow: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tab-close {
    background: transparent;
    border: none;
    color: #cccccc;
    cursor: pointer;
    padding: 2px;
    border-radius: 3px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-left: 5px;
    opacity: 0;
  }

  .tab:hover .tab-close {
    opacity: 1;
  }

  .tab-close:hover {
    background-color: #4b4b4b;
  }

  .editor-content {
    flex-grow: 1;
    overflow: hidden;
    position: relative;
  }

  /* Status Bar */
  .status-bar {
    grid-area: status-bar;
    background-color: #007acc;
    color: white;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0 10px;
    font-size: 12px;
  }

  .status-left, .status-right {
    display: flex;
    gap: 15px;
  }

  .status-item {
    display: flex;
    align-items: center;
    gap: 5px;
    cursor: pointer;
  }

  /* CodeMirror Overrides */
  :global(.cm-editor) {
    height: 100%;
    font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
    font-size: 14px;
  }
</style>
