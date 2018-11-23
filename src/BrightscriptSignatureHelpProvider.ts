import {
  TextDocument,
  SignatureHelpProvider,
  SignatureHelp,
  CancellationToken,
  SignatureInformation,
  ParameterInformation,
  ProviderResult, Position, DefinitionProvider, MarkdownString
} from "vscode";
import { DefinitionRepository } from "./DefinitionRepository";
import { BrightscriptDeclaration } from "./BrightscriptDeclaration";
import BrightscriptDefinitionProvider from "./BrightscriptDefinitionProvider";

export default class BrightscriptSignatureHelpProvider implements SignatureHelpProvider {
  definitionRepo: DefinitionRepository;

  public constructor(provider: DefinitionRepository) {
    console.log("<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<11");
    this.definitionRepo = provider;
  }
  //1. Get symbold
  //2. Get param
  //
  //
  public async provideSignatureHelp(document: TextDocument, position: Position, token: CancellationToken): Promise<SignatureHelp> {
    //TODO make sure we're on the definition, not the space, or after it.. 
    const adjustedPosition = new Position(position.line, position.character - 1);
    let definition: any;
    //   return {
    //     activeParameter: 0,
    //     activeSignature: 0,
    //     signatures: [{
    //         label: "LABEL",
    //         parameters: [
    //             {
    //                 label: "PARAM_LABEL",
    //                 documentation: "PARAM_DOC",
    //             }
    //         ]
    //     }]
    // };
    while (definition = await this.definitionRepo.findDefinition(document, adjustedPosition).next()) {
      let signatureHelp = new SignatureHelp();
      let signatureInfo = new SignatureInformation(definition.value.name + "(" +definition.value.params.join(", ")+")");

      let params: ParameterInformation[] = [];
      definition.value.params.forEach(param => params.push(new ParameterInformation(param, param)));
      signatureInfo.parameters = params;

      signatureHelp.signatures.push(signatureInfo);
      signatureHelp.activeParameter = 0;
      signatureHelp.activeSignature = 0;
      return signatureHelp;
    }
    return undefined;
  }
}  