import { snippetCompletion } from "@codemirror/autocomplete";

// Helper to create rich tooltips
const createTooltip = (title: string, description: string, code?: string) => {
  return () => {
    const dom = document.createElement("div");
    dom.className = "cm-snippet-tooltip";
    dom.style.cssText = "padding: 5px; font-family: inherit; max-width: 300px;";

    const titleEl = document.createElement("div");
    titleEl.style.fontWeight = "bold";
    titleEl.style.borderBottom = "1px solid #444";
    titleEl.style.marginBottom = "5px";
    titleEl.style.paddingBottom = "2px";
    titleEl.textContent = title;
    dom.appendChild(titleEl);

    const descEl = document.createElement("div");
    descEl.textContent = description;
    descEl.style.marginBottom = "8px";
    dom.appendChild(descEl);

    if (code) {
      const codeEl = document.createElement("pre");
      codeEl.style.cssText = "background: #282c34; padding: 5px; border-radius: 4px; overflow-x: auto; margin: 0; font-family: monospace; font-size: 0.9em; white-space: pre-wrap;";
      codeEl.textContent = code;
      dom.appendChild(codeEl);
    }

    return dom;
  };
};

// Svelte 5 Runes Snippets
export const svelte5Snippets = [
  snippetCompletion("$state(${1:initialValue})", {
    label: "$state",
    detail: "rune",
    type: "keyword",
    info: createTooltip(
      "$state",
      "Declares reactive state. Updates to this value will automatically trigger re-renders in the UI.",
      "let count = $state(0);\ncount += 1;"
    )
  }),
  snippetCompletion("$derived(${1:expression})", {
    label: "$derived",
    detail: "rune",
    type: "keyword",
    info: createTooltip(
      "$derived",
      "Declares derived state. The value updates automatically when dependencies change.",
      "let double = $derived(count * 2);"
    )
  }),
  snippetCompletion("$derived.by(() => {\n\t${1}\n})", {
    label: "$derived.by",
    detail: "rune",
    type: "keyword",
    info: createTooltip(
      "$derived.by",
      "Declares derived state using a function body. Useful for complex logic.",
      "let total = $derived.by(() => {\n  return items.reduce((a, b) => a + b, 0);\n});"
    )
  }),
  snippetCompletion("$effect(() => {\n\t${1}\n})", {
    label: "$effect",
    detail: "rune",
    type: "keyword",
    info: createTooltip(
      "$effect",
      "Runs a side effect when dependencies change. Runs after the DOM updates.",
      "$effect(() => {\n  console.log('Count changed:', count);\n  return () => { /* cleanup */ };\n});"
    )
  }),
  snippetCompletion("$effect.pre(() => {\n\t${1}\n})", {
    label: "$effect.pre",
    detail: "rune",
    type: "keyword",
    info: createTooltip(
      "$effect.pre",
      "Runs a side effect before the DOM updates. Useful for scrolling logic etc.",
      "$effect.pre(() => {\n  const scrollHeight = div.scrollHeight;\n});"
    )
  }),
  snippetCompletion("$props()", {
    label: "$props",
    detail: "rune",
    type: "keyword",
    info: createTooltip(
      "$props",
      "Declares component props. Returns an object containing all passed props.",
      "let { name, age = 0 } = $props();"
    )
  }),
  snippetCompletion("let { ${1} } = $props();", {
    label: "props",
    detail: "template",
    type: "snippet",
    info: createTooltip(
      "Props Destructuring",
      "Common pattern for destructuring props directly.",
      "let { title, children } = $props();"
    )
  }),
  snippetCompletion("$bindable(${1:initialValue})", {
    label: "$bindable",
    detail: "rune",
    type: "keyword",
    info: createTooltip(
      "$bindable",
      "Declares a prop that can be bound to by the parent.",
      "let { value = $bindable(0) } = $props();"
    )
  }),
  snippetCompletion("$inspect(${1:value})", {
    label: "$inspect",
    detail: "rune",
    type: "keyword",
    info: createTooltip(
      "$inspect",
      "Logs values to the console whenever they change. Development only.",
      "$inspect(count);"
    )
  }),
  snippetCompletion("$host()", {
    label: "$host",
    detail: "rune",
    type: "keyword",
    info: createTooltip(
      "$host",
      "Retrieves the 'this' reference of the custom element instance.",
      "const el = $host();\nel.dispatchEvent(new CustomEvent('change'));"
    )
  }),
  snippetCompletion("{#snippet ${1:name}(${2:params})}\n\t${3}\n{/snippet}", {
    label: "snippet",
    detail: "block",
    type: "snippet",
    info: createTooltip(
      "Snippet Block",
      "Defines a reusable snippet block that can be rendered with @render.",
      "{#snippet header(text)}\n  <h1>{text}</h1>\n{/snippet}"
    )
  }),
  snippetCompletion("{@render ${1:snippetName}(${2:args})}", {
    label: "render",
    detail: "tag",
    type: "snippet",
    info: createTooltip(
      "Render Tag",
      "Renders a defined snippet.",
      "{@render header('Hello World')}"
    )
  })
];
