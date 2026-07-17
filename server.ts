/**
 * Neva Pro - Server Entry Point
 * 
 * This file is intentionally slim. All middleware and route logic
 * has been extracted to the server/ directory for maintainability.
 * 
 * @see server/index.ts for the full application setup
 */

import { app, startServer } from './server/index';

// Start the server when this file is run directly
startServer();

// Re-export for Vercel serverless deployment (api/index.ts imports this)
export { app };
