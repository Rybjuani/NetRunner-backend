// Prueba de concepto: crear, instalar y ejecutar index.js
import { writeFile } from './filesystem-simple.js';
import { runCommand } from './executor.js';

async function prueba() {
  await writeFile('index.js', "console.log('Hello NetRunner!')\n");
  await runCommand('npm', ['install']);
  await runCommand('node', ['index.js']);
}
window.runTestScript = prueba;
