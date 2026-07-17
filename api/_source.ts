// For Vercel serverless deployment
// This is the entry point for esbuild bundling.
// The bundled output goes to api/index.js which Vercel uses directly.
export { app } from '../server/index';

export const config = {
  api: {
    bodyParser: false,
  },
};
