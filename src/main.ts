/**
 * Sugar Engine - Editor Entry Point
 *
 * This loads the editor interface.
 * The game is previewed in a separate window via preview.html
 */

import { EditorApp } from './editor';

function main() {
  const container = document.getElementById('app')!;
  new EditorApp(container);
}

main();
