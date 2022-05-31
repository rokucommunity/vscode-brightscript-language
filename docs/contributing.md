---
priority: 1001
---
# Contributing

This extension depends on several other RokuCommunity projects.
 - [BrighterScript](https://github.com/RokuCommunity/brighterscript) - provides the language server and much of the realtime valdation you see when editing code.
 - [roku-debug](https://github.com/RokuCommunity/roku-debug) - Provides all the debug session functionality (like connecting via telnet, setting breakpoints, etc)
 - [roku-deploy](https://github.com/RokuCommunity/roku-deploy) - Handles the packaging of roku projects and other device tasks (like sending keyboard commands to the device)
 - [brighterscript-formatter](https://github.com/RokuCommunity/brighterscript-formatter) - Used to format code when the "Format Document" command is run in vscode.


Wiring all of these up manually is a bit tedious, so we provide a simple way to quickly get started:

### The easy way
In a terminal, execute
```bash
git clone https://github.com/rokucommunity/vscode-brightscript-language
cd vscode-brightscript-language
npm i
npm run install-local
```

This will do the following automatically for you:
 - Clone any missing repositories at the same folder level as this project.
 - Install and build each dependency
 - Update this project's `package.json` to point to the local projects using a relative file scheme (i.e. `"roku-deploy": "file:../roku-deploy"`)
 - delete each dependency's folder in this project's node_modules folder to prevent conflicts.
 - run `npm install` in the root of this project.

 To undo these changes, run
 ```bash
 npm run uninstall-local
 ```


### The manual way
You only need to install local copies of projects you actually want to work on. You can leave the others as npm modules. This workflow will show the process of installing all projects.

 1. Clone the following projects to the parent folder as this project. (i.e. `C:\projects\vscode-brightscript language`, `C:\projects\brighterscript`, etc...)
    - [brighterscript](https://github.com/RokuCommunity/brighterscript)
    - [brighterscript-formatter](https://github.com/RokuCommunity/brighterscript-formatter)
    - [roku-debug](https://github.com/RokuCommunity/roku-debug)
    - [roku-deploy](https://github.com/RokuCommunity/roku-deploy)

 1. Inside each of the cloned repositories, run
     ```bash
     npm install && npm run build
     ```
 1. In `vscode-brightscript-language/node_modules`, delete any folders matching the above project names
 1. Open `vscode-brightscript-language/package.json` and edit the `dependencies`to look like this:

    ```js
    {
      "dependencies": {
        //...
        "brighterscript": "file:../brighterscript",
        "brighterscript-formatter": "file:../brighterscript-formatter",
        "roku-debug": "file:../roku-debug",
        "roku-deploy": "file:../roku-debug",
        //...
      }
    }
    ```

 1. In the `vscode-brightscript-language` folder
    ```bash
    npm install && npm run build
    ```
 1. You're all set! Open the `vscode-brightscript-language` folder in vscode to start debugging. 

View our [developer guidelines](https://github.com/RokuCommunity/vscode-brightscript-language/blob/master/developer-guidelines.md) for more information on how to contribute to this extension.

You can also chat with us [on slack](https://join.slack.com/t/rokudevelopers/shared_invite/zt-4vw7rg6v-NH46oY7hTktpRIBM_zGvwA). (We're in the #vscode-bs-lang-ext channel).
