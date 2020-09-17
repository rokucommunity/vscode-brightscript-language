import { ProjectsViewTreeProvider } from "./ProjectTreeProvider";
import * as path from 'path';
import { standardizePath as s } from 'brighterscript';
import { expect } from "chai";
import { util } from "../util";
import { TreeItem } from "vscode";

const tempDir = s`${process.cwd()}/.tmp`;
const workspaceDir = s`${tempDir}/SitcomApp}`;
const rootDir = s`${tempDir}/SitcomApp/src`;

describe('ProjectsViewTreeProvider', () => {
    let provider: ProjectsViewTreeProvider;
    beforeEach(() => {
        provider = new ProjectsViewTreeProvider(null, null);
        util.clearIdsForKeys();
    });

    it('creates top-level project node', () => {
        provider.addProject('SitcomApp', workspaceDir, rootDir, []);
        treeEquals(provider, [{
            id: '1:/',
            label: 'SitcomApp',
            tooltip: rootDir
        }]);
    });

    it('creates nested folders for files', () => {
        provider.addProject('SitcomApp', workspaceDir, rootDir, [{
            src: s`${rootDir}/manifest`,
            dest: 'manifest'
        }, {
            src: s`${rootDir}/source/main.brs`,
            dest: 'source/main.brs'
        }, {
            src: s`${rootDir}/source/common/lib1.brs`,
            dest: 'source/common/lib1.brs'
        }, {
            src: s`${rootDir}/source/common/lib2.brs`,
            dest: 'source/common/lib2.brs'
        }]);

        treeEquals(provider, [{
            id: '1:/',
            label: 'SitcomApp',
            tooltip: rootDir,
            children: [{
                id: '1:/manifest',
                label: 'manifest',
                tooltip: s`${rootDir}/manifest`
            }, {
                id: '1:/source/',
                label: 'source',
                tooltip: undefined,
                children: [{
                    id: '1:/source/main.brs',
                    label: 'main.brs',
                    tooltip: s`${rootDir}/source/main.brs`
                }, {
                    id: '1:/source/common/',
                    label: 'common',
                    tooltip: undefined,
                    children: [{
                        id: '1:/source/common/lib1.brs',
                        label: 'lib1.brs',
                        tooltip: s`${rootDir}/source/common/lib1.brs`,
                    }, {
                        id: '1:/source/common/lib2.brs',
                        label: 'lib2.brs',
                        tooltip: s`${rootDir}/source/common/lib2.brs`,
                    }]
                }]
            }]
        }]);
    });


    function treeEquals(provider: ProjectsViewTreeProvider, expected) {
        //build a tree based on the entire collection of provider children
        let rootNodes = provider.getChildren() as TreeItem[];
        for (let rootNode of rootNodes) {
            getChildren(rootNode);
        }

        function getChildren(node) {
            let children = provider.getChildren(node);
            if (children) {
                node.children = children;
                for (let child of node.children ?? []) {
                    getChildren(child);
                }
            }
        }
        expect(rootNodes).to.eql(expected);
    }
});
