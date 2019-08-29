import { logger } from 'nrfconnect/core';
import { toHexString } from './stringUtil';

const NetClient = require('net');
const DgmClient = require('dgram');

// UDP Support
const PORT = 7500;
const HOST = '127.0.0.1';
const dgramcDesc = DgmClient.createSocket('udp4');

export function writedgram(data) {
    dgramcDesc.send(data, 0, data.length, PORT, HOST, (err, bytes) => {
        if (err) {
            console.log(err);
            throw err;
        }
    });
    dgramcDesc.send(data, 0, data.length, PORT + 1, HOST, (err, bytes) => {
        if (err) {
            console.log(err);
            throw err;
        }
    });
}

// TCP Support
let csocketDesc;

export function getConnection() {
    // Connect to Server
    let client = '';
    const recvData = [];

    client = NetClient.connect({ port: 8605, host: 'localhost' }, function onConnect() {
        logger.info('[TCPClient] Socket connect success');
        this.setEncoding('utf8');
        this.setTimeout(300000);

        this.on('close', () => {
            csocketDesc = null;
            logger.info('[TCPClient] Client Socket Closed');
        });

        this.on('data', data => {
            recvData.push(data);
            logger.info(toHexString(data));
        });

        this.on('end', () => {
            logger.info('[TCPClient] On End');
        });

        this.on('error', err => {
            logger.info(JSON.stringify(err));
        });

        this.on('timeout', () => {
            logger.info('[TCPClient] Client Socket Timeout');
        });

        this.on('drain', () => {
            logger.info('[TCPClient] Client Socket Drain');
        });

        this.on('lookup', () => {
            logger.info('[TCPClient] Client Socket Lookup');
        });
    });

    csocketDesc = client;

    return client;
}

export function getCurrSockDesc() {
    return csocketDesc;
}

export function writeData(socket, data) {
    let lsocket;
    if (socket == null) {
        lsocket = csocketDesc;
    } else {
        lsocket = socket;
    }
    const success = !lsocket.write(data);
    if (!success) {
        ((ssocket, dat) => {
            ssocket.once('drain', () => {
                writeData(ssocket, dat);
            });
        })(lsocket, data);
    }
}

export function destroySocket(socket) {
    let lsocket;
    if (socket == null) {
        lsocket = csocketDesc;
    } else {
        lsocket = socket;
    }
    lsocket.destroy();
    logger.info('[TCPClient] Socket Destroy');
    csocketDesc = null;
}
