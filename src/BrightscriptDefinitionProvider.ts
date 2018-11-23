import * as vscode from 'vscode';
import {
  CancellationToken, 
  Definition,
  DefinitionProvider, 
  Position, 
  TextDocument
} from 'vscode';

import { DefinitionRepository } from "./DefinitionRepository";

export default class BrightscriptDefinitionProvider implements DefinitionProvider {
  private repo: DefinitionRepository;

  constructor(repo: DefinitionRepository) {
    this.repo = repo;
  }

  public async provideDefinition(document: TextDocument, position: Position, token: CancellationToken): Promise<Definition> {
    await this.repo.sync();
    return Array.from(this.repo.find(document, position));
  }

}
