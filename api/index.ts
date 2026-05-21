import serverModule from '../dist/server.cjs';

export const config = {
  api: {
    bodyParser: false,
  },
};

export default serverModule.app;
