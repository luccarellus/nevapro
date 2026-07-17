// For Vercel serverless deployment
// The app is now exported from the server module
export { app } from '../server/index';

export const config = {
  api: {
    bodyParser: false,
  },
};
