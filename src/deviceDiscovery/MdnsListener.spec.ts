import { expect } from 'chai';
import * as sinon from 'sinon';
import type { RokuSighting } from './MdnsListener';
import { MdnsListener, parseMdnsMessage, extractRokuFields } from './MdnsListener';

// DNS record type numbers, mirrored here so the test builder is self-contained.
const TYPE_A = 1;
const TYPE_PTR = 12;
const TYPE_TXT = 16;
const TYPE_SRV = 33;

interface TestRecord {
    name: string;
    type: number;
    ttl?: number;
    data: any;
}

function encodeName(name: string): Buffer {
    const parts = name.split('.').filter((part) => part.length > 0);
    const chunks: Buffer[] = [];
    for (const part of parts) {
        const labelBytes = Buffer.from(part, 'utf8');
        chunks.push(Buffer.from([labelBytes.length]), labelBytes);
    }
    chunks.push(Buffer.from([0]));
    return Buffer.concat(chunks);
}

function encodeRdata(record: TestRecord): Buffer {
    switch (record.type) {
        case TYPE_A:
            return Buffer.from((record.data as string).split('.').map((octet) => Number(octet)));
        case TYPE_PTR:
            return encodeName(record.data as string);
        case TYPE_TXT: {
            const chunks: Buffer[] = [];
            for (const entry of record.data as string[]) {
                const bytes = Buffer.from(entry, 'utf8');
                chunks.push(Buffer.from([bytes.length]), bytes);
            }
            return Buffer.concat(chunks);
        }
        case TYPE_SRV: {
            const head = Buffer.alloc(6);
            head.writeUInt16BE(record.data.priority ?? 0, 0);
            head.writeUInt16BE(record.data.weight ?? 0, 2);
            head.writeUInt16BE(record.data.port ?? 0, 4);
            return Buffer.concat([head, encodeName(record.data.target as string)]);
        }
        default:
            return Buffer.alloc(0);
    }
}

function encodeRecord(record: TestRecord): Buffer {
    const name = encodeName(record.name);
    const rdata = encodeRdata(record);
    const middle = Buffer.alloc(10);
    middle.writeUInt16BE(record.type, 0); // TYPE
    middle.writeUInt16BE(0x0001, 2); // CLASS = IN
    middle.writeUInt32BE(record.ttl ?? 120, 4); // TTL
    middle.writeUInt16BE(rdata.length, 8); // RDLENGTH
    return Buffer.concat([name, middle, rdata]);
}

/** Build an mDNS response packet (QR bit set) containing the given answer records. */
function buildResponse(records: TestRecord[]): Buffer {
    const header = Buffer.alloc(12);
    header.writeUInt16BE(0x8400, 2); // flags: QR + AA
    header.writeUInt16BE(records.length, 6); // ANCOUNT
    return Buffer.concat([header, ...records.map(encodeRecord)]);
}

/** Build an mDNS query packet (QR bit clear) for a service name. */
function buildQuery(serviceName: string): Buffer {
    const header = Buffer.alloc(12);
    header.writeUInt16BE(1, 4); // QDCOUNT
    const question = Buffer.concat([
        encodeName(serviceName),
        Buffer.from([0x00, TYPE_PTR, 0x00, 0x01])
    ]);
    return Buffer.concat([header, question]);
}

/** A realistic bundled Roku AirPlay/display response, like the ones observed on-network. */
function rokuRecords(overrides?: { ip?: string; serial?: string; model?: string; name?: string }): TestRecord[] {
    const ip = overrides?.ip ?? '192.168.1.91';
    const serial = overrides?.serial ?? 'X01300A3Y71Y';
    const model = overrides?.model ?? 'G220X';
    const name = overrides?.name ?? '65in Hisense Roku TV';
    return [
        { name: '_airplay._tcp.local', type: TYPE_PTR, data: `${name}._airplay._tcp.local` },
        { name: `${name}._airplay._tcp.local`, type: TYPE_SRV, data: { port: 7000, target: `${serial}.local` } },
        { name: `${name}._airplay._tcp.local`, type: TYPE_TXT, data: ['integrator=Roku', `model=${model}`, `manufacturer=Hisense`] },
        { name: `${serial}.local`, type: TYPE_A, data: ip }
    ];
}

describe('MdnsListener', () => {
    let listener: MdnsListener;

    afterEach(() => {
        listener?.dispose();
        sinon.restore();
    });

    describe('parseMdnsMessage', () => {
        it('parses a response with A and TXT records', () => {
            const buffer = buildResponse([
                { name: 'X01300A3Y71Y.local', type: TYPE_A, ttl: 120, data: '192.168.1.91' },
                { name: 'inst._airplay._tcp.local', type: TYPE_TXT, data: ['integrator=Roku', 'model=G220X'] }
            ]);

            const parsed = parseMdnsMessage(buffer);

            expect(parsed.isResponse).to.be.true;
            expect(parsed.records).to.have.length(2);
            expect(parsed.records[0]).to.include({ name: 'X01300A3Y71Y.local', type: TYPE_A, ttl: 120, data: '192.168.1.91' });
            expect(parsed.records[1].data).to.deep.equal(['integrator=Roku', 'model=G220X']);
        });

        it('marks a query as not a response', () => {
            const parsed = parseMdnsMessage(buildQuery('_airplay._tcp.local'));
            expect(parsed.isResponse).to.be.false;
        });

        it('throws on a too-short packet', () => {
            expect(() => parseMdnsMessage(Buffer.from([0, 0, 0]))).to.throw();
        });
    });

    describe('extractRokuFields', () => {
        it('identifies a Roku and extracts serial, model, name, and ip', () => {
            const fields = extractRokuFields(parseMdnsMessage(buildResponse(rokuRecords())).records, '192.168.1.91');

            expect(fields.isRoku).to.be.true;
            expect(fields.serialNumber).to.equal('X01300A3Y71Y');
            expect(fields.model).to.equal('G220X');
            expect(fields.name).to.equal('65in Hisense Roku TV');
            expect(fields.ipv4).to.equal('192.168.1.91');
            expect(fields.goodbye).to.be.false;
        });

        it('identifies a Roku by the _display service even without the integrator marker', () => {
            const records = parseMdnsMessage(buildResponse([
                { name: '_display._tcp.local', type: TYPE_PTR, data: 'Roku._display._tcp.local' }
            ])).records;

            expect(extractRokuFields(records, '192.168.1.91').isRoku).to.be.true;
        });

        it('does not flag a non-Roku responder', () => {
            const records = parseMdnsMessage(buildResponse([
                { name: 'Apple TV._airplay._tcp.local', type: TYPE_TXT, data: ['model=AppleTV6,2', 'srcvers=950.7.1'] },
                { name: 'apple-tv.local', type: TYPE_A, data: '192.168.1.93' }
            ])).records;

            const fields = extractRokuFields(records, '192.168.1.93');
            expect(fields.isRoku).to.be.false;
        });

        it('detects a goodbye when the A record TTL is 0', () => {
            const records = parseMdnsMessage(buildResponse([
                { name: '_airplay._tcp.local', type: TYPE_PTR, data: 'Roku._airplay._tcp.local' },
                { name: 'Roku._airplay._tcp.local', type: TYPE_TXT, data: ['integrator=Roku'] },
                { name: 'X01300A3Y71Y.local', type: TYPE_A, ttl: 0, data: '192.168.1.91' }
            ])).records;

            const fields = extractRokuFields(records, '192.168.1.91');
            expect(fields.isRoku).to.be.true;
            expect(fields.goodbye).to.be.true;
        });

        it('does not treat a service-instance name as a serial', () => {
            const records = parseMdnsMessage(buildResponse([
                { name: 'Living Room._airplay._tcp.local', type: TYPE_TXT, data: ['integrator=Roku'] }
            ])).records;

            expect(extractRokuFields(records, '192.168.1.91').serialNumber).to.be.undefined;
        });
    });

    describe('handlePacket', () => {
        it('emits roku-found with the full sighting for a bundled response', () => {
            listener = new MdnsListener();
            const foundSpy = sinon.spy();
            listener.on('roku-found', foundSpy);

            listener.handlePacket(buildResponse(rokuRecords()), '192.168.1.91');

            expect(foundSpy.calledOnce).to.be.true;
            const sighting = foundSpy.firstCall.args[0] as RokuSighting;
            expect(sighting).to.deep.equal({
                ip: '192.168.1.91',
                serialNumber: 'X01300A3Y71Y',
                model: 'G220X',
                name: '65in Hisense Roku TV'
            });
        });

        it('ignores queries', () => {
            listener = new MdnsListener();
            const foundSpy = sinon.spy();
            listener.on('roku-found', foundSpy);

            listener.handlePacket(buildQuery('_airplay._tcp.local'), '192.168.1.91');

            expect(foundSpy.called).to.be.false;
        });

        it('ignores non-Roku responders', () => {
            listener = new MdnsListener();
            const foundSpy = sinon.spy();
            listener.on('roku-found', foundSpy);

            listener.handlePacket(buildResponse([
                { name: 'apple-tv.local', type: TYPE_A, data: '192.168.1.93' },
                { name: 'Apple TV._airplay._tcp.local', type: TYPE_TXT, data: ['model=AppleTV6,2'] }
            ]), '192.168.1.93');

            expect(foundSpy.called).to.be.false;
        });

        it('ignores malformed packets without throwing', () => {
            listener = new MdnsListener();
            const foundSpy = sinon.spy();
            listener.on('roku-found', foundSpy);

            expect(() => listener.handlePacket(Buffer.from([0, 1, 2]), '192.168.1.91')).to.not.throw();
            expect(foundSpy.called).to.be.false;
        });

        it('debounces repeated announcements from the same device', () => {
            const clock = sinon.useFakeTimers();
            try {
                listener = new MdnsListener();
                const foundSpy = sinon.spy();
                listener.on('roku-found', foundSpy);

                listener.handlePacket(buildResponse(rokuRecords()), '192.168.1.91');
                listener.handlePacket(buildResponse(rokuRecords()), '192.168.1.91');
                expect(foundSpy.calledOnce).to.be.true;

                // After the debounce window, the same device emits again.
                clock.tick(30_000);
                listener.handlePacket(buildResponse(rokuRecords()), '192.168.1.91');
                expect(foundSpy.calledTwice).to.be.true;
            } finally {
                clock.restore();
            }
        });

        it('debounces independently per device', () => {
            listener = new MdnsListener();
            const foundSpy = sinon.spy();
            listener.on('roku-found', foundSpy);

            listener.handlePacket(buildResponse(rokuRecords({ ip: '192.168.1.91', serial: 'X01300A3Y71Y' })), '192.168.1.91');
            listener.handlePacket(buildResponse(rokuRecords({ ip: '192.168.1.249', serial: 'X00000907DRH' })), '192.168.1.249');

            expect(foundSpy.calledTwice).to.be.true;
            expect(foundSpy.firstCall.args[0].ip).to.equal('192.168.1.91');
            expect(foundSpy.secondCall.args[0].ip).to.equal('192.168.1.249');
        });

        it('resolves the serial from a later packet when records arrive split', () => {
            listener = new MdnsListener();
            const foundSpy = sinon.spy();
            listener.on('roku-found', foundSpy);

            // First packet: the Roku marker in a TXT, but no A record (no serial yet).
            listener.handlePacket(buildResponse([
                { name: 'Roku._airplay._tcp.local', type: TYPE_TXT, data: ['integrator=Roku', 'model=G220X'] }
            ]), '192.168.1.91');
            expect(foundSpy.firstCall.args[0].serialNumber).to.be.undefined;

            // Second packet from the same IP: the A record carries the serial (no marker).
            listener.handlePacket(buildResponse([
                { name: 'X01300A3Y71Y.local', type: TYPE_A, data: '192.168.1.91' }
            ]), '192.168.1.91');

            expect(foundSpy.calledTwice).to.be.true;
            expect(foundSpy.secondCall.args[0].serialNumber).to.equal('X01300A3Y71Y');
        });

        it('emits roku-lost on a goodbye record', () => {
            listener = new MdnsListener();
            const lostSpy = sinon.spy();
            listener.on('roku-lost', lostSpy);

            // Learn the device first.
            listener.handlePacket(buildResponse(rokuRecords()), '192.168.1.91');
            // Then it announces going away.
            listener.handlePacket(buildResponse([
                { name: 'X01300A3Y71Y.local', type: TYPE_A, ttl: 0, data: '192.168.1.91' },
                { name: 'Roku._airplay._tcp.local', type: TYPE_TXT, data: ['integrator=Roku'] }
            ]), '192.168.1.91');

            expect(lostSpy.calledOnce).to.be.true;
            expect(lostSpy.firstCall.args[0]).to.equal('192.168.1.91');
        });
    });

    describe('start/stop', () => {
        it('start resolves and stop is idempotent', async () => {
            listener = new MdnsListener();
            await listener.start();
            expect(() => {
                listener.stop();
                listener.stop();
            }).to.not.throw();
        });
    });
});
