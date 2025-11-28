import { MatchDecorator, ViewPlugin, Decoration, type DecorationSet, EditorView, type ViewUpdate } from '@codemirror/view';
import type { Extension } from '@codemirror/state';

const runesMatcher = new MatchDecorator({
  regexp: /\$(state|derived|effect|props|bindable|inspect|host)(?:\.[a-zA-Z0-9_]+)?/g,
  decoration: Decoration.mark({
    class: "cm-svelte-rune"
  })
});

const runesPlugin = ViewPlugin.fromClass(class {
  decorations: DecorationSet;
  constructor(view: EditorView) {
    this.decorations = runesMatcher.createDeco(view);
  }
  update(update: ViewUpdate) {
    this.decorations = runesMatcher.updateDeco(update, this.decorations);
  }
}, {
  decorations: v => v.decorations
});

const runesTheme = EditorView.baseTheme({
  ".cm-svelte-rune": {
    color: "#c678dd", // One Darkの紫系
    fontWeight: "bold"
  }
});

export function svelteRunes(): Extension {
  return [runesPlugin, runesTheme];
}

