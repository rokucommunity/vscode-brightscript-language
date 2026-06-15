export enum ViewProviderEvent {
    onNodeFocused = 'onNodeFocused',
    onDeviceAvailabilityChange = 'onDeviceAvailabilityChange',
    onVscodeCommandReceived = 'onVscodeCommandReceived',
    onRegistryUpdated = 'onRegistryUpdated',
    onSolidDevtoolsDebugSessionStarted = 'onSolidDevtoolsDebugSessionStarted',
    onSolidDevtoolsPerfSample = 'onSolidDevtoolsPerfSample',
    onStoredAppUIUpdated = 'onStoredAppUIUpdated',
    onRokuAutomationConfigsLoaded = 'onRokuAutomationConfigsLoaded',
    onRokuAutomationImportAllAutomations = 'onRokuAutomationImportAllAutomations',
    onRokuAutomationExportAllAutomations = 'onRokuAutomationExportAllAutomations',
    onRokuAutomationConfigStepChange = 'onRokuAutomationConfigStepChange',
    onRokuAutomationKeyPressed = 'onRokuAutomationKeyPressed',
    onRokuAppOverlayAdded = 'onRokuAppOverlayAdded',
    onRokuAppOverlayThumbnailsLoaded = 'onRokuAppOverlayThumbnailsLoaded',
    onVscodeContextSet = 'onVscodeContextSet'
}
