// Vercel compiles this tracked TypeScript function to native ESM. The explicit
// runtime extension is required by Node when it loads the emitted module.
export { app } from '../server/index.js';

export const config = {
  api: {
    bodyParser: false,
  },
};
