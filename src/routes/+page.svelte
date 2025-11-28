<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { basicSetup } from 'codemirror';
  import { EditorState } from '@codemirror/state';
  import { oneDark } from '@codemirror/theme-one-dark';
  import { EditorView, keymap, type ViewUpdate } from '@codemirror/view';
  import { defaultKeymap } from '@codemirror/commands';
  import { open } from '@tauri-apps/plugin-dialog';
  import { readTextFile } from '@tauri-apps/plugin-fs';

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

  onMount(() => {
    if (!editorElement) return;

    // CodeMirrorの初期状態設定
    const startState = EditorState.create({
      doc: '// ここにファイルの内容が表示されます',
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

<main class="container">
  <header class="toolbar">
    <button onclick={openFile}>ファイルを開く</button>
    <span class="filename">{currentFilePath ? currentFilePath : 'ファイル未選択'}</span>
  </header>
  
  <div class="editor-container" bind:this={editorElement}></div>
</main>

<style>
  :global(body) {
    margin: 0;
    padding: 0;
    overflow: hidden;
    background-color: #282c34;
    color: white;
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  }

  .container {
    display: flex;
    flex-direction: column;
    height: 100vh;
    width: 100vw;
  }

  .toolbar {
    padding: 10px;
    background-color: #21252b;
    border-bottom: 1px solid #181a1f;
    display: flex;
    align-items: center;
    gap: 15px;
  }

  .filename {
    font-size: 0.9em;
    color: #abb2bf;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  button {
    padding: 6px 12px;
    background-color: #3d4350;
    color: #d7dae0;
    border: 1px solid #181a1f;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.9em;
  }

  button:hover {
    background-color: #4b5363;
  }

  .editor-container {
    flex-grow: 1;
    overflow: hidden;
    /* CodeMirrorの高さを親要素に合わせる */
    display: flex;
    flex-direction: column;
  }

  /* CodeMirrorのスタイル調整 */
  :global(.cm-editor) {
    height: 100%;
    font-size: 14px;
  }
  
  :global(.cm-scroller) {
    overflow: auto;
  }
</style>
