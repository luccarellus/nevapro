/**
 * Neva Pro - Server Entry Point
 *
 * Este entrypoint é intencionalmente fino: a aplicação (dev server com Vite +
 * proxy /api para o Laravel) fica em server/index.ts.
 *
 * @see server/index.ts for the full application setup
 */

import { app, startServer } from './server/index';

// Start the server when this file is run directly
startServer();

export { app };
