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
            vscode.window.showInformationMessage('Project setup cancelled: No workspace folder selected');
            return;
        }

        // Get project name from user
        const projectName = await vscode.window.showInputBox({
            prompt: 'Enter the name for your new Roku project',
            validateInput: validateProjectName
        });

        if (!projectName) {
            vscode.window.showInformationMessage('Project setup cancelled: No project name provided');
            return;
        }

        const projectPath = path.join(workspaceFolder, projectName);

        // Check if project directory already exists
        if (await pathExists(projectPath)) {
            const overwrite = await vscode.window.showWarningMessage(
                `A directory named "${projectName}" already exists. Do you want to overwrite it?`,
                'Yes', 'No'
            );
            if (overwrite !== 'Yes') {
                vscode.window.showInformationMessage('Project setup cancelled: Directory already exists');
                return;
            }
        }

        // Create project structure and files
        await createProjectStructure(projectPath);
        await createProjectFiles(projectPath, projectName);
        await copyTemplateImages(context.extensionPath, projectPath);
        await createLaunchJson(projectPath);
        
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
 * Helper function to check if path exists
 */
async function pathExists(path: string): Promise<boolean> {
    try {
        await fs.promises.access(path);
        return true;
    } catch {
        return false;
    }
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
        'images',
        'locale'
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
            { src: 'splash-screen_hd.jpg', dest: 'splash-screen_hd.jpg' },
            { src: 'splash-screen_fhd.jpg', dest: 'splash-screen_fhd.jpg' },
            { src: 'channel-poster_fhd.png', dest: 'channel-poster_fhd.png' }
        ];

        // The source images are in the 'images' directory of the extension
        const sourceImagesPath = path.join(extensionPath, 'images');
        const targetImagesPath = path.join(projectPath, 'images');

        vscode.window.showInformationMessage(`Copying template images from ${sourceImagesPath} to ${targetImagesPath}`);

        for (const image of imageFiles) {
            try {
                const sourcePath = path.join(sourceImagesPath, image.src);
                const targetPath = path.join(targetImagesPath, image.dest);
                
                // Check if target image already exists
                if (await pathExists(targetPath)) {
                    const overwrite = await vscode.window.showWarningMessage(
                        `Image "${image.dest}" already exists. Do you want to overwrite it?`,
                        'Yes', 'No'
                    );
                    if (overwrite !== 'Yes') {
                        continue;
                    }
                }
                
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
 * Creates launch.json file for debugging configuration
 */
async function createLaunchJson(projectPath: string) {
    const vscodePath = path.join(projectPath, '.vscode');
    await fs.promises.mkdir(vscodePath, { recursive: true });

    const launchConfig = {
        version: '0.2.0',
        configurations: [
            {
                name: 'BrightScript Debug: Launch',
                type: 'brightscript',
                request: 'launch',
                host: '${promptForHost}',
                password: '${promptForPassword}',
                rootDir: '${workspaceFolder}',
                enableDebuggerAutoRecovery: false,
                stopOnEntry: false,
                enableDebugProtocol: true,
            }
        ]
    };

    const launchPath = path.join(vscodePath, 'launch.json');
    
    // Check if launch.json already exists
    if (await pathExists(launchPath)) {
        const overwrite = await vscode.window.showWarningMessage(
            'launch.json already exists. Do you want to overwrite it?',
            'Yes', 'No'
        );
        if (overwrite !== 'Yes') {
            return;
        }
    }

    await fs.promises.writeFile(
        launchPath,
        JSON.stringify(launchConfig, null, 4)
    );
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

mm_icon_focus_hd=pkg:/images/channel-poster_sd.png
mm_icon_focus_sd=pkg:/images/channel-poster_hd.png
mm_icon_focus_hd=pkg:/images/channel-poster_fhd.png


splash_screen_sd=pkg:/images/splash-screen_sd.jpg
splash_screen_hd=pkg:/images/splash-screen_hd.jpg
splash_screen_hd=pkg:/images/splash-screen_fhd.jpg


ui_resolutions=hd
    `.trim();

    // Create main.brs - Channel entry point
    const mainContent = `
' Main entry point
sub main(args as Dynamic)
    screen = CreateObject("roSGScreen")
    m.port = CreateObject("roMessagePort")
    screen.setMessagePort(m.port)
    
    scene = screen.CreateScene("MainScene")
    screen.show()
    
    while(true)
        msg = wait(0, m.port)
        if type(msg) = "roSGScreenEvent"
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

First, you'll need to configure your launch.json file for debugging. 

We have already set one up as default for you that will run if you Run in Debug mode (Ctrl+Shift+D or Cmd+Shift+D on Mac)

However if you want to setup one yourself, here's how to set it up:

In VS Code, go to the Run and Debug view (Ctrl+Shift+D or Cmd+Shift+D on Mac)
Click "create a launch.json file"
Select "BrightScript Debug: Launch" from the configuration dropdown
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
        const filePath = path.join(projectPath, file.path);
        
        // Check if file exists before writing
        if (await pathExists(filePath)) {
            const overwrite = await vscode.window.showWarningMessage(
                `File "${file.path}" already exists. Do you want to overwrite it?`,
                'Yes', 'No'
            );
            if (overwrite !== 'Yes') {
                continue;
            }
        }
        
        await fs.promises.writeFile(filePath, file.content);
    }
}