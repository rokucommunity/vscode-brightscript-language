export enum ViewProviderEvent {
    onDeviceConnectionChanged = 'onDeviceConnectionChanged',
    onNodeFocused = 'onNodeFocused',
    onDeviceAvailabilityChange = 'onDeviceAvailabilityChange',
    onVscodeCommandReceived = 'onVscodeCommandReceived',
    onRegistryUpdated = 'onRegistryUpdated',
    onStoredAppUIUpdated = 'onStoredAppUIUpdated',
    onRokuAutomationConfigsLoaded = 'onRokuAutomationConfigsLoaded',
    onRokuAutomationImportAllAutomations = 'onRokuAutomationImportAllAutomations',
    onRokuAutomationExportAllAutomations = 'onRokuAutomationExportAllAutomations',
    onRokuAutomationConfigStepChange = 'onRokuAutomationConfigStepChange',
    onRokuAutomationKeyPressed = 'onRokuAutomationKeyPressed',
    onRokuAppOverlayAdded = 'onRokuAppOverlayAdded',
    onRokuAppOverlayThumbnailsLoaded = 'onRokuAppOverlayThumbnailsLoaded',
    onRemoteControlModeChanged = 'onRemoteControlModeChanged',
    onVscodeContextSet = 'onVscodeContextSet'
}
