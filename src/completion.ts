import { CompletionItem, CompletionItemKind } from "vscode";

const Command = CompletionItemKind.Function;

export const BuiltinComplationItems: CompletionItem[] = [
  //WIP - can do way better than this!
  {
    label: "print",

    kind: Command,
  },
  {
    label: "createObject",
    kind: Command,
  },
];