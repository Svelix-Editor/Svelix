<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { basicSetup } from 'codemirror';
  import { EditorState } from '@codemirror/state';
  import { oneDark } from '@codemirror/theme-one-dark';
  import { EditorView, keymap, type ViewUpdate } from '@codemirror/view';
  import { defaultKeymap } from '@codemirror/commands';
  import { open, save, ask } from '@tauri-apps/plugin-dialog';
  import { invoke } from '@tauri-apps/api/core';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { Files, Search, GitGraph, Settings, X, Circle } from 'lucide-svelte';
  import FileTreeItem from '../lib/components/FileTreeItem.svelte';

  // エディタのコンテナ要素への参照
  let editorElement: HTMLElement;
  // CodeMirrorのエディタインスタンス
  let editorView: EditorView | undefined;

  // ファイル情報の型定義
  interface FileInfo {
    path: string | null; // nullなら新規ファイル
    content: string;
    isDirty: boolean;
    scrollPosition?: number;
  }

  // ファイルエントリの型定義 (Rust側と同期)
  interface FileEntry {
    name: string;
    path: string;
    is_dir: boolean;
    children?: FileEntry[];
    isOpen?: boolean; // フォルダが開いているか（フロントエンド用）
  }

  // 開いているファイルのリスト
  let openedFiles = $state<FileInfo[]>([]);
  // 現在アクティブなファイルのインデックス
  let activeFileIndex = $state<number>(-1);
  
  // 現在開いているフォルダパス
  let currentFolderPath = $state<string | null>(null);
  // フォルダ内のファイルリスト
  let folderFiles = $state<FileEntry[]>([]);

  // 現在アクティブなファイル情報を取得するヘルパー
  let activeFile = $derived(activeFileIndex >= 0 && activeFileIndex < openedFiles.length ? openedFiles[activeFileIndex] : null);
  let currentFilePath = $derived(activeFile ? activeFile.path : null);
  let isDirty = $derived(activeFile ? activeFile.isDirty : false);

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

  async function handleFileAction(action: string) {
    console.log(`Action: ${action}`);
    if (action === 'openFile') {
      openFile();
    } else if (action === 'openFolder') {
      openFolder();
    } else if (action === 'newTextFile' || action === 'newFile') {
      createNewFile();
    } else if (action === 'save') {
      saveFile();
    } else if (action === 'exit') {
      await exitApp();
    }
    isFileMenuOpen = false;
  }

  // アプリケーション終了処理
  async function exitApp() {
    // 未保存のファイルがあるか確認
    const dirtyFiles = openedFiles.filter(f => f.isDirty);
    
    if (dirtyFiles.length > 0) {
      const confirmed = await ask('There are unsaved changes. Do you want to quit?\n(Press “Yes” to discard changes and exit, “No” to cancel)', {
        title: 'Unsaved Changes',
        kind: 'warning',
        okLabel: 'Yes',
        cancelLabel: 'No'
      });
      
      if (!confirmed) {
        return; // キャンセル
      }
    }
    
    // await getCurrentWindow().close();
    await invoke('exit_app');
  }

  // フォルダを開く関数
  async function openFolder() {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
      });

      if (selected === null) {
        return;
      }

      const folderPath = selected as string;
      currentFolderPath = folderPath;
      await loadDir(folderPath);
      
    } catch (err) {
      console.error('Failed to open folder:', err);
      alert('フォルダの読み込みに失敗しました');
    }
  }

  // ディレクトリを読み込む関数
  async function loadDir(path: string) {
    try {
      const entries = await invoke<FileEntry[]>('read_dir', { path });
      folderFiles = entries;
    } catch (err) {
      console.error('Failed to read directory:', err);
    }
  }

  // ツリービューでファイルをクリックしたとき
  async function handleFileClick(entry: FileEntry) {
    // 既に開いているかチェック
    const existingIndex = openedFiles.findIndex(f => f.path === entry.path);
    if (existingIndex !== -1) {
      switchTab(existingIndex);
      return;
    }

    try {
      const content = await invoke<string>('read_file_content', { path: entry.path });
      openedFiles = [...openedFiles, {
        path: entry.path,
        content: content,
        isDirty: false
      }];
      switchTab(openedFiles.length - 1);
    } catch (err) {
      console.error('Failed to open file:', err);
    }
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
      
      // 既に開いているかチェック
      const existingIndex = openedFiles.findIndex(f => f.path === filePath);
      if (existingIndex !== -1) {
        switchTab(existingIndex);
        return;
      }

      // Rustのコマンドを呼び出してファイルを読み込む
      const content = await invoke<string>('read_file_content', { path: filePath });
      
      // 新しいファイルを追加
      openedFiles = [...openedFiles, {
        path: filePath,
        content: content,
        isDirty: false
      }];
      
      // 新しいファイルをアクティブにする
      switchTab(openedFiles.length - 1);
      
    } catch (err) {
      console.error('Failed to open file:', err);
      alert('ファイルの読み込みに失敗しました');
      isOpeningFile = false;
    }
  }

  // タブを切り替える関数
  function switchTab(index: number) {
    if (index < 0 || index >= openedFiles.length) return;
    
    // 現在のファイルの内容を保存（メモリ上）
    if (activeFile && editorView) {
      openedFiles[activeFileIndex].content = editorView.state.doc.toString();
      // スクロール位置の保存などもここで行うと良い
    }

    activeFileIndex = index;
    const file = openedFiles[index];

    // エディタの内容を更新
    if (editorView) {
      // ファイル切り替え中フラグを立てる
      isOpeningFile = true;
      
      editorView.dispatch({
        changes: {
          from: 0,
          to: editorView.state.doc.length,
          insert: file.content
        }
      });
      
      // 少し待ってからフラグを下ろす
      setTimeout(() => {
        isOpeningFile = false;
      }, 50);
    }
  }

  // タブを閉じる関数
  function closeTab(index: number, event?: MouseEvent) {
    if (event) event.stopPropagation();
    
    // 未保存の確認などはここで実装する
    if (openedFiles[index].isDirty) {
      if (!confirm('未保存の変更があります。閉じてもよろしいですか？')) {
        return;
      }
    }

    const newOpenedFiles = openedFiles.filter((_, i) => i !== index);
    openedFiles = newOpenedFiles;

    if (activeFileIndex === index) {
      // アクティブなタブを閉じた場合、隣のタブをアクティブにするか、タブがなければ-1にする
      if (newOpenedFiles.length === 0) {
        activeFileIndex = -1;
        // エディタをクリア
        if (editorView) {
          editorView.dispatch({
            changes: {
              from: 0,
              to: editorView.state.doc.length,
              insert: '' // Welcomeメッセージなどを表示しても良い
            }
          });
        }
      } else {
        // 右側のタブがあればそれを、なければ左側（index - 1）をアクティブにする
        const newIndex = index < newOpenedFiles.length ? index : index - 1;
        // switchTabを使って内容を更新したいが、state更新直後なので少し複雑
        // ここでは簡易的にindexを更新して、reactiveに処理させるか、明示的に呼び出す
        // switchTabは内部で現在の内容を保存しようとするので、閉じたファイルに対しては不適切
        // 直接エディタ更新ロジックを書く
        activeFileIndex = newIndex;
        const file = newOpenedFiles[newIndex];
        if (editorView) {
          isOpeningFile = true;
          editorView.dispatch({
            changes: { from: 0, to: editorView.state.doc.length, insert: file.content }
          });
          setTimeout(() => isOpeningFile = false, 50);
        }
      }
    } else if (activeFileIndex > index) {
      // 閉じたタブより後ろのタブがアクティブだった場合、インデックスをずらす
      activeFileIndex--;
    }
  }

  // 新規ファイル作成（仮実装）
  function createNewFile() {
    openedFiles = [...openedFiles, {
      path: null,
      content: '',
      isDirty: false
    }];
    switchTab(openedFiles.length - 1);
  }

  // ファイル名を取得するヘルパー
  function getFileName(path: string | null): string {
    if (!path) return 'Untitled';
    // WindowsとUnix系の両方のパス区切りに対応
    return path.split(/[\\/]/).pop() || 'Untitled';
  }

  // ファイルを保存する関数
  async function saveFile() {
    if (!editorView || !activeFile) return;

    const content = editorView.state.doc.toString();
    const currentPath = activeFile.path;

    try {
      if (currentPath) {
        // 既存ファイルの上書き保存（Rustコマンド呼び出し）
        await invoke('write_file_content', { path: currentPath, content });
        openedFiles[activeFileIndex].isDirty = false;
        openedFiles[activeFileIndex].content = content;
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
          openedFiles[activeFileIndex].path = filePath;
          openedFiles[activeFileIndex].isDirty = false;
          openedFiles[activeFileIndex].content = content;
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
          if (update.docChanged && !isOpeningFile && activeFileIndex >= 0) {
            openedFiles[activeFileIndex].isDirty = true;
            // 念のためcontentも更新しておく（スイッチ時に使用するため）
            openedFiles[activeFileIndex].content = update.state.doc.toString();
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
      <!-- Open Editors Section -->
      <div class="explorer-section">
        <div class="section-header">OPEN EDITORS</div>
        <div class="section-body open-editors-list">
          {#if openedFiles.length === 0}
            <div class="empty-message">No open files</div>
          {:else}
            {#each openedFiles as file, index}
              <div 
                class="open-editor-item {activeFileIndex === index ? 'active' : ''}"
                onclick={() => switchTab(index)}
                onkeydown={(e) => e.key === 'Enter' && switchTab(index)}
                role="button"
                tabindex="0"
              >
                <div class="file-info">
                  <span class="file-icon">📄</span>
                  <span class="file-name">{getFileName(file.path)}</span>
                  {#if file.isDirty}
                    <span class="unsaved-dot">●</span>
                  {/if}
                </div>
                <button class="close-btn" onclick={(e) => closeTab(index, e)} aria-label="Close File">
                  <X size={14} />
                </button>
              </div>
            {/each}
          {/if}
        </div>
      </div>

      <!-- No Folder Opened Section / File Tree -->
      <div class="explorer-section">
        {#if currentFolderPath}
          <div class="section-header" title={currentFolderPath}>{getFileName(currentFolderPath).toUpperCase()}</div>
          <div class="section-body file-tree">
            {#each folderFiles as entry}
              <FileTreeItem {entry} onFileClick={handleFileClick} />
            {/each}
          </div>
        {:else}
          <div class="section-header">NO FOLDER OPENED</div>
          <div class="section-body">
            <p>You have not yet opened a folder.</p>
            <button onclick={openFile} class="primary-button">Open File</button>
            <button onclick={openFolder} class="primary-button" style="margin-top: 10px;">Open Folder</button>
          </div>
        {/if}
      </div>
    </div>
  </aside>
  
  <!-- Main Editor Area -->
  <main class="editor-area">
    <!-- Tabs -->
    <div class="tabs-bar">
      {#each openedFiles as file, index}
       <div 
         class="tab {activeFileIndex === index ? 'active' : ''}"
         onclick={() => switchTab(index)}
         onkeydown={(e) => e.key === 'Enter' && switchTab(index)}
         role="button"
         tabindex="0"
       >
         <span class="tab-icon">📄</span>
         <span class="tab-name">{getFileName(file.path)}</span>
         <div class="tab-actions">
           {#if file.isDirty}
             <div class="unsaved-indicator">
               <Circle size={10} fill="white" strokeWidth={0} />
             </div>
             <!-- 未保存時もホバーで閉じるボタンを表示するための隠しボタン -->
             <button class="tab-close close-on-hover" onclick={(e) => closeTab(index, e)} aria-label="Close Tab"><X size={14} /></button>
           {:else}
             <button class="tab-close" onclick={(e) => closeTab(index, e)} aria-label="Close Tab"><X size={14} /></button>
           {/if}
         </div>
       </div>
      {/each}
      {#if openedFiles.length === 0}
        <!-- タブがない場合のプレースホルダー（必要に応じて） -->
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
    overflow: hidden; /* コンテンツが溢れた場合に備えて制限 */
  }

  .sidebar-header {
    padding: 10px 20px;
    font-size: 11px;
    font-weight: bold;
    color: #bbbbbb;
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-shrink: 0; /* ヘッダーが縮まないように */
  }

  .sidebar-content {
    flex-grow: 1;
    overflow-y: auto;
    min-height: 0; /* Flexbox内でのスクロールに必要 */
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

  .file-tree {
    padding: 0;
    text-align: left;
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

  .open-editors-list {
    padding: 0;
    text-align: left;
  }

  .empty-message {
    padding: 10px 20px;
    font-size: 13px;
    color: #969696;
    font-style: italic;
  }

  .open-editor-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 3px 10px;
    cursor: pointer;
    font-size: 13px;
    color: #cccccc;
  }

  .open-editor-item:hover {
    background-color: #2a2d2e;
  }

  .open-editor-item.active {
    background-color: #37373d;
    color: white;
  }

  .file-info {
  display: flex;
    align-items: center;
    overflow: hidden;
    flex-grow: 1;
  }

  .unsaved-dot {
    margin-left: 6px;
    font-size: 10px;
    color: white;
  }

  .close-btn {
    background: transparent;
    border: none;
    color: #cccccc;
    cursor: pointer;
    padding: 2px;
    border-radius: 3px;
    display: none; /* デフォルト非表示 */
    align-items: center;
  justify-content: center;
}

  .open-editor-item:hover .close-btn {
    display: flex; /* ホバー時表示 */
  }

  .close-btn:hover {
    background-color: #4b4b4b;
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
    background-color: #2d2d2d; /* Inactive tab bg */
    color: #969696; /* Inactive tab text */
    padding: 0 10px;
    display: flex;
    align-items: center;
    border-right: 1px solid #252526;
    border-top: 1px solid transparent; 
    min-width: 120px;
    max-width: 200px;
  cursor: pointer;
    font-size: 13px;
  }

  .tab.active {
    background-color: #1e1e1e;
    color: #ffffff;
    border-top: 1px solid #007acc; /* Active tab indicator */
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
    overflow: auto !important;
    height: 100% !important;
  }
</style>
