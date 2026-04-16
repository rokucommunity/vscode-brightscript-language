import type { BaseType } from 'roku-test-automation';

interface ChangedFieldEntry {
    ts: number; // Unix timestamp
    subtype: string;
    id: string;
    base?: BaseType;
    keyPath: string;
    value: any;
}

export type {
    ChangedFieldEntry
};
