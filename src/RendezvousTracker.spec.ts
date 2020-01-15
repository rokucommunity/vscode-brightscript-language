/* tslint:disable:no-unused-expression */
/* tslint:disable:no-var-requires */
import * as sinon from 'sinon';
let Module = require('module');
import { assert, expect } from 'chai';

import { vscode } from './mockVscode.spec';

//override the "require" call to mock certain items
const { require: oldRequire } = Module.prototype;

Module.prototype.require = function hijacked(file) {
    if (file === 'vscode') {
        return vscode;
    } else {
        return oldRequire.apply(this, arguments);
    }
};

import { RendezvousHistory, RendezvousTracker } from './RendezvousTracker';

describe('BrightScriptFileUtils ', () => {
    let rendezvousTracker: RendezvousTracker;
    let rendezvousTrackerMock;
    let logString: string;
    let expectedHistory: RendezvousHistory;

    beforeEach(() => {
        rendezvousTracker = new RendezvousTracker();
        rendezvousTracker.registerSourceLocator(async (debuggerPath: string, lineNumber: number) => {
            //remove preceding pkg:
            if (debuggerPath.toLowerCase().indexOf('pkg:') === 0) {
                debuggerPath = debuggerPath.substring(4);
            }

            if (debuggerPath === 'NetworkService2.brs') {
                // test checking for xml file if brs was not found
                debuggerPath = '';
            }
            return {
                filePath: debuggerPath,
                lineNumber: lineNumber,
                columnIndex: 0
            };
        });
        rendezvousTrackerMock = sinon.mock(rendezvousTracker);

        // regex and examples also available at: https://regex101.com/r/In0t7d/6
        logString = `channel: Start
            06-18 19:06:19.810 [sg.node.BLOCK] Rendezvous[3168] at pkg:/components/Modules/Analytics/Video/VideoTracking/Tasks/VHLVideoTrackingTask.brs(126)
            06-18 19:06:19.822 [sg.node.UNBLOCK] Rendezvous[3168] completed in 0.008 s
            06-18 19:06:20.179 [sg.node.BLOCK] Rendezvous[3169] at pkg:/components/Tasks/UriFetcher/UriFetcher.brs(57)
            06-18 19:06:20.189 [sg.node.UNBLOCK] Rendezvous[3169] completed in 0.008 s
            06-18 19:06:20.197 [sg.node.BLOCK] Rendezvous[3170] at pkg:/components/Tasks/UriFetcher/UriFetcher.brs(168)
            06-18 19:06:20.206 [sg.node.UNBLOCK] Rendezvous[3170] completed in 0.008 s
            06-19 15:16:05.629 [sg.node.BLOCK] Rendezvous[25522] at roku_analytics:/components/AnalyticsUtils.brs(221)
            06-18 19:06:20.206 [sg.node.UNBLOCK] Rendezvous[25522] completed in 0.008 s
            06-19 15:16:05.649 [sg.node.BLOCK] Rendezvous[25539] at roku_analytics:/components/AnalyticsUtils.brs(221)
            06-18 19:06:20.206 [sg.node.UNBLOCK] Rendezvous[25539] completed in 0.008 s
            Starting data processing
            06-19 16:48:10.772 [sg.node.BLOCK] Rendezvous[44468] at UriFetcher.dataProcessing.brs(109)
            06-18 19:06:20.206 [sg.node.UNBLOCK] Rendezvous[44468] completed in 0.008 s
            06-19 16:48:10.752 [sg.node.BLOCK] Rendezvous[44467] at UriFetcher.dataProcessing.brs(83)
            06-18 19:06:20.206 [sg.node.UNBLOCK] Rendezvous[44467] completed in 0.008 s
            06-19 16:48:10.792 [sg.node.BLOCK] Rendezvous[44469] at UriFetcher.dataProcessing.brs(83)
            06-18 19:06:20.206 [sg.node.UNBLOCK] Rendezvous[44469] completed in 0.008 s
            Data processing completed
            07-04 19:02:30.079 [sg.node.BLOCK  ] Rendezvous[27] at NetworkService.addRequestToQueue(69)
            07-04 19:02:30.117 [sg.node.BLOCK  ] Rendezvous[28] at NetworkService.processRequestFromQueue(87)
            06-18 19:06:20.206 [sg.node.UNBLOCK] Rendezvous[28] completed in 0.008 s
            06-18 19:06:20.206 [sg.node.UNBLOCK] Rendezvous[27] completed in 0.008 s
            07-04 19:02:30.121 [sg.node.BLOCK  ] Rendezvous[29] at NetworkService.processRequestFromQueue(104)
            06-18 19:06:20.206 [sg.node.UNBLOCK] Rendezvous[29] completed in 0.008 s
            07-04 19:02:30.129 [sg.node.BLOCK  ] Rendezvous[30] at NetworkService.processRequestFromQueue(128)
            06-18 19:06:20.206 [sg.node.UNBLOCK] Rendezvous[30] completed in 0.008 s
            07-04 19:02:30.129 [sg.node.BLOCK  ] Rendezvous[31] at NetworkService.processRequestFromQueue(129)
            06-19 21:13:28.414 [sg.node.UNBLOCK] Rendezvous[31] completed
            07-04 19:02:30.079 [sg.node.BLOCK  ] Rendezvous[27] at NetworkService2.addRequestToQueue(69)
            07-04 19:02:30.117 [sg.node.BLOCK  ] Rendezvous[28] at NetworkService2.processRequestFromQueue(87)
            06-18 19:06:20.206 [sg.node.UNBLOCK] Rendezvous[28] completed in 0.008 s
            06-18 19:06:20.206 [sg.node.UNBLOCK] Rendezvous[27] completed in 0.008 s
            07-04 19:02:30.121 [sg.node.BLOCK  ] Rendezvous[29] at NetworkService2.processRequestFromQueue(104)
            06-18 19:06:20.206 [sg.node.UNBLOCK] Rendezvous[29] completed in 0.008 s
            07-04 19:02:30.129 [sg.node.BLOCK  ] Rendezvous[30] at NetworkService2.processRequestFromQueue(128)
            06-18 19:06:20.206 [sg.node.UNBLOCK] Rendezvous[30] completed in 0.008 s
            07-04 19:02:30.129 [sg.node.BLOCK  ] Rendezvous[31] at NetworkService2.processRequestFromQueue(129)
            06-19 21:13:28.414 [sg.node.UNBLOCK] Rendezvous[31] completed
            07-04 13:23:15.284 [sg.node.BLOCK] Rendezvous[31233] at pkg:/components/Tasks/TrackerTask/TrackerTask.xml(621)
            06-18 19:06:20.206 [sg.node.UNBLOCK] Rendezvous[31233] completed in 0.008 s
        `.replace(/    /g, '');

        expectedHistory = {
            hitCount: 19,
            occurrences: {
                'pkg:/components/Modules/Analytics/Video/VideoTracking/Tasks/VHLVideoTrackingTask.brs': {
                    occurrences: {
                        126: {
                            clientLineNumber: 126,
                            clientPath: '/components/Modules/Analytics/Video/VideoTracking/Tasks/VHLVideoTrackingTask.brs',
                            hitCount: 1,
                            totalTime: 0.008,
                            type: 'lineInfo'
                        }
                    },
                    hitCount: 1,
                    totalTime: 0.008,
                    type: 'fileInfo',
                    zeroCostHitCount: 0
                },
                'pkg:/components/Tasks/UriFetcher/UriFetcher.brs': {
                    occurrences: {
                        57: {
                            clientLineNumber: 57,
                            clientPath: '/components/Tasks/UriFetcher/UriFetcher.brs',
                            hitCount: 1,
                            totalTime: 0.008,
                            type: 'lineInfo'
                        },
                        168: {
                            clientLineNumber: 168,
                            clientPath: '/components/Tasks/UriFetcher/UriFetcher.brs',
                            hitCount: 1,
                            totalTime: 0.008,
                            type: 'lineInfo'
                        }
                    },
                    hitCount: 2,
                    totalTime: 0.016,
                    type: 'fileInfo',
                    zeroCostHitCount: 0
                },
                'roku_analytics:/components/AnalyticsUtils.brs': {
                    occurrences: {
                        221: {
                            clientLineNumber: 221,
                            clientPath: 'roku_analytics:/components/AnalyticsUtils.brs',
                            hitCount: 2,
                            totalTime: 0.016,
                            type: 'lineInfo'
                        }
                    },
                    hitCount: 2,
                    totalTime: 0.016,
                    type: 'fileInfo',
                    zeroCostHitCount: 0
                },
                'UriFetcher.dataProcessing.brs': {
                    occurrences: {
                        83: {
                            clientLineNumber: 83,
                            clientPath: 'UriFetcher.dataProcessing.brs',
                            hitCount: 2,
                            totalTime: 0.016,
                            type: 'lineInfo'
                        },
                        109: {
                            clientLineNumber: 109,
                            clientPath: 'UriFetcher.dataProcessing.brs',
                            hitCount: 1,
                            totalTime: 0.008,
                            type: 'lineInfo'
                        }
                    },
                    hitCount: 3,
                    totalTime: 0.024,
                    type: 'fileInfo',
                    zeroCostHitCount: 0
                },
                'NetworkService.brs': {
                    occurrences: {
                        69: {
                            clientLineNumber: 69,
                            clientPath: 'NetworkService.brs',
                            hitCount: 1,
                            totalTime: 0.008,
                            type: 'lineInfo'
                        },
                        87: {
                            clientLineNumber: 87,
                            clientPath: 'NetworkService.brs',
                            hitCount: 1,
                            totalTime: 0.008,
                            type: 'lineInfo'
                        },
                        104: {
                            clientLineNumber: 104,
                            clientPath: 'NetworkService.brs',
                            hitCount: 1,
                            totalTime: 0.008,
                            type: 'lineInfo'
                        },
                        128: {
                            clientLineNumber: 128,
                            clientPath: 'NetworkService.brs',
                            hitCount: 1,
                            totalTime: 0.008,
                            type: 'lineInfo'
                        },
                        129: {
                            clientLineNumber: 129,
                            clientPath: 'NetworkService.brs',
                            hitCount: 1,
                            totalTime: 0,
                            type: 'lineInfo'
                        }
                    },
                    hitCount: 5,
                    totalTime: 0.032,
                    type: 'fileInfo',
                    zeroCostHitCount: 1
                },
                'NetworkService2.xml': {
                    occurrences: {
                        69: {
                            clientLineNumber: 69,
                            clientPath: 'NetworkService2.xml',
                            hitCount: 1,
                            totalTime: 0.008,
                            type: 'lineInfo'
                        },
                        87: {
                            clientLineNumber: 87,
                            clientPath: 'NetworkService2.xml',
                            hitCount: 1,
                            totalTime: 0.008,
                            type: 'lineInfo'
                        },
                        104: {
                            clientLineNumber: 104,
                            clientPath: 'NetworkService2.xml',
                            hitCount: 1,
                            totalTime: 0.008,
                            type: 'lineInfo'
                        },
                        128: {
                            clientLineNumber: 128,
                            clientPath: 'NetworkService2.xml',
                            hitCount: 1,
                            totalTime: 0.008,
                            type: 'lineInfo'
                        },
                        129: {
                            clientLineNumber: 129,
                            clientPath: 'NetworkService2.xml',
                            hitCount: 1,
                            totalTime: 0,
                            type: 'lineInfo'
                        }
                    },
                    hitCount: 5,
                    totalTime: 0.032,
                    type: 'fileInfo',
                    zeroCostHitCount: 1
                },
                'pkg:/components/Tasks/TrackerTask/TrackerTask.xml': {
                    occurrences: {
                        621: {
                            clientLineNumber: 621,
                            clientPath: '/components/Tasks/TrackerTask/TrackerTask.xml',
                            hitCount: 1,
                            totalTime: 0.008,
                            type: 'lineInfo'
                        }
                    },
                    hitCount: 1,
                    totalTime: 0.008,
                    type: 'fileInfo',
                    zeroCostHitCount: 0
                }
            },
            totalTime: 0.13600000000000007,
            type: 'historyInfo',
            zeroCostHitCount: 2
        };

    });

    afterEach(() => {
        rendezvousTrackerMock.restore();
    });

    describe('processLogLine ', () => {
        it('filters out all rendezvous log lines', async () => {
            rendezvousTrackerMock.expects('emit').withArgs('rendezvous-event').once();
            let expected = `channel: Start\nStarting data processing\nData processing completed\n`;
            assert.equal(await rendezvousTracker.processLogLine(logString), expected);
            assert.deepEqual(rendezvousTracker.getRendezvousHistory, expectedHistory);
            rendezvousTrackerMock.verify();
        });

        it('does not filter out rendezvous log lines', async () => {
            rendezvousTrackerMock.expects('emit').withArgs('rendezvous-event').once();
            rendezvousTracker.setConsoleOutput('full');
            assert.equal(await rendezvousTracker.processLogLine(logString), logString);
            assert.deepEqual(rendezvousTracker.getRendezvousHistory, expectedHistory);
            rendezvousTrackerMock.verify();
        });
    });

    describe('clearRendezvousHistory', () => {
        it('to reset the history data', async () => {
            rendezvousTrackerMock.expects('emit').withArgs('rendezvous-event').twice();
            let expected = `channel: Start\nStarting data processing\nData processing completed\n`;
            assert.equal(await rendezvousTracker.processLogLine(logString), expected);
            assert.deepEqual(rendezvousTracker.getRendezvousHistory, expectedHistory);

            rendezvousTracker.clearRendezvousHistory();

            assert.deepEqual(rendezvousTracker.getRendezvousHistory, {
                hitCount: 0,
                occurrences: {},
                totalTime: 0.00,
                type: 'historyInfo',
                zeroCostHitCount: 0
            });
            rendezvousTrackerMock.verify();
        });
    });
});
