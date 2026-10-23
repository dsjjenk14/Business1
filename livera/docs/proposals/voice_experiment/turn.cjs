// Pure-JS TURN server standing in for coturn (coturn itself is not installable here).
const Turn = require('node-turn');
const server = new Turn({ authMech: 'long-term', credentials: { u: 'p' }, listeningIps: ['127.0.0.1'], relayIps: ['127.0.0.1'], listeningPort: 3478, minPort: 50000, maxPort: 50100, debugLevel: 'ERROR' });
server.start();
console.log('turn on 3478');
