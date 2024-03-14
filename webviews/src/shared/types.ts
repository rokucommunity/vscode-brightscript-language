import type { odc } from '../ExtensionIntermediary';
import type { TreeNode, BaseType } from 'roku-test-automation';
export type PathContentsInfo = Omit<Partial<Awaited<ReturnType<typeof odc.statPath>>>, 'type'> & {
    name: string;
    path: string;
    type?: 'file' | 'directory' | 'fileSystem';
};

export type TreeNodeWithBase = Partial<TreeNode> & {
    base: keyof typeof BaseType;
};
