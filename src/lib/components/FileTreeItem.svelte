<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';
  import { ChevronRight, ChevronDown, File, Folder } from 'lucide-svelte';

  // 親から受け取るprops
  let { 
    entry, 
    level = 0, 
    onFileClick 
  } : { 
    entry: any, 
    level?: number, 
    onFileClick: (entry: any) => void 
  } = $props();

  // 内部状態
  let isOpen = $state(false);
  let isLoading = $state(false);
  let children = $state<any[]>([]);

  // フォルダクリック時の処理
  async function handleFolderClick(e: MouseEvent) {
    e.stopPropagation();
    
    if (isOpen) {
      isOpen = false;
    } else {
      isOpen = true;
      // まだ子要素を読み込んでいない場合のみ読み込む
      if (children.length === 0) {
        await loadChildren();
      }
    }
  }

  // 子要素を読み込む関数
  async function loadChildren() {
    isLoading = true;
    try {
      // Rustのコマンドを呼び出してディレクトリの中身を取得
      children = await invoke('read_dir', { path: entry.path });
    } catch (err) {
      console.error('Failed to read directory:', err);
    } finally {
      isLoading = false;
    }
  }

  // ファイルクリック時の処理
  function handleFileClick(e: MouseEvent) {
    e.stopPropagation();
    onFileClick(entry);
  }
</script>

<!-- フォルダの場合 -->
{#if entry.is_dir}
  <div 
    class="tree-item"
    style="padding-left: {level * 10 + 10}px"
    onclick={handleFolderClick}
    onkeydown={(e) => e.key === 'Enter' && handleFolderClick(e as unknown as MouseEvent)}
    role="button"
    tabindex="0"
  >
    <span class="tree-icon">
      {#if isOpen}
        <ChevronDown size={14} />
      {:else}
        <ChevronRight size={14} />
      {/if}
      <Folder size={14} class="ml-1" />
    </span>
    <span class="tree-name">{entry.name}</span>
  </div>

  <!-- 子要素の再帰表示 -->
  {#if isOpen}
    {#if isLoading}
      <div class="loading-message" style="padding-left: {(level + 1) * 10 + 10}px">Loading...</div>
    {:else}
      {#each children as child}
        <svelte:self entry={child} level={level + 1} {onFileClick} />
      {/each}
    {/if}
  {/if}

<!-- ファイルの場合 -->
{:else}
  <div 
    class="tree-item"
    style="padding-left: {level * 10 + 10}px"
    onclick={handleFileClick}
    onkeydown={(e) => e.key === 'Enter' && handleFileClick(e as unknown as MouseEvent)}
    role="button"
    tabindex="0"
  >
    <span class="tree-icon">
      <span class="spacer"></span>
      <File size={14} class="ml-1" />
    </span>
    <span class="tree-name">{entry.name}</span>
  </div>
{/if}

<style>
  .tree-item {
    display: flex;
    align-items: center;
    padding-top: 3px;
    padding-bottom: 3px;
    padding-right: 10px;
    cursor: pointer;
    font-size: 13px;
    color: #cccccc;
    user-select: none;
  }

  .tree-item:hover {
    background-color: #2a2d2e;
  }

  .tree-icon {
    display: flex;
    align-items: center;
    margin-right: 6px;
    color: #8da5b5;
    flex-shrink: 0;
  }
  
  :global(.ml-1) {
    margin-left: 4px;
  }

  .spacer {
    width: 14px;
    display: inline-block;
  }

  .tree-name {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .loading-message {
    font-size: 12px;
    color: #858585;
    padding-top: 2px;
    padding-bottom: 2px;
  }
</style>

