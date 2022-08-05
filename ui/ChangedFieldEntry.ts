import type { ODC } from 'roku-test-automation';

interface ChangedFieldEntry {
    ts: number; // Unix timestamp
    subtype: string;
    id: string;
    base?: ODC.BaseTypes;
    keyPath: string;
    value: any;
}

export type {
    ChangedFieldEntry
};
