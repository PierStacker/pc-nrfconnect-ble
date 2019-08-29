const NetServer = require('net');
const DgmServer = require('dgram');

// UDP Support - For Debugging //
const PORT = 7501;
const HOST = '127.0.0.1';
const dgramsDesc = DgmServer.createSocket('udp4');

dgramsDesc.on('listening', () => {
    const addr = dgramsDesc.address();
    console.log(`UDP Server listening port : + ${addr.port}`);
});

dgramsDesc.on('message', (msg, remote) => {
    console.log(`${remote.address} : ${remote.port} - ${msg}`);
});

dgramsDesc.bind(PORT, HOST);

// // TCP Support
// const ssocketDesc = NetServer.createServer((client) => {
//     console.log('Client connection: ');
//     console.log('   local = %s:%s', client.localAddress, client.localPort);
//     console.log('   remote = %s:%s', client.remoteAddress, client.remotePort);

//     client.setTimeout(500);
//     client.setEncoding('utf8');

//     client.on('data', function(data) {
//         console.log('Received data from client on port %d: %s',
//                     client.remotePort, data.toString());
//         writeData(client, 'Sending: ' + data.toString());
//         console.log('  Bytes sent: ' + client.bytesWritten);
//     });

//     client.on('end', function() {
//         console.log('Client disconnected');
//     });

//     client.on('error', function(err) {
//         console.log('Socket Error: ', JSON.stringify(err));
//     });

//     client.on('timeout', function() {
//         console.log('Socket Timed out');
//     });
// });

// server.listen(8606, () => {
//     console.log('Server listening: ' + JSON.stringify(server.address()));
//     server.on('close', function(){
//         console.log('Server Terminated');
//     });
//     server.on('error', function(err){
//         console.log('Server Error: ', JSON.stringify(err));
//     });
// });

// function writeData(socket, data){
//     let success = socket.write(data);
//     if (!success) {
//         console.log("Client Send Fail");
//     }
// }
