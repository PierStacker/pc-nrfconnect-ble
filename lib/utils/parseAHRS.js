import { logger } from 'nrfconnect/core';
import { toHexString } from './stringUtil';

import * as tcpClient from './tcpClient';

const AHRS = require('ahrs');

const PierAlmar = 'FF94';
const PierAlpha = 'FFE0';
const PierAlphaHotfix = 'FF40';
const CAUInsole = 'FF98';

const devInfo = {
    addr: [
        'E5:23:A1:BD:FB:CD',
        'E3:29:24:12:22:53',
        'DC:11:4E:E6:67:AF',
        'F6:95:1E:C9:EB:F4',
        'D3:15:BF:AC:F8:10',
        'DF:58:85:9F:07:86',
        'C0:7E:62:17:71:DE'],
    type: [
        'ALPHA',
        'ALMAR',
        'ALCAU.INSOLE',
        'ALCAU.INSOLE',
        'ALCAU.HARVES',
        'ALCAU.HARVES',
        'ALCAU.MATT'],
};
// const ALMMAP =
// [
// 27, 19, 11, 3,
// 28, 20, 12, 4,
// 29, 21, 13, 5,
// 0, 8, 16 , 24,
// 1, 9, 17, 25,
// 2, 10, 18, 26];
const ALMMAP4 = [
    108, 76, 44, 12,
    112, 80, 48, 16,
    116, 84, 52, 20,
    0, 32, 64, 96,
    4, 36, 68, 100,
    8, 40, 72, 104];

const madgwick = new AHRS({
    /*
        * The sample interval, in Hz.
        *
        * Default: 100
        */
    sampleInterval: 100,

    /*
        * Choose from the `Madgwick` or `Mahony` filter.
        *
        * Default: 'Madgwick'
        */
    algorithm: 'Mahony',

    /*
    * The filter noise value, smaller values have
    * smoother estimates, but have higher latency.
    * This only works for the `Madgwick` filter.
    *
    * Default: 0.4
    */
    beta: 0.4,

    /*
    * The filter noise values for the `Mahony` filter.
    */
    kp: 0.5, // Default: 0.5
    ki: 0, // Default: 0.0

    /*
    * When the AHRS algorithm runs for the first time and this value is
    * set to true, then a brute force initialisation is done.  This means
    * that the AHRS is run 10 times with the initial value to force a stable
    * outcome.
    *
    * Note: this feature is 'beta'.  Use it with caution and only after the rest
    * of your code is running fine.
    *
    * Default: false
    */
    doInitialisation: false,
});

function parsePierAlmar(bloc) {
    const size = [4];
    // const numChunks = Math.ceil(bloc.length / size[0]);
    const numChunks = [24];
    const chunks = new Array(numChunks[0]);
    for (let i = 0, o = 0; i < numChunks; i += 1, o += size[0]) {
        chunks[i] = Buffer.from(bloc.substr(ALMMAP4[i], 4), 'hex').readInt16LE(0);
    }
    return chunks;
}

function parsePierAlpha(bloc) {
    // in16(94) = (adc(60) + dummy(24)) + fin(8) + resol(2)
    // float(6) = accbia(3) + gyrbia(3)
    // Size means [ sizeof(int16)*2 , sizeof(float)*2 ]
    const size = [4, 8];
    // [abias & gbias, adc(with dummy) & fin, adc, dummy]
    const numChunks = [6, 92, 60, 24];
    const st = [0, 84, 92, 0];
    const ed = [60, 92, 94, 6];
    // Information
    let o = 368; // 92 * 4
    const reschunks = [
        Buffer.from(bloc.substr(o, 4), 'hex').readInt16LE(0) / 32768.0,
        Buffer.from(bloc.substr(o += 4, 4), 'hex').readInt16LE(0) / 32768.0,
    ];
    o += 4; // 94 * 4
    let chunks = new Array(numChunks[0]);
    for (let i = 0; i < numChunks[0]; i += 1, o += size[1]) {
        chunks[i] = Buffer.from(bloc.substr(o, 8), 'hex').readFloatLE(0);
    }
    const bichunks = chunks.slice(st[3], ed[3]);

    chunks = new Array(numChunks[1]);
    o = 0;
    for (let i = 0; i < numChunks[1]; i += 1, o += size[0]) {
        chunks[i] = Buffer.from(bloc.substr(o, 4), 'hex').readInt16LE(0);
        if (i < numChunks[2]) {
            const bias = i % 6;
            const reso = Math.floor(bias / 3);
            // console.log(reso, bias);
            chunks[i] = chunks[i] * reschunks[reso] - bichunks[bias];
            if (reso === 1) {
                // Gyro deg to rad
                chunks[i] *= Math.PI / 180;
            }
        }
    }
    const imuchunks = chunks.slice(st[0], ed[0]);
    const finchunks = chunks.slice(st[1], ed[1]);

    return [imuchunks, finchunks, reschunks, bichunks];
}

function parsePierAlphaHotfix(bloc) {
    // int16(94) = (adc(1) + dummy(0)) + fin(20) + resol(1)
    // float(6) = accbia(1) + gyrbia(1)
    // Size means [ sizeof(int16)*2 , sizeof(float)*2 ]
    const size = [4, 8];
    // [abias & gbias, adc(with dummy) & fin, adc, dummy]
    const numChunks = [2, 21, 1, 0];
    const st = [0, 1, 23, 0];
    const ed = [1, 22, 94, 6];
    // Information
    let o = 84; // 21 * 4
    const reschunks = [];
    // const reschunks = [
    //     Buffer.from(bloc.substr(o, 4), 'hex').readInt16LE(0) / 32768.0,
    //     Buffer.from(bloc.substr(o += 4, 4), 'hex').readInt16LE(0) / 32768.0,
    // ];
    const bichunks = [];
    // o += 4; // 94 * 4
    // let chunks = new Array(numChunks[0]);
    // for (let i = 0; i < numChunks[0]; i += 1, o += size[1]) {
    //     chunks[i] = Buffer.from(bloc.substr(o, 8), 'hex').readFloatLE(0);
    // }
    // const bichunks = chunks.slice(st[3], ed[3]);
    const chunks = new Array(numChunks[1]);
    o = 0;
    for (let i = 0; i < numChunks[1]; i += 1, o += size[0]) {
        chunks[i] = Buffer.from(bloc.substr(o, 4), 'hex').readInt16LE(0);
        if (i < numChunks[2]) {
            const bias = i % 6;
            const reso = Math.floor(bias / 3);
            // console.log(reso, bias);
            chunks[i] = chunks[i] * reschunks[reso] - bichunks[bias];
            if (reso === 1) {
                // Gyro deg to rad
                chunks[i] *= Math.PI / 180;
            }
        }
    }
    const imuchunks = chunks.slice(st[0], ed[0]);
    const finchunks = chunks.slice(st[1], ed[1]);

    return [imuchunks, finchunks, reschunks, bichunks];
}

function parseCAUInsole(bloc) {
    // in16(82) = adc(48) + fin(8) + resol(2)
    // float(6) = accbia(3) + gyrbia(3)
    const size = [4, 8];
    const numChunks = [6, 56, 48, 8];
    const st = [0, 48, 56, 0];
    const ed = [48, 56, 58, 6];
    // Information
    let o = 224; // 56 * 4
    const reschunks = [
        Buffer.from(bloc.substr(o, 4), 'hex').readInt16LE(0) / 32768.0,
        Buffer.from(bloc.substr(o += 4, 4), 'hex').readInt16LE(0) / 32768.0,
    ];
    o += 4;
    let chunks = new Array(numChunks[0]);
    for (let i = 0; i < numChunks[0]; i += 1, o += size[1]) {
        chunks[i] = Buffer.from(bloc.substr(o, 8), 'hex').readFloatLE(0);
    }
    const bichunks = chunks.slice(st[3], ed[3]);

    chunks = new Array(numChunks[1]);
    o = 0;
    for (let i = 0; i < numChunks[1]; i += 1, o += size[0]) {
        chunks[i] = Buffer.from(bloc.substr(o, 4), 'hex').readInt16LE(0);
        if (i < numChunks[2]) {
            const bias = i % 6;
            const reso = Math.floor(bias / 3);
            // console.log(reso, bias);
            chunks[i] = chunks[i] * reschunks[reso] - bichunks[bias];
            if (reso === 1) {
                // Gyro deg to rad
                chunks[i] *= Math.PI / 180;
            }
        }
    }
    const imuchunks = chunks.slice(st[0], ed[0]);
    const finchunks = chunks.slice(st[1], ed[1]);

    return [imuchunks, finchunks, reschunks, bichunks];
}

export function parseHexString(istr, address) {
    const head = istr.substr(0, 4);
    const eol = istr.length - 1;
    let message = '';
    let dbase = -1;
    let dleng = -1;
    let dbloc = [];
    let seqnu = -1;
    let devname = '';
    const idx = devInfo.addr.indexOf(address);
    if (idx !== -1) {
        devname = devInfo.type[idx];
    } else {
        devname = 'PierTag';
    }
    switch (head) {
        case PierAlmar:
            // console.log('PierAlmar');
            dbase = 4;
            dleng = 288;
            seqnu = parseInt(istr.substr(eol - 4, 2), 16);
            dbloc = parsePierAlmar(istr.substr(dbase, dleng));
            message = {
                // type: 'PierAlmar',
                type: devname,
                timestamp: new Date().getTime(),
                sensorgrid: dbloc,
            };
            tcpClient.writedgram(JSON.stringify(message));
            break;
        case PierAlphaHotfix:
            dbase = 8;
            // 128 - 8 - 16
            dleng = 104;
            seqnu = parseInt(istr.substr(eol - 16 + 1, 8), 16);
            dbloc = parsePierAlphaHotfix(istr.substr(dbase, dleng));
            message = {
                // type: 'PierAlphaHotfix',
                type: devname,
                timestamp: new Date().getTime(),
                finger: dbloc[1],
            };
            tcpClient.writedgram(JSON.stringify(message));
            break;
        case CAUInsole:
            dbase = 8;
            // 304 - 8 - 16
            dleng = 280;
            seqnu = parseInt(istr.substr(eol - 16 + 1, 8), 16);
            dbloc = parseCAUInsole(istr.substr(dbase, dleng));
            for (let i = 0; i < 8; i += 1) {
                madgwick.update(
                    dbloc[0][i * 6],
                    dbloc[0][i * 6 + 1],
                    dbloc[0][i * 6 + 2],
                    dbloc[0][i * 6 + 3],
                    dbloc[0][i * 6 + 4],
                    dbloc[0][i * 6 + 5],
                );
                // console.log(madgwick.getQuaternion());
                // console.log(dbloc[0].slice(i * 6, i * 6 + 6));
            }
            message = {
                // type: 'CAUInsole',
                type: devname,
                timestamp: new Date().getTime(),
                finger: dbloc[1].slice(0, 4),
            };
            tcpClient.writedgram(JSON.stringify(message));
            break;
        case PierAlpha:
            // console.log('PierAlpha');
            dbase = 8;
            // 448 - 8 - 16
            dleng = 424;
            seqnu = parseInt(istr.substr(eol - 16 + 1, 8), 16);
            dbloc = parsePierAlpha(istr.substr(dbase, dleng));
            // Original
            // for (let i = 0; i < 14; i += 1) {
            // Reduced
            for (let i = 0; i < 10; i += 1) {
                madgwick.update(
                    dbloc[0][i * 6],
                    dbloc[0][i * 6 + 1],
                    dbloc[0][i * 6 + 2],
                    dbloc[0][i * 6 + 3],
                    dbloc[0][i * 6 + 4],
                    dbloc[0][i * 6 + 5],
                );
                // console.log(madgwick.getQuaternion());
                // console.log(dbloc[0].slice(i * 6, i * 6 + 6));
            }
            message = {
                // type: 'PierAlpha',
                type: devname,
                timestamp: new Date().getTime(),
                quatervec: madgwick.toVector(),
                finger: dbloc[1].slice(0, 4),
            };
            tcpClient.writedgram(JSON.stringify(message));
            // console.log(madgwick.toVector());
            // console.log(madgwick.getQuaternion());
            // console.log(madgwick.getEulerAngles());
            // [imu, finger, resol, abias, gbias]
            // console.log(dbloc[3]);
            // console.log(dbloc[4]);
            break;
        default:
            console.log('Unknown');
    }
    return head;
}

export function doAHRS(dblock) {
    return dblock;
}
