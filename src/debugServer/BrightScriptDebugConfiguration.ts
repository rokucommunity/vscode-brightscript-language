import { FilesType } from 'roku-deploy';

export interface BrightScriptDebugConfiguration {
    // The type of the debug session.
    type: string;
    // The name of the debug session.
    name: string;
    // The request type of the debug session.
    request: string;
    // Additional debug type specific properties.
    [key: string]: any;

    host: string;
    password: string;
    rootDir: string;
    sourceDirs?: string[];
    bsConst?: { [key: string]: boolean };
    componentLibrariesPort?; number;
    componentLibrariesOutDir: string;
    componentLibraries: ComponentLibraryConfig[];
    outDir: string;
    stopOnEntry: boolean;
    files?: FilesType[];
    consoleOutput: 'full' | 'normal';
    retainDeploymentArchive: boolean;
    injectRaleTrackerTask: boolean;
    raleTrackerTaskFileLocation: string;
    retainStagingFolder: boolean;
    clearOutputOnLaunch: boolean;
    selectOutputOnLogMessage: boolean;
    enableVariablesPanel: boolean;
    enableDebuggerAutoRecovery: boolean;
    stopDebuggerOnAppExit: boolean;
    packagePort: number;
    enableSocketDebugger: boolean;
    remotePort: number;
    envFile?: string;
    enableSourceMaps?: boolean;
}

export interface ComponentLibraryConfig {
    rootDir: string;
    /**
     * The filename for the package.
     */
    outFile: string;
    files: FilesType[];
    sourceDirs: string[];
    bsConst?: { [key: string]: boolean };
    injectRaleTrackerTask: boolean;
    raleTrackerTaskFileLocation: string;
}
