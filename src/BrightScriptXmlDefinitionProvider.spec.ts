/* tslint:disable:no-unused-expression */
/* tslint:disable:no-var-requires */
import { assert } from 'chai';
import * as sinon from 'sinon';

let Module = require('module');

import { vscode } from './mockVscode.spec';

//override the "require" call to mock certain items
const { require: oldRequire } = Module.prototype;

Module.prototype.require = function hijacked(file) {
    if (file === 'vscode') {
        return vscode;
    } else {
        return oldRequire.apply(this, arguments);
    }
};

import BrightScriptXmlDefinitionProvider from './BrightScriptXmlDefinitionProvider';

describe('BrightScriptXmlDefinitionProvider', () => {

    let xmlText = `<?xml version="1.0" encoding="UTF-8"?>
<component name="HomeView"
  extends="BaseScreen"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:noNamespaceSchemaLocation="https://devtools.web.roku.com/schema/RokuSceneGraph.xsd">
  <interface>
    <field id="title" type="string" onChange="onTitleChange" />
      <function name="showDialog" />
    </interface>

  <script type="text/brightscript" uri="HomeView.brs" />
  <script type="text/brightscript" uri="pkg:/folder/subfolder/Utils.brs" />

  <children>
    <NavItem id="navItem"
      name="HOME" />
    <LayoutGroup>
      <Label text="Home view" />
    </LayoutGroup>

  </children>

</component>`;

    let illegalXmlText = `<?xml version="1.0" encoding="UTF-8"?>
<component name="HomeView"
  extends="BaseScreen"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:noNamespaceSchemaLocation="https://devtools.web.roku.com/schema/RokuSceneGraph.xsd">
  <interface>
    <field id="title" type="string" onChange="onTitleChange">
      <function name="showDialog">

  <script type="text/brightscript" uri="HomeView.brs" />
  <script type="text/brightscript" uri="pkg:/folder/subfolder/Utils.brs" />

    <NavItem id="navItem"
      name="HOME" />
    <LayoutGroup>
      <Label text="Home view" />
    </LayoutGroup>

  </children>

</component>`;

    let provider: BrightScriptXmlDefinitionProvider;
    let providerMock;
    let definitionRepo;
    let definitionRepoMock;
    let languagesMock;

    beforeEach(() => {
        definitionRepo = {
            findDefinition: () => { },
            sync: () => Promise.resolve()
        };
        definitionRepoMock = sinon.mock(definitionRepo);

        provider = new BrightScriptXmlDefinitionProvider(definitionRepo);
        providerMock = sinon.mock(provider);
        languagesMock = sinon.mock(vscode.languages);
    });

    afterEach(() => {
        languagesMock.restore();
        definitionRepoMock.restore();
        providerMock.restore();
    });

    describe('provideDefinition ', () => {
        it('does nothing when no wrong doc type', async () => {
            let position: any = new vscode.Position(1, 1);
            let textDocument: any = new vscode.TextDocument('invalid.brs');
            let result = await provider.provideDefinition(textDocument, position, undefined);

            assert.isEmpty(result);

            languagesMock.verify();
            providerMock.verify();
            definitionRepoMock.verify();
        });

        it('does nothing when has empty xml', async () => {
            let position: any = new vscode.Position(1, 1);
            let textDocument: any = new vscode.TextDocument('invalid.brs', '');
            let result = await provider.provideDefinition(textDocument, position, undefined);

            assert.isEmpty(result);

            languagesMock.verify();
            providerMock.verify();
            definitionRepoMock.verify();
        });

        it('does nothing when has illegal xml', async () => {
            let position: any = new vscode.Position(1, 1);
            let textDocument: any = new vscode.TextDocument('invalid.brs', illegalXmlText);
            let result = await provider.provideDefinition(textDocument, position, undefined);

            assert.isEmpty(result);

            languagesMock.verify();
            providerMock.verify();
            definitionRepoMock.verify();
        });

        it('will return xml file reference for a custom component', async () => {
            let position = new vscode.Position(1, 1);
            let textDocument = new vscode.TextDocument('valid.xml', xmlText);
            let result = await provider.provideDefinition(<any>textDocument, <any>position, undefined);

            assert.isEmpty(result);

            languagesMock.verify();
            providerMock.verify();
            definitionRepoMock.verify();
        });

    });
});
