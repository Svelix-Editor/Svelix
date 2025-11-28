<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { basicSetup } from 'codemirror';
  import { EditorState } from '@codemirror/state';
  import { oneDark } from '@codemirror/theme-one-dark';
  import { EditorView, keymap, type ViewUpdate } from '@codemirror/view';
  import { defaultKeymap } from '@codemirror/commands';
  import { open, save } from '@tauri-apps/plugin-dialog';
  import { invoke } from '@tauri-apps/api/core';
  import { Files, Search, GitGraph, Settings, X, Circle } from 'lucide-svelte';

  // エディタのコンテナ要素への参照
  let editorElement: HTMLElement;
  // CodeMirrorのエディタインスタンス
  let editorView: EditorView | undefined;

  // 現在開いているファイルのパス
  let currentFilePath = $state<string | null>(null);
  // 未保存の変更があるかどうか
  let isDirty = $state(false);

  // ファイルオープン中かどうかのフラグ（開いた直後の変更検知を抑制するため）
  let isOpeningFile = false;

  // メニューが開いているかどうか
  let isFileMenuOpen = $state(false);

  // メニュークリック時のハンドラ
  function toggleFileMenu(event: MouseEvent) {
    event.stopPropagation();
    isFileMenuOpen = !isFileMenuOpen;
  }

  // メニュー外クリック時のハンドラ
  function closeMenu() {
    isFileMenuOpen = false;
  }

  // Fileメニューのアクション
  function handleFileAction(action: string) {
    console.log(`Action: ${action}`);
    if (action === 'openFile') {
      openFile();
    }
    isFileMenuOpen = false;
  }

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
      // Rustのコマンドを呼び出してファイルを読み込む
      const content = await invoke<string>('read_file_content', { path: filePath });
      
      currentFilePath = filePath;
      // ファイルオープン処理開始
      isOpeningFile = true;
      isDirty = false;
      
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
      
      // 少し待ってからフラグを下ろす（CodeMirrorのupdate処理が完了するのを待つ）
      setTimeout(() => {
        isOpeningFile = false;
      }, 50);
      
    } catch (err) {
      console.error('Failed to open file:', err);
      alert('ファイルの読み込みに失敗しました');
      isOpeningFile = false;
    }
  }

  // ファイル名を取得するヘルパー
  function getFileName(path: string | null): string {
    if (!path) return 'Untitled';
    // WindowsとUnix系の両方のパス区切りに対応
    return path.split(/[\\/]/).pop() || 'Untitled';
  }

  // ファイルを保存する関数
  async function saveFile() {
    if (!editorView) return;

    const content = editorView.state.doc.toString();

    try {
      if (currentFilePath) {
        // 既存ファイルの上書き保存（Rustコマンド呼び出し）
        await invoke('write_file_content', { path: currentFilePath, content });
        isDirty = false;
      } else {
        // 新規保存（名前を付けて保存）
        const filePath = await save({
          filters: [{
            name: 'Text Files',
            extensions: ['txt', 'md', 'js', 'ts', 'svelte', 'json', 'html', 'css', 'rs']
          }]
        });

        if (filePath) {
          // Rustコマンド呼び出し
          await invoke('write_file_content', { path: filePath, content });
          currentFilePath = filePath;
          isDirty = false;
        }
      }
    } catch (err) {
      console.error('Failed to save file:', err);
      alert('ファイルの保存に失敗しました');
    }
  }

  // CodeMirrorのキーバインド設定
  const customKeymap = [
    {
      key: "Mod-s",
      run: () => {
        saveFile();
        return true;
      }
    }
  ];

  onMount(() => {
    if (!editorElement) return;

    // CodeMirrorの初期状態設定
    const startState = EditorState.create({
      doc: '// Welcome to Svelix Editor',
      extensions: [
        basicSetup,
        keymap.of([...customKeymap, ...defaultKeymap]),
        oneDark, // ダークテーマ
        EditorView.updateListener.of((update: ViewUpdate) => {
          if (update.docChanged && !isOpeningFile) {
            isDirty = true;
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

<div class="main-layout" onclick={closeMenu} onkeydown={(e) => e.key === 'Escape' && closeMenu()} role="button" tabindex="0">
  
  <!-- Menu Bar -->
  <header class="menu-bar" onclick={(e) => e.stopPropagation()} onkeydown={() => {}} role="toolbar" tabindex="0">
    <div class="logo-container-small">
      <img src="/svelix_logo.png" alt="Svelix" class="logo-small" />
    </div>
    <div class="menu-items">
      <div class="menu-item-wrapper">
        <div 
          class="menu-item {isFileMenuOpen ? 'active' : ''}" 
          onclick={toggleFileMenu} 
          onkeydown={(e) => e.key === 'Enter' && toggleFileMenu(e as unknown as MouseEvent)}
          role="button"
          tabindex="0"
        >File</div>
        {#if isFileMenuOpen}
          <div class="dropdown-menu">
            <div class="dropdown-item" onclick={() => handleFileAction('newTextFile')} onkeydown={() => {}} role="menuitem" tabindex="0">New Text File</div>
            <div class="dropdown-item" onclick={() => handleFileAction('newFile')} onkeydown={() => {}} role="menuitem" tabindex="0">New File...</div>
            <div class="separator"></div>
            <div class="dropdown-item" onclick={() => handleFileAction('openFile')} onkeydown={() => {}} role="menuitem" tabindex="0">Open File...</div>
            <div class="dropdown-item" onclick={() => handleFileAction('openFolder')} onkeydown={() => {}} role="menuitem" tabindex="0">Open Folder...</div>
            <div class="separator"></div>
            <div class="dropdown-item" onclick={() => handleFileAction('save')} onkeydown={() => {}} role="menuitem" tabindex="0">Save</div>
            <div class="dropdown-item" onclick={() => handleFileAction('saveAs')} onkeydown={() => {}} role="menuitem" tabindex="0">Save As...</div>
            <div class="separator"></div>
            <div class="dropdown-item" onclick={() => handleFileAction('exit')} onkeydown={() => {}} role="menuitem" tabindex="0">Exit</div>
          </div>
        {/if}
      </div>
      {#each ['Edit', 'Selection', 'View', 'Go', 'Run', 'Terminal', 'Help'] as menu}
        <div class="menu-item">{menu}</div>
      {/each}
    </div>
  </header>

  <!-- Activity Bar -->
  <aside class="activity-bar">
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
         <div class="tab-actions">
           {#if isDirty}
             <div class="unsaved-indicator">
               <Circle size={10} fill="white" strokeWidth={0} />
             </div>
             <!-- 未保存時もホバーで閉じるボタンを表示するための隠しボタン -->
             <button class="tab-close close-on-hover" aria-label="Close Tab"><X size={14} /></button>
           {:else}
             <button class="tab-close" aria-label="Close Tab"><X size={14} /></button>
           {/if}
         </div>
       </div>
      {:else}
        <div class="tab active">
          <span class="tab-icon">📄</span>
          <span class="tab-name">Untitled</span>
          <div class="tab-actions">
            {#if isDirty}
              <div class="unsaved-indicator">
                <Circle size={10} fill="white" strokeWidth={0} />
              </div>
              <button class="tab-close close-on-hover" aria-label="Close Tab"><X size={14} /></button>
            {:else}
              <button class="tab-close" aria-label="Close Tab"><X size={14} /></button>
            {/if}
          </div>
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
      "menu-bar menu-bar menu-bar"
      "activity-bar sidebar editor"
      "status-bar status-bar status-bar";
    grid-template-columns: 48px 250px 1fr;
    grid-template-rows: 30px 1fr 22px;
    height: 100vh;
    width: 100vw;
  }

  /* Menu Bar */
  .menu-bar {
    grid-area: menu-bar;
    background-color: #3c3c3c; /* VSCode Title Bar color */
    display: flex;
    align-items: center;
    padding: 0 8px;
    font-size: 13px;
  }

  .logo-container-small {
    margin-right: 10px;
    display: flex;
    align-items: center;
  }

  .logo-small {
    width: 20px;
    height: 20px;
  }

  .menu-items {
    display: flex;
    gap: 4px;
  }

  .menu-item-wrapper {
    position: relative;
  }

  .menu-item {
    padding: 2px 6px;
    cursor: pointer;
    border-radius: 3px;
  }

  .menu-item:hover, .menu-item.active {
    background-color: #505050;
  }

  .dropdown-menu {
    position: absolute;
    top: 100%;
    left: 0;
    background-color: #252526; /* VSCode Menu bg */
    border: 1px solid #454545;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
    min-width: 200px;
    z-index: 1000;
    padding: 4px 0;
    border-radius: 3px;
  }

  .dropdown-item {
    padding: 6px 20px 6px 25px;
    cursor: pointer;
    color: #cccccc;
    font-size: 13px;
    display: flex;
    align-items: center;
  }

  .dropdown-item:hover {
    background-color: #094771; /* VSCode Menu Hover bg */
    color: white;
  }

  .separator {
    height: 1px;
    background-color: #454545;
    margin: 4px 10px;
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

  .action-item {
    background: transparent;
    border: none;
    color: #858585;
    padding: 0;
    cursor: pointer;
    display: flex;
    justify-content: center;
    align-items: center;
    width: 48px;
    height: 48px;
    position: relative;
    border-left: 2px solid transparent; /* To prevent layout shift */
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
  
  .tab-actions {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    margin-left: 5px;
  }

  .unsaved-indicator {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* VSCodeの挙動: 未保存時は●、ホバーするとXになる */
  .tab:hover .unsaved-indicator {
    display: none;
  }

  .tab:hover .tab-actions .close-on-hover {
    display: flex;
  }
  
  .close-on-hover {
    display: none; /* デフォルトは非表示 */
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
    /* CodeMirrorの高さを親要素に合わせる */
    display: flex;
    flex-direction: column;
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
  
  :global(.cm-scroller) {
    overflow: auto;
  }
</style>
