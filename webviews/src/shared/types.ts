import type { odc } from '../ExtensionIntermediary';
export type PathContentsInfo = Omit<Partial<Awaited<ReturnType<typeof odc.statPath>>>, 'type'> & {
    name: string;
    path: string;
    type?: 'file' | 'directory' | 'fileSystem';
};
