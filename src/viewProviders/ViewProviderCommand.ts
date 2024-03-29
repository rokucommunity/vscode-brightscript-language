export enum ViewProviderCommand {
    getScreenshot = 'getScreenshot',
    getStoredNodeReferences = 'getStoredNodeReferences',
    getStoredRokuAppOverlays = 'getStoredRokuAppOverlays',
    getWorkspaceState = 'getWorkspaceState',
    openRokuFile = 'openRokuFile',
    deleteRokuFile = 'deleteRokuFile',
    runRokuAutomationConfig = 'runRokuAutomationConfig',
    sendMessageToWebviews = 'sendMessageToWebviews',
    setManualIpAddress = 'setManualIpAddress',
    setVscodeContext = 'setVscodeContext',
    updateWorkspaceState = 'updateWorkspaceState',
    stopRokuAutomationConfig = 'stopRokuAutomationConfig',
    storeRokuAppOverlays = 'storeRokuAppOverlays',
    storeRokuAutomationConfigs = 'storeRokuAutomationConfigs',
    viewReady = 'viewReady'
}
