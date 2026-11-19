import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Writes through a temp file in the same directory and renames it into place, so readers never
 * see a partial file. Without `mode`, an existing file keeps its permissions. The directory must exist.
 */
export function writeFileAtomic(filePath: string, content: string | Buffer, mode?: number): void {
    const effectiveMode = mode ?? (fs.existsSync(filePath) ? fs.statSync(filePath).mode % 0o1000 : undefined);
    const temporaryPath = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`);
    try {
        fs.writeFileSync(temporaryPath, content, { flag: 'wx', mode: effectiveMode });
        if (effectiveMode !== undefined) {
            fs.chmodSync(temporaryPath, effectiveMode);
        }
        fs.renameSync(temporaryPath, filePath);
    } catch (error) {
        fs.rmSync(temporaryPath, { force: true });
        throw error;
    }
}

/** Atomically writes `content` unless the file already holds exactly that. Returns whether it wrote. */
export function writeFileAtomicIfChanged(filePath: string, content: string | Buffer, mode?: number): boolean {
    const expected = typeof content === 'string' ? Buffer.from(content) : content;
    if (fs.existsSync(filePath) && fs.readFileSync(filePath).equals(expected)) {
        return false;
    }
    writeFileAtomic(filePath, content, mode);
    return true;
}
