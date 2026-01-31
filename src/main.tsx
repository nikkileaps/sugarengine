/**
 * Sugar Engine - Editor Entry Point (React)
 *
 * This loads the editor interface.
 * The game is previewed in a separate window via preview.html
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Editor } from './editor';

const container = document.getElementById('app')!;
const root = createRoot(container);

root.render(
  <StrictMode>
    <Editor />
  </StrictMode>
);
