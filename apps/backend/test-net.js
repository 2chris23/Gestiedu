const net = require('net');

const client = new net.Socket();
const port = 5433;
const host = '127.0.0.1';

console.log(`Connecting to ${host}:${port}...`);

client.connect(port, host, function () {
    console.log('Connected successfully!');
    client.destroy();
});

client.on('error', function (err) {
    console.error('Connection failed:', err.message);
    client.destroy();
});

client.on('close', function () {
    console.log('Connection closed');
});
