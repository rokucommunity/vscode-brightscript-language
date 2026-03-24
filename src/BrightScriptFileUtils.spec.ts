import { assert } from 'chai';

import BrightScriptFileUtils from './BrightScriptFileUtils';

describe('BrightScriptFileUtils ', () => {
    let fileUtils: BrightScriptFileUtils;

    beforeEach(() => {
        fileUtils = new BrightScriptFileUtils();
    });

    describe('getParentComponentName ', () => {
        it('returns the extends value from a single-line component tag', () => {
            const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<component name="HomeView" extends="BaseScreen">`;
            assert.equal(fileUtils.getParentComponentName(xml), 'BaseScreen');
        });

        it('returns the extends value from a multi-line component tag', () => {
            const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<component name="HomeView"\n  extends="BaseScreen"\n  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">`;
            assert.equal(fileUtils.getParentComponentName(xml), 'BaseScreen');
        });

        it('returns undefined when no extends attribute', () => {
            const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<component name="HomeView">`;
            assert.isUndefined(fileUtils.getParentComponentName(xml));
        });

        it('handles single-quoted extends value', () => {
            const xml = `<component name="HomeView" extends='BaseScreen'>`;
            assert.equal(fileUtils.getParentComponentName(xml), 'BaseScreen');
        });
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
