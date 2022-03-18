import type {
    CancellationToken,
    SignatureHelpProvider,
    TextDocument
} from 'vscode';
import {
    ParameterInformation,
    Position,
    Range,
    SignatureHelp,
    SignatureInformation
} from 'vscode';

import type { DefinitionRepository } from './DefinitionRepository';

export default class BrightScriptSignatureHelpProvider implements SignatureHelpProvider {

    public constructor(provider: DefinitionRepository) {
        this.definitionRepo = provider;
    }

    public definitionRepo: DefinitionRepository;

    public provideSignatureHelp(document: TextDocument, position: Position, token: CancellationToken): SignatureHelp {
        //TODO - use AST/Parse tree to get the position of a symbol to our left
        //1. get first bracket to our left, - then get the symbol before that..
        //really crude crappy parser..
        //TODO this is whack - it's not even LTR ugh..
        let bracketCounts = { normal: 0, square: 0, curly: 0 };
        let commaCount = 0;
        let index = position.character;
        let line = document.getText(new Range(position.line, 0, position.line, position.character));
        let isArgStartFound = false;
        while (index >= 0) {
            if (isArgStartFound) {
                if (line.charAt(index) !== ' ') {
                    break;
                }
            } else {
                if (line.charAt(index) === ')') {
                    bracketCounts.normal++;
                }
                if (line.charAt(index) === ']') {
                    bracketCounts.square++;
                }
                if (line.charAt(index) === '}') {
                    bracketCounts.curly++;
                }
                if (line.charAt(index) === ',' && bracketCounts.normal <= 0 && bracketCounts.curly <= 0 && bracketCounts.square <= 0) {
                    commaCount++;
                }

                if (line.charAt(index) === '(') {
                    if (bracketCounts.normal === 0) {
                        isArgStartFound = true;
                    } else {
                        bracketCounts.normal--;
                    }
                }
                if (line.charAt(index) === '[') {
                    bracketCounts.square--;
                }
                if (line.charAt(index) === '{') {
                    bracketCounts.curly--;
                }
            }
            index--;
        }
        if (index === 0) {
            return undefined;
        }

        //count number of commas from defintion start, to current pos
        const adjustedPosition = new Position(position.line, index - 1);
        let definition = this.definitionRepo.findDefinition(document, adjustedPosition).next();
        if (definition) {
            let signatureHelp = new SignatureHelp();

            let params: ParameterInformation[] = [];
            let paramNames: string[] = [];
            for (const param of definition.value.params) {
                let paramName: string = param.trim();
                let infoText = '';
                let infoIndex = param.indexOf('=');
                let hasDefault = infoIndex !== -1;
                if (infoIndex === -1) {
                    infoIndex = param.indexOf(' as');
                }
                if (infoIndex !== -1) {
                    paramName = param.substring(0, infoIndex).trim();
                    infoText = param.substring(infoIndex).trim();
                    if (hasDefault) {
                        infoText = infoText.replace('=', 'default:');
                    }
                }
                paramNames.push(paramName);
                params.push(new ParameterInformation(paramName, infoText));
            }
            let signatureInfo = new SignatureInformation(definition.value.name + '(' + paramNames.join(', ') + ')');
            signatureInfo.parameters = params;

            signatureHelp.signatures.push(signatureInfo);
            signatureHelp.activeParameter = commaCount;
            signatureHelp.activeSignature = 0;
            return signatureHelp;
        }
        return undefined;
    }
}
