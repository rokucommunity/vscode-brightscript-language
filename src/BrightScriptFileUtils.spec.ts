import { assert } from 'chai';

import BrightScriptFileUtils from './BrightScriptFileUtils';

describe('BrightScriptFileUtils ', () => {
    let fileUtils: BrightScriptFileUtils;

    beforeEach(() => {
        fileUtils = new BrightScriptFileUtils();
    });

    describe('getAlternateFileName ', () => {
        it('ascertains brs file from xml', () => {
            let fileName = '/test/myFile.xml';
            assert.equal(fileUtils.getAlternateFileName(fileName), '/test/myFile.brs');
        });

        it('ascertains xml file from brs', () => {
            let fileName = '/test/myFile.brs';
            assert.equal(fileUtils.getAlternateFileName(fileName), '/test/myFile.xml');
        });

        it('handles undefined input', () => {
            assert.isUndefined(fileUtils.getAlternateFileName(undefined));
        });

        it('handles unknonwn filetypes', () => {
            let fileName = '/test/myFile.json';
            assert.isUndefined(fileUtils.getAlternateFileName(fileName));
        });

    });
});
