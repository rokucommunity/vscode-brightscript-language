import * as dgram from 'dgram';
import { EventEmitter } from 'eventemitter3';

const MDNS_MULTICAST_ADDRESS = '224.0.0.251';
const MDNS_PORT = 5353;

// DNS resource-record type numbers (RFC 1035 / RFC 6763)
const RECORD_TYPE_A = 1;
const RECORD_TYPE_PTR = 12;
const RECORD_TYPE_TXT = 16;
const RECORD_TYPE_AAAA = 28;
const RECORD_TYPE_SRV = 33;

/**
 * Roku devices advertise this TXT key/value regardless of the TV brand (Roku, TCL, Hisense,
 * ...), which makes it the most reliable Roku signal in an mDNS response. Compared lowercase.
 */
const ROKU_TXT_MARKER = 'integrator=roku';

/**
 * Service type observed to be advertised only by Roku devices (never by the Apple / Google /
 * printer responders on the same network). Used as a secondary Roku signal.
 */
const ROKU_DISPLAY_SERVICE = '_display._tcp.local';

/** Service-instance suffixes we strip to recover the friendly device name. */
const FRIENDLY_NAME_SUFFIXES = ['._display._tcp.local', '._airplay._tcp.local'];

/** Do not re-emit `roku-found` for the same device more often than this. */
const FOUND_DEBOUNCE_MS = 30_000;

/** Drop accumulated device state that has not been seen within this window. */
const DEVICE_EXPIRY_MS = 20 * 60 * 1000;

/**
 * Passive mDNS / DNS-SD listener for Roku devices.
 *
 * Unlike an active scanner this never sends a query. It joins the mDNS multicast group and
 * listens for the announcements devices broadcast on their own, plus any responses that other
 * hosts' queries elicit. That adds zero traffic of our own and sidesteps the responder
 * rate-limiting that makes repeated active scanning unreliable. It is intended as a supplement
 * to the active SSDP discovery in RokuFinder, not a replacement.
 */
export class MdnsListener extends EventEmitter {
    constructor(
        private log: (message: string) => void = () => { }
    ) {
        super();
    }

    private socket: dgram.Socket | undefined;
    private readonly devices = new Map<string, DeviceState>();
    private lastCleanupTime = 0;

    /**
     * Bind the multicast socket and begin listening. Best-effort: any bind/membership failure
     * is logged and swallowed rather than thrown, so a busy port never breaks the extension.
     * Resolves once the socket is listening or the attempt has failed.
     */
    public start(): Promise<void> {
        if (this.socket) {
            return Promise.resolve();
        }
        return new Promise<void>((resolve) => {
            let settled = false;
            const settle = () => {
                if (!settled) {
                    settled = true;
                    resolve();
                }
            };

            const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
            this.socket = socket;

            socket.on('error', (error) => {
                this.log(`mDNS listener socket error: ${error.message}`);
                this.stop();
                settle();
            });

            socket.on('message', (message, remote) => {
                this.handlePacket(message, remote.address);
            });

            socket.on('listening', () => {
                try {
                    socket.addMembership(MDNS_MULTICAST_ADDRESS);
                } catch (error) {
                    this.log(`mDNS listener could not join multicast group: ${(error as Error).message}`);
                }
                settle();
            });

            try {
                socket.bind(MDNS_PORT);
            } catch (error) {
                this.log(`mDNS listener bind failed: ${(error as Error).message}`);
                this.stop();
                settle();
            }
        });
    }

    public stop(): void {
        if (this.socket) {
            try {
                this.socket.removeAllListeners();
                this.socket.close();
            } catch {
                // socket may already be closed; ignore
            }
            this.socket = undefined;
        }
    }

    /**
     * Parse one received packet and emit `roku-found` / `roku-lost` as warranted.
     * Exposed (not private) so it can be exercised in tests without binding a real socket.
     */
    public handlePacket(message: Buffer, sourceIp: string): void {
        let parsed: ParsedMdnsMessage;
        try {
            parsed = parseMdnsMessage(message);
        } catch {
            return; // malformed packet, ignore
        }

        // Only responses describe advertised services. Queries (including the ones Roku devices
        // send themselves) carry an EDNS OPT record but no answers we care about.
        if (!parsed.isResponse) {
            return;
        }

        const fields = extractRokuFields(parsed.records, sourceIp);

        // Keyed by packet source, which is the device itself and stays stable even when a given
        // packet omits the A record. Once an IP is known to be a Roku, later packets from it
        // update its details even if they no longer carry the Roku marker.
        const alreadyKnown = this.devices.has(sourceIp);
        if (!fields.isRoku && !alreadyKnown) {
            return;
        }

        const now = Date.now();
        this.cleanupExpiredDevices(now);

        if (fields.goodbye) {
            this.devices.delete(sourceIp);
            this.emit('roku-lost', fields.ipv4 ?? sourceIp);
            return;
        }

        // Accumulate across packets: a Roku often splits its records so the TXT (which carries
        // the Roku marker) and the A record (which carries the serial) arrive separately.
        const existing = this.devices.get(sourceIp);
        const previousSerial = existing?.serialNumber;
        const device: DeviceState = existing ?? { ip: sourceIp, lastSeen: now, lastEmit: 0 };
        device.ip = fields.ipv4 ?? device.ip;
        device.serialNumber = fields.serialNumber ?? device.serialNumber;
        device.model = fields.model ?? device.model;
        device.name = fields.name ?? device.name;
        device.lastSeen = now;
        this.devices.set(sourceIp, device);

        // Emit on the debounce interval, or immediately when the serial first resolves so a
        // split announcement does not delay the useful identifier by a full debounce window.
        const serialJustResolved = device.serialNumber !== undefined && device.serialNumber !== previousSerial;
        if (serialJustResolved || now - device.lastEmit >= FOUND_DEBOUNCE_MS) {
            device.lastEmit = now;
            const sighting: RokuSighting = {
                ip: device.ip,
                serialNumber: device.serialNumber,
                model: device.model,
                name: device.name
            };
            this.emit('roku-found', sighting);
        }
    }

    private cleanupExpiredDevices(now: number): void {
        if (now - this.lastCleanupTime < DEVICE_EXPIRY_MS) {
            return;
        }
        this.lastCleanupTime = now;
        for (const [ip, device] of this.devices) {
            if (now - device.lastSeen > DEVICE_EXPIRY_MS) {
                this.devices.delete(ip);
            }
        }
    }

    public dispose(): void {
        this.stop();
        this.removeAllListeners();
        this.devices.clear();
    }
}

/**
 * Inspect one packet's records and report what they say about a Roku device. Pure and
 * stateless so it can be unit-tested directly. The device is considered a Roku when it carries
 * the `integrator=Roku` TXT marker or advertises the Roku-only `_display` service.
 */
export function extractRokuFields(records: ParsedRecord[], sourceIp: string): PacketRokuFields {
    let isRoku = false;
    let goodbye = false;
    let ipv4: string | undefined;
    let serialNumber: string | undefined;
    let model: string | undefined;
    let name: string | undefined;

    for (const record of records) {
        // Roku signal 1: the integrator=Roku TXT marker
        if (record.type === RECORD_TYPE_TXT && Array.isArray(record.data)) {
            for (const entry of record.data as string[]) {
                const lower = entry.toLowerCase();
                if (lower === ROKU_TXT_MARKER) {
                    isRoku = true;
                } else if (lower.startsWith('model=')) {
                    model = entry.slice('model='.length);
                }
            }
        }

        // Roku signal 2: the _display service type, which only Rokus were seen to advertise
        if (recordReferencesService(record, ROKU_DISPLAY_SERVICE)) {
            isRoku = true;
        }

        // The A record's name is the device hostname, which for Roku is its serial number.
        if (record.type === RECORD_TYPE_A) {
            ipv4 ??= record.data;
            const candidateSerial = hostnameToSerial(record.name);
            if (candidateSerial) {
                serialNumber ??= candidateSerial;
            }
            if (record.ttl === 0) {
                goodbye = true;
            }
        }

        // Friendly name from a service-instance record name
        const friendly = friendlyNameFromInstance(record.name);
        if (friendly) {
            name ??= friendly;
        }
    }

    return { isRoku: isRoku, goodbye: goodbye, ipv4: ipv4, serialNumber: serialNumber, model: model, name: name };
}

/** True when the record is, or points at, the given service type. */
function recordReferencesService(record: ParsedRecord, serviceType: string): boolean {
    if (record.name === serviceType) {
        return true;
    }
    if (record.name.endsWith(`.${serviceType}`)) {
        return true;
    }
    if (record.type === RECORD_TYPE_PTR && typeof record.data === 'string' && record.data.endsWith(serviceType)) {
        return true;
    }
    return false;
}

/**
 * Convert an mDNS hostname to a Roku serial number, or undefined when it does not look like a
 * bare hostname. Roku uses its serial as the host label, e.g. `X01300A3Y71Y.local`.
 */
function hostnameToSerial(recordName: string): string | undefined {
    const withoutLocal = recordName.replace(/\.local\.?$/i, '');
    // A bare hostname has no dots and is not a service instance (no `._` service segment).
    if (withoutLocal.length === 0 || withoutLocal.includes('.') || withoutLocal.includes('._') || withoutLocal.includes(' ')) {
        return undefined;
    }
    return withoutLocal;
}

/** Recover the friendly name from a service-instance record name, if it is one. */
function friendlyNameFromInstance(recordName: string): string | undefined {
    for (const suffix of FRIENDLY_NAME_SUFFIXES) {
        if (recordName.endsWith(suffix)) {
            return recordName.slice(0, -suffix.length);
        }
    }
    return undefined;
}

/**
 * Parse a DNS/mDNS message into whether it is a response plus its resource records.
 * Handles name-compression pointers. Pure and exported for testing.
 */
export function parseMdnsMessage(buffer: Buffer): ParsedMdnsMessage {
    if (buffer.length < 12) {
        throw new Error('mDNS packet too short');
    }
    const flags = buffer.readUInt16BE(2);
    // The QR bit is the most-significant bit of the 16-bit flags field (0x8000).
    const isResponse = flags >= 0x8000;
    const questionCount = buffer.readUInt16BE(4);
    const answerCount = buffer.readUInt16BE(6);
    const authorityCount = buffer.readUInt16BE(8);
    const additionalCount = buffer.readUInt16BE(10);

    let offset = 12;
    for (let index = 0; index < questionCount; index++) {
        const { nextOffset } = readName(buffer, offset);
        offset = nextOffset + 4; // skip QTYPE (2) + QCLASS (2)
    }

    const totalRecords = answerCount + authorityCount + additionalCount;
    const records: ParsedRecord[] = [];
    for (let index = 0; index < totalRecords; index++) {
        if (offset >= buffer.length) {
            break;
        }
        const { name, nextOffset } = readName(buffer, offset);
        const type = buffer.readUInt16BE(nextOffset);
        const ttl = buffer.readUInt32BE(nextOffset + 4); // skip type (2) + class (2)
        const rdataLength = buffer.readUInt16BE(nextOffset + 8);
        const rdataStart = nextOffset + 10;
        const data = parseRecordData(buffer, type, rdataStart, rdataLength);
        records.push({ name: name, type: type, ttl: ttl, data: data });
        offset = rdataStart + rdataLength;
    }

    return { isResponse: isResponse, records: records };
}

/**
 * Read a (possibly compression-pointer-using) DNS name starting at `offset`. Returns the
 * decoded dotted name and the offset immediately after the name in the buffer.
 */
function readName(buffer: Buffer, offset: number): { name: string; nextOffset: number } {
    const labels: string[] = [];
    let position = offset;
    let nextOffset = -1;
    let safetyCounter = 0;

    while (position < buffer.length && safetyCounter++ < 128) {
        const lengthByte = buffer[position];

        if (lengthByte === 0) {
            position += 1;
            break;
        }

        // A compression pointer has its two most-significant bits set, i.e. a byte >= 0xC0.
        if (lengthByte >= 0xc0) {
            // The low 6 bits of this byte plus the next byte form the 14-bit target offset.
            const pointer = ((lengthByte - 0xc0) * 256) + buffer[position + 1];
            if (nextOffset === -1) {
                nextOffset = position + 2;
            }
            position = pointer;
            continue;
        }

        labels.push(buffer.toString('utf8', position + 1, position + 1 + lengthByte));
        position += 1 + lengthByte;
    }

    if (nextOffset === -1) {
        nextOffset = position;
    }
    return { name: labels.join('.'), nextOffset: nextOffset };
}

/** Parse the RDATA of a single record into a friendly representation based on its type. */
function parseRecordData(buffer: Buffer, type: number, rdataStart: number, rdataLength: number): any {
    switch (type) {
        case RECORD_TYPE_A:
            return Array.from(buffer.subarray(rdataStart, rdataStart + 4)).join('.');
        case RECORD_TYPE_AAAA: {
            const groups: string[] = [];
            for (let index = 0; index < 16; index += 2) {
                groups.push(buffer.readUInt16BE(rdataStart + index).toString(16));
            }
            return groups.join(':');
        }
        case RECORD_TYPE_PTR:
            return readName(buffer, rdataStart).name;
        case RECORD_TYPE_TXT: {
            const entries: string[] = [];
            let position = rdataStart;
            const end = rdataStart + rdataLength;
            while (position < end) {
                const length = buffer[position];
                position += 1;
                if (length > 0) {
                    entries.push(buffer.toString('utf8', position, position + length));
                    position += length;
                }
            }
            return entries;
        }
        case RECORD_TYPE_SRV:
            return {
                priority: buffer.readUInt16BE(rdataStart),
                weight: buffer.readUInt16BE(rdataStart + 2),
                port: buffer.readUInt16BE(rdataStart + 4),
                target: readName(buffer, rdataStart + 6).name
            };
        default:
            return null;
    }
}

export interface RokuSighting {
    /** IPv4 address of the device (from its A record, falling back to the packet source). */
    ip: string;
    /** Roku serial number, taken from the device's mDNS hostname (e.g. `X01300A3Y71Y`). */
    serialNumber?: string;
    /** Hardware model code from the TXT record (e.g. `G220X`). */
    model?: string;
    /** Friendly device name from the AirPlay/display instance (e.g. `Living Room Roku`). */
    name?: string;
}

export interface ParsedRecord {
    name: string;
    type: number;
    ttl: number;
    data: any;
}

export interface ParsedMdnsMessage {
    /** True when the QR header bit is set (a response rather than a query). */
    isResponse: boolean;
    records: ParsedRecord[];
}

/** Fields a single packet can tell us about a device, before cross-packet accumulation. */
interface PacketRokuFields {
    isRoku: boolean;
    /** True when the packet says the device is going away (a record with TTL 0). */
    goodbye: boolean;
    ipv4?: string;
    serialNumber?: string;
    model?: string;
    name?: string;
}

interface DeviceState {
    ip: string;
    serialNumber?: string;
    model?: string;
    name?: string;
    lastSeen: number;
    lastEmit: number;
}
