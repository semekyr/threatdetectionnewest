const {contextBridge, ipcRenderer} = require('electron');

contextBridge.exposeInMainWorld('electron', {
    send: (channel, data) => {
        // whitelist channels
        let validChannels = ['login', 'logout'];
        if (validChannels.includes(channel)) {
            ipcRenderer.send(channel, data);
        }
    },
    receive: (channel, func) => {
        let validChannels = ['login-success', 'logout-success', 'login-failed'];
        if (validChannels.includes(channel)) {
            ipcRenderer.on(channel, (event, ...args) => func(...args));
        }
    },

    
    getCameras: () => ipcRenderer.invoke('get-cameras'),
    getInfluxAlerts: (num) => ipcRenderer.invoke('get-influx-alerts', num),
    getModelInfo: () => ipcRenderer.invoke('get-model-info'),
    getActiveModelInfo: () => ipcRenderer.invoke('get-active-model-info'),
    // getRules: () => ipcRenderer.invoke('get-rules'),
    getAlertConfigs: () => ipcRenderer.invoke('get-alert-configs'),
    getSystemLogs: () => ipcRenderer.invoke('get-system-logs'),
    getReportData: () => ipcRenderer.invoke('get-report-data'),

    uploadModel: (modelData) => ipcRenderer.invoke('upload-model', modelData),
    deleteModel: (modelName) => ipcRenderer.invoke('delete-model', modelName),
    saveRule: (rule) => ipcRenderer.invoke('save-rule', rule),
    deleteRule: (objClass) => ipcRenderer.invoke('delete-rule', objClass),
    saveAlertConfig: (config) => ipcRenderer.invoke('save-alert-config', config),
    deleteAlertConfig: (objectType) => ipcRenderer.invoke('delete-alert-config', objectType),
    saveCamera: (camera) => ipcRenderer.invoke('save-camera', camera),
    deleteCam: (cameraId) => ipcRenderer.invoke('delete-camera', (cameraId)),
    toggleRuleEnabled: (objClass, enabled) => ipcRenderer.invoke('toggle-rule-enable', objClass, enabled),
    downloadModels: () => ipcRenderer.invoke('download-models'),
    selectModel: (modelName) => ipcRenderer.invoke('select-model', modelName),
    toggleAlertEnabled: (objectType, enabled) => ipcRenderer.invoke('toggle-alert-enable', objectType, enabled),
    updateCamera: (camera) => ipcRenderer.invoke('update-camera', camera),
    
    // Detection system handlers
    startDetection: () => ipcRenderer.invoke('start-detection'),
    stopDetection: () => ipcRenderer.invoke('stop-detection'),
    getDetectionStatus: () => ipcRenderer.invoke('get-detection-status'),
    getAnalyzedFrame: (cameraId) => ipcRenderer.invoke('get-analyzed-frame', cameraId),
    getCameraStatus: () => ipcRenderer.invoke('get-camera-status'),
    getAlertStatus: () => ipcRenderer.invoke('get-alert-status'),
    restartDetection: () => ipcRenderer.invoke('restart-detection'),
});