import { snippetCompletion } from "@codemirror/autocomplete";

// Svelte 5 Runes Snippets
export const svelte5Snippets = [
  snippetCompletion("$state(${1:initialValue})", {
    label: "$state",
    detail: "rune",
    type: "keyword",
    info: "Declares reactive state."
  }),
  snippetCompletion("$derived(${1:expression})", {
    label: "$derived",
    detail: "rune",
    type: "keyword",
    info: "Declares derived state."
  }),
  snippetCompletion("$derived.by(() => {\n\t${1}\n})", {
    label: "$derived.by",
    detail: "rune",
    type: "keyword",
    info: "Declares derived state using a function."
  }),
  snippetCompletion("$effect(() => {\n\t${1}\n})", {
    label: "$effect",
    detail: "rune",
    type: "keyword",
    info: "Runs a side effect when dependencies change."
  }),
  snippetCompletion("$effect.pre(() => {\n\t${1}\n})", {
    label: "$effect.pre",
    detail: "rune",
    type: "keyword",
    info: "Runs a side effect before the DOM updates."
  }),
  snippetCompletion("$props()", {
    label: "$props",
    detail: "rune",
    type: "keyword",
    info: "Declares component props."
  }),
  snippetCompletion("let { ${1} } = $props();", {
    label: "props",
    detail: "template",
    type: "snippet",
    info: "Destructure props pattern."
  }),
  snippetCompletion("$bindable(${1:initialValue})", {
    label: "$bindable",
    detail: "rune",
    type: "keyword",
    info: "Declares a bindable prop."
  }),
  snippetCompletion("$inspect(${1:value})", {
    label: "$inspect",
    detail: "rune",
    type: "keyword",
    info: "Logs values when they change during development."
  }),
  snippetCompletion("{#snippet ${1:name}(${2:params})}\n\t${3}\n{/snippet}", {
    label: "snippet",
    detail: "block",
    type: "snippet",
    info: "Defines a reusable snippet block."
  })
];

