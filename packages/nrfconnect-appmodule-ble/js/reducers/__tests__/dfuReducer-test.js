/* Copyright (c) 2016, Nordic Semiconductor ASA
 *
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without modification,
 * are permitted provided that the following conditions are met:
 *
 *   1. Redistributions of source code must retain the above copyright notice, this
 *   list of conditions and the following disclaimer.
 *
 *   2. Redistributions in binary form, except as embedded into a Nordic
 *   Semiconductor ASA integrated circuit in a product or a software update for
 *   such product, must reproduce the above copyright notice, this list of
 *   conditions and the following disclaimer in the documentation and/or other
 *   materials provided with the distribution.
 *
 *   3. Neither the name of Nordic Semiconductor ASA nor the names of its
 *   contributors may be used to endorse or promote products derived from this
 *   software without specific prior written permission.
 *
 *   4. This software, with or without modification, must only be used with a
 *   Nordic Semiconductor ASA integrated circuit.
 *
 *   5. Any software provided in binary form under this license must not be
 *   reverse engineered, decompiled, modified and/or disassembled.
 *
 *
 * THIS SOFTWARE IS PROVIDED BY NORDIC SEMICONDUCTOR ASA "AS IS" AND ANY EXPRESS OR
 * IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF
 * MERCHANTABILITY, NONINFRINGEMENT, AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL NORDIC SEMICONDUCTOR ASA OR CONTRIBUTORS BE
 * LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
 * CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE
 * GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION)
 * HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT
 * LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT
 * OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

// Have to mock this module, because it uses electron and sqlite3, which
// are not available when running tests
jest.mock('../../logging/index', () => {});

// Have to mock these modules, because they depend on various resources
// (sqlite3, electron, native modules, etc.) that are not available during
// testing. These modules are not imported by dfuReducer.js directly, but
// they are imported by adapterActions.js, which dfuReducer.js depends on.
jest.mock('../../utils/fileUtil', () => {});
jest.mock('../../utils/uuid_definitions', () => {});
jest.mock('../../actions/firmwareUpdateActions', () => {});
jest.mock('pc-nrfjprog-js', () => {});
jest.mock('pc-ble-driver-js', () => {
	return { api: { AdapterFactory: { getInstance: () => {} } } };
});
jest.mock('serialport', () => {});


import reducer from '../dfuReducer';
import * as DfuActions from '../../actions/dfuActions';

const initialState = reducer(undefined, {});
const adapter = {};
const device = {};

describe('when showing dfu dialog', () => {

    const state = reducer(initialState, {
        type: DfuActions.SHOW_DIALOG,
        adapter,
        device,
    });

    it('shows dialog', () => {
        expect(state.isDfuDialogVisible).toBe(true);
    });

    it('creates dfu instance', () => {
        expect(state.api.dfu).toBeDefined();
    });

    it('sets device', () => {
        expect(state.device).toBe(device);
    });
});

describe('when file path received', () => {

    const filePath = '/path/to/file';
    const state = reducer(initialState, DfuActions.setDfuFilePath(filePath));

    it('sets file path', () => {
        expect(state.filePath).toBe(filePath);
    });
});

describe('when package info loaded', () => {

    const packageInfo = {};
    const state = reducer(initialState, {
        type: DfuActions.LOAD_PACKAGE_INFO_SUCCESS,
        packageInfo: packageInfo,
    });

    it('sets package info', () => {
        expect(state.packageInfo).toBe(packageInfo);
    });
});

describe('when starting', () => {

    const state = reducer(initialState, {
        type: DfuActions.PERFORM,
    });

    it('sets started to true', () => {
        expect(state.isStarted).toBe(true);
    });
});

describe('when closing DFU dialog', () => {

    const state = reducer(initialState, DfuActions.showConfirmCloseDialog());

    it('shows confirm close dialog', () => {
        expect(state.isConfirmCloseVisible).toBe(true);
    });
});

describe('when hiding confirm-close dialog', () => {

    const stateBefore = initialState.set('isConfirmCloseVisible', true);
    const state = reducer(stateBefore, DfuActions.hideConfirmCloseDialog());

    it('sets confirm-close visible state to false', () => {
        expect(state.isConfirmCloseVisible).toBe(false);
    });
});

describe('when progress update received', () => {

    describe('when DFU is not running', () => {

        const stateBefore = initialState.set('isStarted', false);
        const state = reducer(stateBefore, {
            type: DfuActions.UPDATE_PROGRESS,
        });

        // Progress updates are throttled, so a trailing progress update can be
        // received after DFU has completed. In that case, we ignore it.

        it('should not change state', () => {
            expect(state).toBe(stateBefore);
        });
    });

    describe('when there is no file being transferred', () => {

        const stateBefore = initialState
            .set('fileNameBeingTransferred', initialState.fileNameBeingTransferred);
        const state = reducer(stateBefore, {
            type: DfuActions.UPDATE_PROGRESS,
        });

        // Progress updates are throttled, so a trailing progress update can be
        // received after a file has completed. In that case, we ignore it.

        it('should not change state', () => {
            expect(state).toBe(stateBefore);
        });
    });

    describe('when DFU is running and a file is being transferred', () => {

        const stateIsStartedWithFile = initialState
            .set('isStarted', true)
            .set('fileNameBeingTransferred', 'myFile.bin');
        const state = reducer(stateIsStartedWithFile, {
            type: DfuActions.UPDATE_PROGRESS,
        });

        it('sets transferring status', () => {
            expect(state.status).toEqual('Transferring');
        });

        describe('when percent completed is not provided', () => {
            const state = reducer(stateIsStartedWithFile, {
                type: DfuActions.UPDATE_PROGRESS,
            });

            it('does not change percent completed', () => {
                expect(state.percentCompleted).toBe(initialState.percentCompleted);
            });

            it('does not change throughput', () => {
                expect(state.throughput).toBe(initialState.throughput);
            });
        });

        describe('when percent completed is provided', () => {

            const percentCompleted = 0.1;
            const state = reducer(stateIsStartedWithFile, {
                type: DfuActions.UPDATE_PROGRESS,
                percentCompleted,
            });

            it('sets percent completed', () => {
                expect(state.percentCompleted).toEqual(percentCompleted);
            });
        });

        describe('when completed bytes is provided', () => {

            const bytesPerSecond = 100;
            const averageBytesPerSecond = 50;
            const totalBytes = 2000;
            const completedBytes = 500;
            const state = reducer(stateIsStartedWithFile, {
                type: DfuActions.UPDATE_PROGRESS,
                bytesPerSecond,
                averageBytesPerSecond,
                totalBytes,
                completedBytes,
            });

            it('sets total kB size', () => {
                const expectedTotalSizeKb = totalBytes / 1024;
                expect(state.throughput.totalSizeKb).toEqual(expectedTotalSizeKb);
            });

            it('adds point to kB/s array', () => {
                const expectedPoint = {
                    x: completedBytes / 1024,
                    y: bytesPerSecond / 1024,
                };
                expect(state.throughput.kbpsPoints[0]).toEqual(expectedPoint);
            });

            it('adds point to average kB/s array', () => {
                const expectedPoint = {
                    x: completedBytes / 1024,
                    y: averageBytesPerSecond / 1024,
                };
                expect(state.throughput.averageKbpsPoints[0]).toEqual(expectedPoint);
            });
        });
    });
});

describe('when file transfer started', () => {

    const fileName = 'myfile.dat';

    const stateBefore = initialState
        .set('throughput', {})
        .set('percentCompleted', 1);
    const state = reducer(stateBefore, {
        type: DfuActions.TRANSFER_FILE_STARTED,
        fileName,
    });

    it('sets that the file is being transferred', () => {
        expect(state.fileNameBeingTransferred).toEqual(fileName);
    });

    it('clears percent completed', () => {
        expect(state.percentCompleted).toEqual(initialState.percentCompleted);
    });

    it('clears throughput data', () => {
        expect(state.throughput).toEqual(initialState.throughput);
    });

    it('sets status to Initializing', () => {
        expect(state.status).toEqual('Initializing');
    });
});

describe('when file transfer completed', () => {

    const stateBefore = initialState
        .set('fileNameBeingTransferred', 'myfile.dat')
        .set('throughput', {});
    const state = reducer(stateBefore, {
        type: DfuActions.TRANSFER_FILE_COMPLETED,
    });

    it('clears file name', () => {
        expect(state.fileNameBeingTransferred).toEqual(initialState.fileNameBeingTransferred);
    });

    it('clears throughput data', () => {
        expect(state.throughput).toEqual(initialState.throughput);
    });

    // When a firmware file is completed, the device is disconnected, and
    // the DFU module waits for a few seconds before continuing. Updating
    // status to inform the user that we are waiting.

    it('sets status to \'File completed, waiting for device\'', () => {
        expect(state.status).toEqual('File completed, waiting for device');
    });
});

describe('when entire DFU complete', () => {

    const state = reducer(initialState, {
        type: DfuActions.PERFORM_SUCCESS,
    });

    it('sets completed to true', () => {
        expect(state.isCompleted).toEqual(true);
    });

    it('sets started to false', () => {
        expect(state.isStarted).toEqual(false);
    });
});

describe('when aborting', () => {

    const stateBefore = initialState.set('isStopping', false);
    const state = reducer(stateBefore, {
        type: DfuActions.ABORT,
    });

    it('sets stopping to true', () => {
        expect(state.isStopping).toBe(true);
    });
});

describe('when abort successful', () => {

    const stateBefore = initialState
        .set('isStopping', true)
        .set('isStarted', true)
        .set('fileNameBeingTransferred', 'myfile.dat');
    const state = reducer(stateBefore, {
        type: DfuActions.ABORT_SUCCESS,
    });

    it('sets stopping to false', () => {
        expect(state.isStopping).toBe(false);
    });

    it('sets started to false', () => {
        expect(state.isStarted).toBe(false);
    });

    it('sets the file name being transferred to empty', () => {
        expect(state.fileNameBeingTransferred).toBe('');
    });
});

describe('when hiding dialog', () => {

    const stateBefore = initialState
        .set('isDfuDialogVisible', true)
        .set('device', {});
    const state = reducer(stateBefore, { type: DfuActions.HIDE_DIALOG });

    it('clears state', () => {
        expect(state).toBe(initialState);
    });
});