import * as monaco from 'monaco-editor';
let editor = null;
// Night Owl theme
monaco.editor.defineTheme('night-owl', {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: '', foreground: 'd6deeb', background: '011627' },
    { token: 'comment', foreground: '637777' },
    { token: 'keyword', foreground: 'c792ea' },
    { token: 'string', foreground: 'ecc48d' },
    { token: 'number', foreground: 'f78c6c' },
    { token: 'type', foreground: '82aaff' }
  ],
  colors: {
    'editor.background': '#011627',
    'editor.foreground': '#d6deeb',
    'editorCursor.foreground': '#80a4c2',
    'editor.lineHighlightBackground': '#1d3b53',
    'editorLineNumber.foreground': '#2c3043',
    'editor.selectionBackground': '#1d3b53',
    'editor.inactiveSelectionBackground': '#1d3b53',
    'editorIndentGuide.background': '#2c3043',
    'editorIndentGuide.activeBackground': '#2c3043'
  }
});
export function initEditor(container, initialContent = '', language = 'javascript') {
  editor = monaco.editor.create(container, {
    value: initialContent,
    language,
    theme: 'night-owl',
    fontFamily: 'Fira Mono, monospace',
    fontSize: 15,
    minimap: { enabled: false }
  });
  return editor;
}
export function updateEditorContent(content) {
  if (editor) editor.setValue(content);
}
