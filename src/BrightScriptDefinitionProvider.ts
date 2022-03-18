import type {
    CancellationToken,
    Definition,
    DefinitionProvider,
    Position,
    TextDocument
} from 'vscode';

import type { DefinitionRepository } from './DefinitionRepository';

export default class BrightScriptDefinitionProvider implements DefinitionProvider {

    constructor(repo: DefinitionRepository) {
        this.repo = repo;
    }

    private repo: DefinitionRepository;

    public async provideDefinition(document: TextDocument, position: Position, token: CancellationToken): Promise<Definition> {
        await this.repo.sync();
        return Array.from(this.repo.find(document, position));
    }

}
