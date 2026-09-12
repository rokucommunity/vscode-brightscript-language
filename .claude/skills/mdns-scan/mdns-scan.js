/**
 * Discover devices on the local network via mDNS / DNS-SD scanning.
 *
 * Standalone and dependency-free (raw `dgram` sockets, hand-rolled DNS wire parsing), so it
 * runs with plain `node` in any directory. It enumerates every service type advertised on the
 * link, follows the PTR -> SRV -> A/TXT chain to resolve each device's instance name, host, ip,
 * port, and TXT metadata, and highlights the responders that match a filter term.
 *
 * Run it with:
 *     node .claude/skills/mdns-scan/mdns-scan.js
 *
 * Optional flags:
 *     --seconds=12          how long to listen before printing the summary (default 8)
 *     --filter=chromecast   highlight responders whose records contain this term (default "roku")
 *     --all                 print every responder, not just the ones matching the filter
 *     --verbose             log each parsed record as it arrives
 *     --passive             listen only; never send a query (catch what devices broadcast on their own)
 *
 * Background:
 *   - mDNS uses multicast group 224.0.0.251 on UDP port 5353.
 *   - We send a DNS-SD PTR query for the service-enumeration meta-record
 *     (_services._dns-sd._udp.local) plus a few common service types, then recursively query
 *     every service type we discover and resolve the instances behind them.
 *   - In --passive mode we send nothing and simply report whatever arrives.
 */

const dgram = require('dgram');
const os = require('os');

const MDNS_ADDRESS = '224.0.0.251';
const MDNS_PORT = 5353;

// The DNS-SD meta-query: asks every responder to list the service types it offers.
const SERVICE_ENUMERATION_QUERY = '_services._dns-sd._udp.local';

// A few common service types to seed discovery. The meta-query above surfaces everything else.
const SEED_SERVICE_TYPES = [
    '_airplay._tcp.local',
    '_raop._tcp.local',
    '_googlecast._tcp.local',
    '_display._tcp.local'
];

// DNS record type numbers we care about
const TYPE_A = 1;
const TYPE_PTR = 12;
const TYPE_TXT = 16;
const TYPE_AAAA = 28;
const TYPE_SRV = 33;

function parseArguments() {
    const argv = process.argv.slice(2);
    const getNumberFlag = (flagName, fallback) => {
        const match = argv.find((entry) => entry.startsWith(`${flagName}=`));
        if (!match) {
            return fallback;
        }
        const value = Number(match.split('=')[1]);
        return Number.isFinite(value) ? value : fallback;
    };
    const getStringFlag = (flagName, fallback) => {
        const match = argv.find((entry) => entry.startsWith(`${flagName}=`));
        return match ? match.split('=').slice(1).join('=') : fallback;
    };
    return {
        listenSeconds: getNumberFlag('--seconds', 8),
        filter: getStringFlag('--filter', 'roku').toLowerCase(),
        showAll: argv.includes('--all'),
        verbose: argv.includes('--verbose'),
        passive: argv.includes('--passive')
    };
}

/** Encode a dotted name (e.g. "_airplay._tcp.local") into DNS label wire format. */
function encodeName(name) {
    const parts = name.split('.').filter((part) => part.length > 0);
    const chunks = [];
    for (const part of parts) {
        const labelBytes = Buffer.from(part, 'utf8');
        chunks.push(Buffer.from([labelBytes.length]), labelBytes);
    }
    chunks.push(Buffer.from([0])); // root label terminator
    return Buffer.concat(chunks);
}

/**
 * Build an mDNS query packet asking for PTR records for the given service name. The top bit of
 * the query class (the "QU" bit) requests a unicast response, which helps us receive replies.
 */
function buildPtrQuery(serviceName) {
    const header = Buffer.alloc(12);
    header.writeUInt16BE(1, 4); // QDCOUNT = 1 question
    const question = Buffer.concat([
        encodeName(serviceName),
        Buffer.from([0x00, TYPE_PTR, 0x80, 0x01]) // QTYPE = PTR, QCLASS = IN with unicast-response bit
    ]);
    return Buffer.concat([header, question]);
}

/**
 * Read a (possibly compression-pointer-using) DNS name starting at `offset`. Returns the decoded
 * dotted name and the offset immediately after the name in the buffer.
 */
function readName(buffer, offset) {
    const labels = [];
    let position = offset;
    let nextOffset = -1;
    let safetyCounter = 0;

    while (position < buffer.length && safetyCounter++ < 128) {
        const lengthByte = buffer[position];

        if (lengthByte === 0) {
            position += 1;
            break;
        }

        // A compression pointer is signalled by the top two bits being set (a byte >= 0xC0).
        if (lengthByte >= 0xc0) {
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
function parseRecordData(buffer, type, rdataStart, rdataLength) {
    switch (type) {
        case TYPE_A:
            return Array.from(buffer.subarray(rdataStart, rdataStart + 4)).join('.');
        case TYPE_AAAA: {
            const groups = [];
            for (let index = 0; index < 16; index += 2) {
                groups.push(buffer.readUInt16BE(rdataStart + index).toString(16));
            }
            return groups.join(':');
        }
        case TYPE_PTR:
            return readName(buffer, rdataStart).name;
        case TYPE_TXT: {
            const entries = [];
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
        case TYPE_SRV:
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

/** Parse a full DNS/mDNS message into its questions and answer/additional records. */
function parseMessage(buffer) {
    const flags = buffer.readUInt16BE(2);
    const isResponse = flags >= 0x8000; // QR bit is the most-significant flag bit
    const questionCount = buffer.readUInt16BE(4);
    const answerCount = buffer.readUInt16BE(6);
    const authorityCount = buffer.readUInt16BE(8);
    const additionalCount = buffer.readUInt16BE(10);
    const totalRecords = answerCount + authorityCount + additionalCount;

    let offset = 12;
    const questions = [];
    for (let index = 0; index < questionCount; index++) {
        const { name, nextOffset } = readName(buffer, offset);
        const type = buffer.readUInt16BE(nextOffset);
        questions.push({ name: name, type: type });
        offset = nextOffset + 4; // skip QTYPE (2) + QCLASS (2)
    }

    const answers = [];
    for (let index = 0; index < totalRecords; index++) {
        if (offset >= buffer.length) {
            break;
        }
        const { name, nextOffset } = readName(buffer, offset);
        const type = buffer.readUInt16BE(nextOffset);
        const rdataLength = buffer.readUInt16BE(nextOffset + 8); // skip type(2)+class(2)+ttl(4)
        const rdataStart = nextOffset + 10;
        const data = parseRecordData(buffer, type, rdataStart, rdataLength);
        answers.push({ name: name, type: type, data: data });
        offset = rdataStart + rdataLength;
    }

    return { isResponse: isResponse, questions: questions, answers: answers };
}

function listLocalIPv4Interfaces() {
    const addresses = [];
    for (const entries of Object.values(os.networkInterfaces())) {
        for (const entry of entries || []) {
            if (entry.family === 'IPv4' && !entry.internal) {
                addresses.push(entry.address);
            }
        }
    }
    return addresses;
}

function matchesFilter(responder, filterTerm) {
    if (!filterTerm) {
        return false;
    }
    const haystacks = [
        ...responder.instanceNames,
        ...responder.hostnames,
        ...responder.txtEntries,
        ...responder.serviceTypes
    ];
    return haystacks.some((value) => value.toLowerCase().includes(filterTerm));
}

function main() {
    const options = parseArguments();
    const responders = new Map();
    const queriedServiceTypes = new Set();

    const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

    const getOrCreateResponder = (sourceIp) => {
        let responder = responders.get(sourceIp);
        if (!responder) {
            responder = {
                sourceIp: sourceIp,
                serviceTypes: new Set(),
                instanceNames: new Set(),
                hostnames: new Set(),
                addresses: new Set(),
                ports: new Set(),
                txtEntries: new Set()
            };
            responders.set(sourceIp, responder);
        }
        return responder;
    };

    const sendPtrQuery = (serviceName) => {
        if (options.passive) {
            return; // listen-only: never emit queries
        }
        if (queriedServiceTypes.has(serviceName)) {
            return;
        }
        queriedServiceTypes.add(serviceName);
        const packet = buildPtrQuery(serviceName);
        socket.send(packet, MDNS_PORT, MDNS_ADDRESS, (error) => {
            if (error) {
                console.error(`  ! failed to send query for ${serviceName}: ${error.message}`);
            }
        });
    };

    socket.on('error', (error) => {
        console.error(`Socket error: ${error.message}`);
        socket.close();
    });

    socket.on('message', (message, remote) => {
        let parsed;
        try {
            parsed = parseMessage(message);
        } catch (error) {
            if (options.verbose) {
                console.error(`  ! failed to parse packet from ${remote.address}: ${error.message}`);
            }
            return;
        }

        // Only responses describe advertised services. Queries (including the mDNS queries
        // devices send themselves) carry an EDNS OPT record but no answers we care about.
        if (!parsed.isResponse || parsed.answers.length === 0) {
            if (options.verbose && !parsed.isResponse) {
                console.log(`  [${remote.address}] (query) ${parsed.questions.map((question) => question.name).join(', ')}`);
            }
            return;
        }

        const responder = getOrCreateResponder(remote.address);

        for (const record of parsed.answers) {
            if (options.verbose) {
                console.log(`  [${remote.address}] ${typeName(record.type)}  ${record.name} -> ${JSON.stringify(record.data)}`);
            }
            switch (record.type) {
                case TYPE_PTR:
                    if (record.name === SERVICE_ENUMERATION_QUERY) {
                        // The meta-query answer is itself a service type; go probe it.
                        responder.serviceTypes.add(record.data);
                        sendPtrQuery(record.data);
                    } else {
                        // A service-type PTR answer names a concrete service instance.
                        responder.serviceTypes.add(record.name);
                        responder.instanceNames.add(record.data);
                    }
                    break;
                case TYPE_SRV:
                    responder.instanceNames.add(record.name);
                    responder.hostnames.add(record.data.target);
                    responder.ports.add(record.data.port);
                    break;
                case TYPE_TXT:
                    responder.instanceNames.add(record.name);
                    for (const entry of record.data) {
                        responder.txtEntries.add(entry);
                    }
                    break;
                case TYPE_A:
                    responder.addresses.add(record.data);
                    break;
                case TYPE_AAAA:
                    responder.addresses.add(record.data);
                    break;
                default:
                    break;
            }
        }
    });

    socket.on('listening', () => {
        const address = socket.address();
        console.log(`Listening on ${address.address}:${address.port}`);
        try {
            socket.addMembership(MDNS_ADDRESS);
        } catch (error) {
            console.error(`  ! could not join multicast group: ${error.message}`);
        }
        socket.setMulticastTTL(255);

        const localInterfaces = listLocalIPv4Interfaces();
        console.log(`Local IPv4 interfaces: ${localInterfaces.join(', ') || '(none found)'}`);

        if (options.passive) {
            console.log(`Passive listen-only mode: sending no queries, listening for ${options.listenSeconds}s...\n`);
            return;
        }

        console.log(`Scanning for ${options.listenSeconds}s...\n`);

        const initialQueries = [SERVICE_ENUMERATION_QUERY, ...SEED_SERVICE_TYPES];
        const sendInitialBurst = () => {
            for (const serviceName of initialQueries) {
                // Clear the dedup guard so repeated bursts actually re-send (UDP is lossy).
                queriedServiceTypes.delete(serviceName);
                sendPtrQuery(serviceName);
            }
        };
        // UDP is unreliable, so fire the initial burst a few times.
        sendInitialBurst();
        setTimeout(sendInitialBurst, 250);
        setTimeout(sendInitialBurst, 750);
    });

    // Bind to the standard mDNS port so we also catch multicast responses. On systems where
    // another responder already holds 5353 (notably macOS, with mDNSResponder), reuseAddr lets
    // us coexist. If the bind fails outright the 'error' handler logs it and closes the socket.
    socket.bind(MDNS_PORT);

    setTimeout(() => {
        socket.close();
        printSummary(responders, options);
    }, options.listenSeconds * 1000);
}

function typeName(type) {
    switch (type) {
        case TYPE_A: return 'A   ';
        case TYPE_AAAA: return 'AAAA';
        case TYPE_PTR: return 'PTR ';
        case TYPE_TXT: return 'TXT ';
        case TYPE_SRV: return 'SRV ';
        default: return `#${type}`;
    }
}

function printSummary(responders, options) {
    const all = [...responders.values()];
    const matched = all.filter((responder) => matchesFilter(responder, options.filter));
    const toPrint = options.showAll ? all : (matched.length > 0 ? matched : all);

    console.log('\n========================================');
    console.log(`Discovered ${all.length} responder(s); ${matched.length} match "${options.filter}".`);
    if (!options.showAll && matched.length === 0) {
        console.log(`(No matches for "${options.filter}". Showing everything so you can inspect. Use --all to force this.)`);
    }
    console.log('========================================\n');

    for (const responder of toPrint) {
        const matchTag = matchesFilter(responder, options.filter) ? `  <-- matches "${options.filter}"` : '';
        console.log(`Responder ${responder.sourceIp}${matchTag}`);
        printSet('  service types', responder.serviceTypes);
        printSet('  instances', responder.instanceNames);
        printSet('  hostnames', responder.hostnames);
        printSet('  addresses', responder.addresses);
        if (responder.ports.size > 0) {
            console.log(`  ports:        ${[...responder.ports].join(', ')}`);
        }
        printSet('  txt', responder.txtEntries);
        console.log('');
    }
}

function printSet(label, values) {
    if (values.size === 0) {
        return;
    }
    const items = [...values];
    console.log(`${label}: ${items[0]}`);
    for (const item of items.slice(1)) {
        console.log(`${' '.repeat(label.length + 2)}${item}`);
    }
}

main();
