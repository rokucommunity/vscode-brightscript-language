import type { odc } from '../ExtensionIntermediary';
import type { AppUIResponseChild } from 'roku-test-automation';
export type PathContentsInfo = Omit<Partial<Awaited<ReturnType<typeof odc.statPath>>>, 'type'> & {
    name: string;
    path: string;
    type?: 'file' | 'directory' | 'fileSystem';
};

export type AppUIResponseChildWithAppUIKeyPath = AppUIResponseChild & {
    appUIKeyPath?: string;
};
