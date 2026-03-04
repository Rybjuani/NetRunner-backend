import { Terminal } from 'xterm';
import 'xterm/css/xterm.css';
let term = null;
export function initTerminal(container) {
  term = new Terminal({
    theme: {
      background: '#18181b',
      foreground: '#e5e7eb',
      cursor: '#38bdf8',
      selection: '#334155'
    },
    fontFamily: 'Fira Mono, monospace',
    fontSize: 14,
    rows: 18
  });
  term.open(container);
  return term;
}
export function writeToTerminal(data) {
  if (term) term.write(data);
}
