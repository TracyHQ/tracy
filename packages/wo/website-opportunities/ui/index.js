// The browser UI's static files, served as they are (no build step). A server serves this folder at `/`.
import { fileURLToPath } from 'node:url'

/** Absolute path of the folder to serve: index.html, app.js and the modules and stylesheet it loads. */
export const uiDir = fileURLToPath(new URL('./public/', import.meta.url))
