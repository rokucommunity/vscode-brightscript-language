/* eslint-disable no-bitwise */
// ON-DEVICE CODE (Hermes) — bundled into dist/solidDevtools/bridge.js and injected
// into the staged app bundle by roku-debug. Must stay dependency-free.

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * base64-encode a JS string as UTF-8 — no btoa/Buffer/TextEncoder and crucially NO
 * regexp (encodeURIComponent + /%XX/g OOMs Hermes on large strings). Streams UTF-8
 * bytes through a 6-bit accumulator.
 */
export function utf8ToBase64(str: string): string {
    let out = '';
    let buffer = 0;
    let bits = 0;
    function emit(byte: number): void {
        buffer = (buffer << 8) | byte;
        bits += 8;
        while (bits >= 6) {
            bits -= 6;
            out += B64.charAt((buffer >> bits) & 0x3f);
        }
    }
    for (let i = 0; i < str.length; i++) {
        const code = str.charCodeAt(i);
        if (code < 0x80) {
            emit(code);
        } else if (code < 0x800) {
            emit(0xc0 | (code >> 6));
            emit(0x80 | (code & 0x3f));
        } else if (code >= 0xd800 && code <= 0xdbff && i + 1 < str.length) {
            const lo = str.charCodeAt(++i);
            const cp = 0x10000 + ((code - 0xd800) << 10) + (lo - 0xdc00);
            emit(0xf0 | (cp >> 18));
            emit(0x80 | ((cp >> 12) & 0x3f));
            emit(0x80 | ((cp >> 6) & 0x3f));
            emit(0x80 | (cp & 0x3f));
        } else {
            emit(0xe0 | (code >> 12));
            emit(0x80 | ((code >> 6) & 0x3f));
            emit(0x80 | (code & 0x3f));
        }
    }
    if (bits > 0) {
        out += B64.charAt((buffer << (6 - bits)) & 0x3f);
    }
    while (out.length % 4 !== 0) {
        out += '=';
    }
    return out;
}
