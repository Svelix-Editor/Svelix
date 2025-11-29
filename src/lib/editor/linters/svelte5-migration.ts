import type { EditorView } from "@codemirror/view";
import type { Diagnostic } from "@codemirror/lint";

export function svelte5MigrationLinter(view: EditorView): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const doc = view.state.doc;
  const text = doc.toString();

  // 簡易的なスクリプトブロックの検出
  // 注: これは完全なパーサーではないため、コメント内や文字列内のマッチングなどの誤検知の可能性があります
  const scriptRegex = /<script[^>]*>([\s\S]*?)<\/script>/g;
  let scriptMatch;

  while ((scriptMatch = scriptRegex.exec(text)) !== null) {
    const scriptContent = scriptMatch[1];
    const scriptStart = scriptMatch.index + scriptMatch[0].indexOf(scriptMatch[1]);

    // Svelte 4 リアクティブ宣言 $: の検出
    const reactiveLabelRegex = /^\s*\$:\s+/gm;
    let match;
    while ((match = reactiveLabelRegex.exec(scriptContent)) !== null) {
      const from = scriptStart + match.index;
      const to = from + match[0].length;
      
      diagnostics.push({
        from,
        to,
        severity: "warning",
        message: "Svelte 5: Legacy reactive declaration '$:'. Consider using $derived or $effect.",
        actions: [
            {
                name: "Replace with $effect",
                apply(view, from, to) {
                    // 単純な置換は難しいが、ヒントとして挿入
                    view.dispatch({changes: {from, to, insert: "$effect(() => "}});
                }
            }
        ]
      });
    }

    // イベントディスパッチャーの検出
    const dispatchRegex = /createEventDispatcher\(\)/g;
    while ((match = dispatchRegex.exec(scriptContent)) !== null) {
      const from = scriptStart + match.index;
      const to = from + match[0].length;

      diagnostics.push({
        from,
        to,
        severity: "info",
        message: "Svelte 5: createEventDispatcher is deprecated. Use callback props instead.",
      });
    }
    
    // export let (Props) の検出
    const propsRegex = /export\s+let\s+(\w+)/g;
    while ((match = propsRegex.exec(scriptContent)) !== null) {
        const from = scriptStart + match.index;
        const to = from + match[0].length;
        
        diagnostics.push({
            from,
            to,
            severity: "info",
            message: "Svelte 5: Legacy prop declaration. Consider using $props().",
            actions: [{
                name: "Learn about $props",
                apply(view, from, to) {
                    window.open('https://svelte.dev/docs/svelte/$props', '_blank');
                }
            }]
        });
    }
  }

  // テンプレート内の on:click イベントの検出
  const eventRegex = /\son:([a-zA-Z]+)=/g;
  let eventMatch;
  while ((eventMatch = eventRegex.exec(text)) !== null) {
      // scriptタグの中を除外する簡易ロジックが必要だが、ここでは一旦全体を対象にする
      const eventName = eventMatch[1];
      const from = eventMatch.index + 1; //先頭のスペースを飛ばす
      const to = from + 3; // "on:" の長さ

      diagnostics.push({
          from,
          to,
          severity: "warning",
          message: `Svelte 5: 'on:${eventName}' is deprecated. Use 'on${eventName}' attribute instead.`,
          actions: [{
              name: "Fix to handler attribute",
              apply(view, from, to) {
                  view.dispatch({changes: {from, to, insert: "on"}});
              }
          }]
      });
  }

  // 全てのletをチェックするのは重いので、scriptタグ内での簡易チェック
  const scriptRegexForLet = /<script[^>]*>([\s\S]*?)<\/script>/g;
  let scriptMatchForLet;

  while ((scriptMatchForLet = scriptRegexForLet.exec(text)) !== null) {
      const scriptContent = scriptMatchForLet[1];
      const scriptStart = scriptMatchForLet.index + scriptMatchForLet[0].indexOf(scriptMatchForLet[1]);
      
      // let変数の宣言を検出: let x = 0; または let x;
      // 値の部分も含めてキャプチャする
      const letRegex = /let\s+(\w+)\s*(?:=\s*([^;]+))?/g;
      let letMatch;
      while ((letMatch = letRegex.exec(scriptContent)) !== null) {
          const varName = letMatch[1];
          const initialValue = letMatch[2] ? letMatch[2].trim() : undefined;
          const declFrom = scriptStart + letMatch.index;
          
          // 既に$stateを使っている場合はスキップ
          if (initialValue && (initialValue.startsWith('$state') || initialValue.startsWith('$derived') || initialValue.startsWith('$props'))) {
              continue;
          }

          // 再代入を検索: x = ... (簡易的)
          // 宣言より後ろにあること
          const assignRegex = new RegExp(`\\b${varName}\\s*=[^=]`, 'g');
          assignRegex.lastIndex = letMatch.index + letMatch[0].length;
          
          if (assignRegex.test(scriptContent)) {
              // 再代入が見つかった場合、警告を出す
              diagnostics.push({
                  from: declFrom,
                  to: declFrom + letMatch[0].length,
                  severity: "hint", // 警告ではなくヒントレベル
                  message: `Svelte 5: Variable '${varName}' is reassigned. If this should be reactive, use $state.`,
                  actions: [{
                      name: "Change to $state",
                      apply(view, from, to) {
                          // "let x = 0" -> "let x = $state(0)"
                          // "let x" -> "let x = $state()"
                          if (initialValue) {
                              // 値がある場合
                              const text = view.state.doc.sliceString(from, to);
                              // 宣言全体を置換する方が安全
                              const newText = text.replace(/=\s*([^;]+)/, `= $state($1)`);
                              view.dispatch({changes: {from, to, insert: newText}});
                          } else {
                              // 値がない場合 (let x;)
                              // この場合、正規表現のマッチ範囲は "let x" までなので、そのまま追加できるか確認が必要
                              // letMatch[0]の長さを信頼する
                              view.dispatch({changes: {from, to, insert: `let ${varName} = $state()`}});
                          }
                      }
                  }]
              });
          }
      }
  }

  return diagnostics;
}

