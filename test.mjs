import serverModule from './dist/server.cjs';
console.log(serverModule.app !== undefined ? 'app exists' : 'app missing');
