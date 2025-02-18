import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Creates a new Roku project with a standard directory structure and template files
 * @param context The extension context, used to access extension resources
 */
export async function createNewRokuProject(context: vscode.ExtensionContext) {
    try {
        // Get workspace folder or ask user to select a folder
        const workspaceFolder = await selectWorkspaceFolder();
        if (!workspaceFolder) {
            return;
        }

        // Get project name from user
        const projectName = await vscode.window.showInputBox({
            prompt: 'Enter the name for your new Roku project',
            validateInput: validateProjectName
        });

        if (!projectName) {
            return;
        }

        const projectPath = path.join(workspaceFolder, projectName);

        // Create project structure and files
        await createProjectStructure(projectPath);
        await createProjectFiles(projectPath, projectName);
        await copyTemplateImages(context.extensionPath, projectPath);
        
        // Open the new project in VS Code
        const uri = vscode.Uri.file(projectPath);
        await vscode.commands.executeCommand('vscode.openFolder', uri);
        
        vscode.window.showInformationMessage(`Successfully created new Roku project: ${projectName}`);
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to create project: ${error.message}`);
    }
}

/**
 * Validates the project name meets Roku naming requirements
 */
function validateProjectName(value: string): string | null {
    if (!value) {
        return 'Project name is required';
    }
    if (!/^[a-zA-Z0-9-_]+$/.test(value)) {
        return 'Project name must contain only letters, numbers, hyphens and underscores';
    }
    return null;
}

/**
 * Prompts user to select a workspace folder
 */
async function selectWorkspaceFolder(): Promise<string | undefined> {
    const options: vscode.OpenDialogOptions = {
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        title: 'Select folder for new Roku project'
    };

    const folderUri = await vscode.window.showOpenDialog(options);
    return folderUri?.[0]?.fsPath;
}

/**
 * Creates the basic project folder structure
 */
async function createProjectStructure(projectPath: string) {
    const folders = [
        '',
        'source',
        'components',
        'images'
    ];

    for (const folder of folders) {
        await fs.promises.mkdir(path.join(projectPath, folder), { recursive: true });
    }
}

/**
 * Copies template images from the extension's assets to the new project
 */
async function copyTemplateImages(extensionPath: string, projectPath: string) {
    try {
        const imageFiles = [
            { src: 'channel-poster_hd.png', dest: 'channel-poster_hd.png' },
            { src: 'channel-poster_sd.png', dest: 'channel-poster_sd.png' },
            { src: 'splash-screen_sd.jpg', dest: 'splash-screen_sd.jpg' },
            { src: 'splash-screen_hd.jpg', dest: 'splash-screen_hd.jpg' }
        ];

        // The source images are in the 'images' directory of the extension
        const sourceImagesPath = path.join(extensionPath, 'images');
        const targetImagesPath = path.join(projectPath, 'images');

        vscode.window.showInformationMessage(`Copying template images from ${sourceImagesPath} to ${targetImagesPath}`);

        for (const image of imageFiles) {
            try {
                const sourcePath = path.join(sourceImagesPath, image.src);
                const targetPath = path.join(targetImagesPath, image.dest);
                
                vscode.window.showInformationMessage(`Copying ${sourcePath} to ${targetPath}`);
                
                await fs.promises.copyFile(sourcePath, targetPath);
            } catch (error) {
                vscode.window.showWarningMessage(`Warning: Failed to copy template image ${image.src}: ${error.message}`);
            }
        }
    } catch (error) {
        throw new Error(`Failed to copy template images: ${error.message}`);
    }
}


/**
 * Creates all necessary project files with template content
 */
async function createProjectFiles(projectPath: string, projectName: string) {
    // Create manifest file
    const manifestContent = `
title=${projectName}
major_version=1
minor_version=0
build_version=0
mm_icon_focus_hd=pkg:/images/channel-poster_hd.png
mm_icon_focus_sd=pkg:/images/channel-poster_sd.png

splash_screen_sd=pkg:/images/splash-screen_sd.jpg
splash_screen_hd=pkg:/images/splash-screen_hd.jpg
splash_screen_fhd=pkg:/images/splash-screen_fhd.jpg

ui_resolutions=hd
    `.trim();

    // Create main.brs - Channel entry point
    const mainContent = `
' Main entry point
sub main(args as Dynamic)
    screen = CreateObject("roSGScreen")
    scene = screen.CreateScene("MainScene")
    screen.show()
    
    port = CreateObject("roMessagePort")
    screen.setMessagePort(port)
    
    while true
        msg = wait(0, port)
        msgType = type(msg)
        
        if msgType = "roSGScreenEvent"
            if msg.isScreenClosed()
                return
            end if
        end if
    end while
end sub
    `.trim();

    // Create MainScene.xml - Main scene component
    const mainSceneContent = `
<?xml version="1.0" encoding="utf-8" ?>
<component name="MainScene" extends="Scene">
    <script type="text/brightscript" uri="pkg:/components/MainScene.brs" />
    <children>
        <Label
            id="helloLabel"
            text="Hello World!"
            width="1280"
            height="720"
            horizAlign="center"
            vertAlign="center"
            font="font:LargeBoldSystemFont" />
    </children>
</component>
    `.trim();

    // Create MainScene.brs - Scene logic
    const mainSceneBrsContent = `
sub init()
    ' Initialize the scene
    m.helloLabel = m.top.findNode("helloLabel")
end sub

function onKeyEvent(key as String, press as Boolean) as Boolean
    handled = false
    
    if press
        if key = "back"
            ' Handle back button
            handled = true
        end if
    end if
    
    return handled
end function
    `.trim();

    // Create project documentation
    const readmeContent = `
# ${projectName}

A Roku BrightScript channel created with VS Code BrightScript extension.

## Project Structure

- \`source/\`: Contains BrightScript source files
- \`components/\`: Channel components and screens
- \`images/\`: Channel artwork and image assets


## Building and Deploying

Use the VS Code BrightScript extension commands to build and deploy your channel:

1. Press F1 or Ctrl+Shift+P
2. Search for "Roku: Deploy"
3. Follow the prompts to deploy to your development Roku device
    `.trim();

    // Create .gitignore
    const gitignoreContent = `
out/
dist/
.roku-deploy-staging/
*.zip
    `.trim();

    // Write all files
    const files = [
        { path: 'manifest', content: manifestContent },
        { path: 'source/main.brs', content: mainContent },
        { path: 'components/MainScene.xml', content: mainSceneContent },
        { path: 'components/MainScene.brs', content: mainSceneBrsContent },
        { path: 'README.md', content: readmeContent },
        { path: '.gitignore', content: gitignoreContent }
    ];

    for (const file of files) {
        await fs.promises.writeFile(
            path.join(projectPath, file.path),
            file.content
        );
    }
}