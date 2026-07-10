import { expect } from 'chai';
import * as sinon from 'sinon';
import type { Response } from 'request';
import { RokuCloudEmulatorClient, defaultCloudEmulatorUserAgent } from './RokuCloudEmulatorClient';

describe('RokuCloudEmulatorClient', () => {
    let client: RokuCloudEmulatorClient;
    let performRequestStub: sinon.SinonStub;

    function fakeResponse(statusCode: number, body: unknown): Response {
        return {
            statusCode: statusCode,
            body: typeof body === 'string' ? body : JSON.stringify(body)
        } as Response;
    }

    async function captureRejection(promise: Promise<unknown>): Promise<Error> {
        try {
            await promise;
        } catch (error) {
            return error as Error;
        }
        throw new Error('expected the promise to reject, but it resolved');
    }

    beforeEach(() => {
        client = new RokuCloudEmulatorClient({ apiKey: 'test-key' });
        performRequestStub = sinon.stub(client as any, 'performRequest');
    });

    afterEach(() => {
        sinon.restore();
    });

    describe('buildRequestHeaders', () => {
        it('sends a browser User-Agent and bearer auth so it clears bot protection and authenticates', () => {
            const headers = client.buildRequestHeaders();
            expect(headers['User-Agent']).to.equal(defaultCloudEmulatorUserAgent);
            expect(headers.Authorization).to.equal('Bearer test-key');
        });

        it('merges additional headers', () => {
            const headers = client.buildRequestHeaders({ 'Content-Type': 'application/json' });
            expect(headers['Content-Type']).to.equal('application/json');
            expect(headers.Authorization).to.equal('Bearer test-key');
        });
    });

    describe('buildWebSocketUrl', () => {
        it('converts the https origin to wss and appends the service path', () => {
            const url = client.buildWebSocketUrl('/cloud-emulator-bff/devices/83/log');
            expect(url).to.equal('wss://developer.roku.com/cloud-emulator-bff/devices/83/log');
        });

        it('honors a custom base url', () => {
            const localClient = new RokuCloudEmulatorClient({ apiKey: 'k', baseUrl: 'https://staging.example.com/' });
            expect(localClient.buildWebSocketUrl('/x/y')).to.equal('wss://staging.example.com/x/y');
        });
    });

    describe('getDevices', () => {
        it('returns the devices array on a successful poll', async () => {
            performRequestStub.resolves(fakeResponse(200, {
                ok: true,
                devices: [{ id: '83', name: 'Chris', status: 'running' }]
            }));
            const devices = await client.getDevices();
            expect(devices).to.have.lengthOf(1);
            expect(devices[0].id).to.equal('83');
            expect(performRequestStub.firstCall.args[0]).to.equal('GET');
            expect(performRequestStub.firstCall.args[1]).to.equal('/cloud-emulator/api/devices/poll');
        });

        it('throws when the service reports ok:false', async () => {
            performRequestStub.resolves(fakeResponse(200, { ok: false }));
            const error = await captureRejection(client.getDevices());
            expect(error.message).to.include('device poll failed');
        });

        it('throws when the body is not valid json', async () => {
            performRequestStub.resolves(fakeResponse(200, 'not json'));
            const error = await captureRejection(client.getDevices());
            expect(error.message).to.include('device poll failed');
        });
    });

    describe('getDevice', () => {
        it('finds a single device by id', async () => {
            performRequestStub.resolves(fakeResponse(200, {
                ok: true,
                devices: [{ id: '83', name: 'Chris' }, { id: '99', name: 'Other' }]
            }));
            const device = await client.getDevice('99');
            expect(device?.name).to.equal('Other');
        });

        it('returns undefined when no device matches', async () => {
            performRequestStub.resolves(fakeResponse(200, { ok: true, devices: [] }));
            expect(await client.getDevice('missing')).to.be.undefined;
        });
    });

    describe('startDevice', () => {
        it('posts the snapshot and firmware to the start path', async () => {
            performRequestStub.resolves(fakeResponse(200, { ok: true }));
            await client.startDevice('83', { snapshotId: '237', firmwareVersion: 'rce-fw:15.2.4-tv_prod', maxRuntimeSeconds: 3600 });
            expect(performRequestStub.firstCall.args[0]).to.equal('POST');
            expect(performRequestStub.firstCall.args[1]).to.equal('/cloud-emulator/api/devices/83/start');
            expect(performRequestStub.firstCall.args[2]).to.deep.equal({
                snapshotId: '237',
                firmwareVersion: 'rce-fw:15.2.4-tv_prod',
                maxRuntimeSeconds: 3600
            });
        });

        it('throws on an error status', async () => {
            performRequestStub.resolves(fakeResponse(403, { ok: false, error: 'forbidden' }));
            const error = await captureRejection(client.startDevice('83', { snapshotId: '1', firmwareVersion: 'f', maxRuntimeSeconds: 60 }));
            expect(error.message).to.include('start device failed');
            expect(error.message).to.include('forbidden');
        });
    });

    describe('stopDevice', () => {
        it('posts to the stop path', async () => {
            performRequestStub.resolves(fakeResponse(200, { ok: true }));
            await client.stopDevice('83');
            expect(performRequestStub.firstCall.args[1]).to.equal('/cloud-emulator/api/devices/83/stop');
        });
    });
});
