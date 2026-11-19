/** Fixed-capacity line buffer for debug adapter output; every line gets a monotonically increasing cursor. */
export class OutputBuffer {
    constructor(
        private readonly capacity = 5000
    ) { }

    private lines: OutputLine[] = [];
    private nextCursor = 1;

    public get latestCursor(): number {
        return this.nextCursor - 1;
    }

    /** Splits `text` into lines; a trailing newline does not produce an empty line. */
    public append(category: string, text: string): void {
        const parts = text.split(/\r?\n/);
        if (parts[parts.length - 1] === '') {
            parts.pop();
        }
        for (const part of parts) {
            this.lines.push({ cursor: this.nextCursor++, category: category, text: part });
        }
        if (this.lines.length > this.capacity) {
            this.lines.splice(0, this.lines.length - this.capacity);
        }
    }

    /**
     * Without `sinceCursor`, returns the newest matching lines. With it, returns the oldest matching
     * lines after that cursor, and `nextCursor` resumes exactly where the result stopped.
     */
    public read(options: OutputReadOptions): OutputReadResult {
        const matches = (line: OutputLine) => (!options.categories || options.categories.includes(line.category)) && (!options.filter || options.filter.test(line.text));
        if (options.sinceCursor === undefined) {
            const matching = this.lines.filter(matches);
            const selected = matching.slice(-options.maxLines);
            return { lines: selected, nextCursor: this.latestCursor, hasMore: false, droppedLines: false };
        }

        const sinceCursor = options.sinceCursor;
        const oldestCursor = this.lines.length > 0 ? this.lines[0].cursor : this.nextCursor;
        const droppedLines = sinceCursor + 1 < oldestCursor;
        const selected: OutputLine[] = [];
        let lastScannedCursor = sinceCursor;
        let hasMore = false;
        for (const line of this.lines) {
            if (line.cursor <= sinceCursor) {
                continue;
            }
            if (matches(line)) {
                if (selected.length >= options.maxLines) {
                    hasMore = true;
                    break;
                }
                selected.push(line);
            }
            lastScannedCursor = line.cursor;
        }
        return {
            lines: selected,
            nextCursor: hasMore ? lastScannedCursor : Math.max(this.latestCursor, sinceCursor),
            hasMore: hasMore,
            droppedLines: droppedLines
        };
    }
}

/** Compiles a user-supplied filter, reporting a bad pattern as a plain error message. */
export function compileOutputFilter(pattern: string | undefined): RegExp | undefined {
    if (!pattern) {
        return undefined;
    }
    try {
        return new RegExp(pattern);
    } catch (error) {
        throw new Error(`Invalid filter regular expression: ${(error as Error).message}`);
    }
}

export interface OutputLine {
    cursor: number;
    category: string;
    text: string;
}

export interface OutputReadOptions {
    sinceCursor?: number;
    maxLines: number;
    filter?: RegExp;
    /** Only lines of these DAP output categories, e.g. "stdout". */
    categories?: string[];
}

export interface OutputReadResult {
    lines: OutputLine[];
    /** Pass as `sinceCursor` on the next call to receive only newer lines. */
    nextCursor: number;
    hasMore: boolean;
    /** True when lines after `sinceCursor` were already evicted from the buffer. */
    droppedLines: boolean;
}
