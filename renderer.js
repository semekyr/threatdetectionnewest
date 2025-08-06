/* --- Initialize Document Elements --- */
const loginResponse = document.getElementById('login-response');
const cameraSection = document.getElementById('camera-section');
const modelList = document.getElementById('model-list');
const rulesList = document.getElementById('rules-list');
const alertsList = document.getElementById('alerts-list');

// Detection system variables
let detectionPollingInterval = null;
let framePollingIntervals = {};

const RECENT_ALERT_NUM = 10;

function initializePage() {
    const currentPage = window.location.pathname;

    if(currentPage.includes('login.html')){
        console.log('Login page loaded.')
    } else if(currentPage.includes('dashboard.html')){
        console.log('Dashboard loaded');
        loadCameras();
        loadAlerts(RECENT_ALERT_NUM);
        initializeDetectionSystem();
    } else if(currentPage.includes('model-manager.html')){
        console.log('Model Manager loaded')
        loadModels();
        downloadModels();
    } else if(currentPage.includes('rules.html')){
        console.log('Rule Configurations loaded');
        loadRules();
        loadClasses();
    } else if(currentPage.includes('alerts.html')){
        console.log('Alert configurations loaded');
        loadAlertConfigs();
        loadClasses();
    } else if(currentPage.includes('logs.html')){
        console.log('System Logs loaded')
        loadLogs();
    } else if(currentPage.includes('cameras.html')){
        console.log('Camera Manager Loaded');
        loadCameraList();
    }
}

function navigate(page){
    console.log(`Navigating to ${page}`)
    window.location.href = page;
}

/* --- Detection System --- */

async function initializeDetectionSystem() {
    console.log('Initializing detection system...');
    
    // Check current detection status
    const status = await window.electron.getDetectionStatus();
    updateDetectionUI(status);
    
    // Start polling for detection status
    startDetectionStatusPolling();
}

async function startDetectionStatusPolling() {
    if (detectionPollingInterval) {
        clearInterval(detectionPollingInterval);
    }
    
    detectionPollingInterval = setInterval(async () => {
        const status = await window.electron.getDetectionStatus();
        updateDetectionUI(status);
    }, 2000); // Poll every 2 seconds
}

function updateDetectionUI(status) {
    const startBtn = document.getElementById('startDetectionBtn');
    const stopBtn = document.getElementById('stopDetectionBtn');
    const statusIndicator = document.getElementById('detectionStatus');
    
    if (!startBtn || !stopBtn || !statusIndicator) return;
    
    if (status.status === 'running') {
        startBtn.style.display = 'none';
        stopBtn.style.display = 'inline-block';
        statusIndicator.textContent = 'Detection Running';
        statusIndicator.className = 'status-running';
        
        // Start polling for analyzed frames
        startFramePolling();
    } else {
        startBtn.style.display = 'inline-block';
        stopBtn.style.display = 'none';
        statusIndicator.textContent = 'Detection Stopped';
        statusIndicator.className = 'status-stopped';
        
        // Stop polling for analyzed frames
        stopFramePolling();
    }
}

async function startDetection() {
    console.log('Starting detection system...');
    const response = await window.electron.startDetection();
    
    if (response.success) {
        showMessage('Detection system started successfully!', 'success', 'detection-section');
    } else {
        showMessage(`Failed to start detection: ${response.message}`, 'error', 'detection-section');
    }
}

async function stopDetection() {
    console.log('Stopping detection system...');
    const response = await window.electron.stopDetection();
    
    if (response.success) {
        showMessage('Detection system stopped successfully!', 'success', 'detection-section');
    } else {
        showMessage(`Failed to stop detection: ${response.message}`, 'error', 'detection-section');
    }
}

function startFramePolling() {
    // Get all cameras and start polling for each
    const cameras = document.querySelectorAll('.video-feed');
    
    cameras.forEach(cameraDiv => {
        const cameraId = cameraDiv.title;
        if (cameraId && !framePollingIntervals[cameraId]) {
            framePollingIntervals[cameraId] = setInterval(async () => {
                await updateAnalyzedFrame(cameraId, cameraDiv);
            }, 100); // Poll every 100ms for smooth video
        }
    });
}

function stopFramePolling() {
    // Clear all frame polling intervals
    Object.values(framePollingIntervals).forEach(interval => {
        clearInterval(interval);
    });
    framePollingIntervals = {};
}

async function updateAnalyzedFrame(cameraId, cameraDiv) {
    try {
        const response = await window.electron.getAnalyzedFrame(cameraId);
        
        if (response.success) {
            // Update the camera feed with the analyzed frame
            const img = cameraDiv.querySelector('img');
            if (img) {
                img.src = `data:${response.contentType};base64,${response.data}`;
            }
        }
    } catch (error) {
        console.error('Failed to update analyzed frame:', error);
    }
}

/* ---Model Manager--- */
async function deleteModel(modelName){
    console.log('Deleting model...')
    const response = await window.electron.deleteModel(modelName);

    if (response.success) {
        showMessage('Model deleted successfully!', 'success', 'model-section');
        // Reload the models list to reflect the deletion
        loadModels();
    } else {
        showMessage(`Delete failed: ${response.message}`, 'error', 'model-section');
    }
}

async function loadModels(){
    console.log('Loading AI Models...')
    modelList.innerHTML = '';

    const models = await window.electron.getModelInfo();


    for(const model of models){
        const listItem = document.createElement('li');
        listItem.innerHTML = `<div class="model-item">
            <h3>${model.name}</h3>
            <p style="text-transform: capitalize;"><strong>Detectable Objects:</strong> ${model.objects.join(', ')}</p>
            <!-- <p><strong>Path:</strong> ${model.path}</p> -->
            <!-- <p><strong>Uploaded:</strong> ${new Date(model.uploadDate).toLocaleDateString()}</p> -->
            <div class="model-actions">
                <button onclick="deleteModel('${model.name}')" class="delete-btn">Delete</button>
                <button onclick="selectModel('${model.name}')" class="${model.active? "selected ":""}select-btn">${model.active? "Selected":"Select"}</button>
            </div>
        </div>`
        modelList.appendChild(listItem);
    }

}

async function selectModel(modelName){
    console.log("Model name: ", modelName, typeof modelName)
    const response = await window.electron.selectModel(modelName);

    if (response.success) {
        showMessage('Model selected successfully!', 'success', 'model-section');
        loadModels();
    } else {
        showMessage(`Selection failed: ${response.message}`, 'error', 'model-section');
    }
}


async function downloadModels(){
    await window.electron.downloadModels();
}

function uploadModel(event) {
    // Prevent form from submitting normally
    event.preventDefault();
    
    // Get form data
    const modelName = document.getElementById('model-name').value.trim();
    const modelObjects = document.getElementById('model-objects').value.trim();
    const modelPath = document.getElementById('model-path').value.trim();
    
    // Validate inputs
    if (!modelName || !modelObjects || !modelPath) {
        showMessage('Please fill in all fields', 'error', 'upload-section');
        return;
    }

    // Convert objects string to array (split by comma and trim whitespace)
    const objectsArray = modelObjects.split(',').map(obj => obj.trim()).filter(obj => obj.length > 0);

    const modelData = {
        name: modelName,
        objects: objectsArray,
        path: modelPath,
        uploadDate: new Date().toISOString(),
        status: 'uploading'
    }

    const submitButton = event.target.querySelector('button[type="submit"]');
    const originalText = submitButton.textContent;
    submitButton.textContent = 'Uploading...';
    submitButton.disabled = true;

    uploadModelToServer(modelData)
        .then(response => {
            if (response.success) {
                showMessage('Model uploaded successfully!', 'success', 'upload-section');
                // Reload the models list to show the new model
                loadModels();
                document.getElementById('model-form').reset();
            } else {
                showMessage(`Upload failed: ${response.message}`, 'error', 'upload-section');
            }
        })
        .catch(error => {
            console.error('Upload error:', error);
            showMessage('Upload failed. Please try again.', 'error', 'upload-section');
        })
        .finally(() => {
            // Reset button state
            submitButton.textContent = originalText;
            submitButton.disabled = false;
        });
}


async function uploadModelToServer(modelData) {
    try {
        const result = await window.electron.uploadModel(modelData);
        return result;
    } catch (error) {
        console.error('IPC communication error:', error);
        throw error;
    }
}

/* ---Login Page--- */

function login(event){
    loginResponse.innerText= '';
    event.preventDefault();
    const username = event.target.elements.username.value;
    const password = event.target.elements.password.value;
    console.log(`Login attempt with: Username: ${username}, Password: ${password}`);

    // Send login data to the main process
    window.electron.send('login', { username, password });

    // Simulate a successful login response
    window.electron.receive('login-success', (response) => {
        console.log('Login successful:', response);
        loginResponse.innerText = response.message;;
        window.location.href = '../html/dashboard.html';
    });

    // Simulate a failed login response
    window.electron.receive('login-failed', (response) => {
        console.error('Login failed:', response);
        loginResponse.innerText = response.message;
    })
}

function clearClientData(){
    localStorage.clear();
    sessionStorage.clear();
}

function redirectToLogin(){
    window.location.href='../html/login.html';
}

function logout() {
    clearClientData();
    redirectToLogin();
}


/* ---Dashboard--- */

async function loadCameras() {
    console.log('Loading cameras...');
    cameraSection.innerHTML = ''; // Clear existing content
    
    // Send request to get camera information
    const cameras = await window.electron.getCameras();

    if (!cameras || cameras.length === 0) {
        console.error('No cameras found or failed to load cameras.');
        cameraSection.innerHTML = '<p>No cameras available.</p>';
        return;
    }


    for (const camera of cameras){
        const cameraDiv = document.createElement('div');
        cameraDiv.className = 'video-feed';
        cameraDiv.title = `${camera.id}`
        if(camera.type === 'youtube')
            cameraDiv.innerHTML = `<iframe  src="${camera.source}"  frameborder="0" allow="autoplay" alt="${camera.alt}" allowfullscreen></iframe>`
        else if(camera.type === 'ip')
            cameraDiv.innerHTML = `<img src="${camera.source}" alt="${camera.alt}" >`
        else if(camera.type === 'file')
            cameraDiv.innerHTML = `<video src="${camera.source}" controls autoplay muted loop alt="${camera.alt}"></video>`
        else
            cameraDiv.innerHTML = `<div style="padding: 20px; text-align: center; color: #666;">Unsupported camera type: ${camera.type}</div>`

        cameraSection.appendChild(cameraDiv);

        cameraDiv.addEventListener('dblclick', function(e) {
            e.preventDefault();

            toggleZoom(cameraDiv);
        })
    }    
}

/* ------------------------------------------------------------------------ */

function toggleZoom(cameraDiv){

    if(cameraDiv.classList.contains('zoomed'))
        exitZoom(cameraDiv)
    else
        enterZoom(cameraDiv)
}

function enterZoom(cameraDiv){

    const existingZoomed = document.querySelector('.video-feed.zoomed');
    if (existingZoomed && existingZoomed !== cameraDiv) {
        exitZoom(existingZoomed);
    }

    cameraDiv.classList.add('zoomed');

    document.addEventListener('keydown', handleEscapeKey)

    document.getElementById('camera-section').scrollIntoView({ 
        behavior: 'smooth', 
        block: 'start' 
    });

    hideNonZoomedFeeds();
}

function exitZoom(cameraDiv){
    cameraDiv.classList.remove('zoomed')

    document.removeEventListener('keydown', handleEscapeKey);

    hideNonZoomedFeeds();
}

function handleEscapeKey(e) {
    if (e.key === 'Escape') {
        const zoomedContainer = document.querySelector('.video-feed.zoomed');
        if (zoomedContainer) {
            exitZoom(zoomedContainer);
        }
    }
}

function hideNonZoomedFeeds() {
    const cameraSection = document.getElementById('camera-section');
    if (!cameraSection) return;

    const hasZoomed = cameraSection.querySelector('.video-feed.zoomed');
    cameraSection.querySelectorAll('.video-feed').forEach(feed => {
        feed.style.display = hasZoomed && !feed.classList.contains('zoomed') ? 'none' : '';
    });
}

/* ------------------------------------------------------------------------ */


async function loadAlerts(num){
    console.log('Loading recent alerts...');
    const alertList = document.getElementById('recentAlerts');
    alertList.innerHTML = '';

    const recentAlerts = await window.electron.getInfluxAlerts(num);
        
    for(const alert of recentAlerts){
        const listItem = document.createElement('li')
        listItem.innerHTML = `[${new Date(alert.timestamp).toLocaleTimeString()}] ${alert.object} detected at ${alert.camera} (conf: ${alert.confidence})`

        alertList.appendChild(listItem); 
    }
}


/* ---Rule Configs--- */
async function addRule(event){
    console.log('Uploading rule...')

    event.preventDefault();
    const objectType = document.getElementById("object-type").value;
    const allDay = document.getElementById('all-day').checked;
    const id = Date.now().toString();

    let startTime = ''
    let endTime = ''

    if(allDay){
        startTime = '00:00'
        endTime = '23:59'
    } else {
        startTime = document.getElementById('start-time').value
        endTime = document.getElementById('end-time').value
    }

    
    if (!objectType || (!allDay && (!startTime || !endTime))){
        showMessage('Please fill in required fields', 'error', 'upload-section');
        return;
    }

    const rule = {
        objectType: objectType,
        startTime: startTime,
        endTime: endTime,
        id: id,
        allDay: allDay,
        enabled: true
    };



    const response = await window.electron.saveRule(rule);

    if (response.success) {
        showMessage('Rule added successfully!', 'success', 'upload-section');
        loadRules();

        document.querySelector('form').reset();
        toggleTimeInputs();
    } else {
        showMessage(`Upload failed: ${response.message}`, 'error', 'upload-section');
    }
}

async function loadRules(){
    rulesList.innerHTML = '';
    
    const model = await window.electron.getActiveModelInfo();
    if(!model)
        return;

    for(const rule of model.rules){
        const listItem = document.createElement('li');
        listItem.innerHTML = `
            <div class="rule-item">
                <p style="text-transform: capitalize;"><strong>Object:</strong> ${rule.objectType} </p>
                <strong>Start:</strong> ${rule.startTime} <br>
                <strong>End:</strong> ${rule.endTime}
            </div>
            <div class="rule-actions">
                    <label for="enabled-${rule.objectType}" style="display: inline-flex; align-items: center; margin-left: 10px;">
                        <input type="checkbox" id="enabled-${rule.objectType}" ${rule.enabled == true ? 'checked' : ''} 
                               onchange="toggleRuleEnabled('${rule.objectType}', this.checked)">
                        <span style="margin-left: 5px;">Enabled</span>
                    </label>
                    <button onclick="deleteRule('${rule.objectType}')" class="delete-btn">Delete</button>
            </div>
        `
        rulesList.appendChild(listItem);
    }
}


async function toggleRuleEnabled(objClass, enabled){

    const response = await window.electron.toggleRuleEnabled(objClass, enabled)

    if(response.success){
        showMessage(`Rule ${enabled ? 'enabled' : 'disabled'} successfully!`, 'success', 'display-section');
    } else {
        showMessage(`Failed to ${enabled ? 'enable' : 'disable'} rule: ${response.message}`, 'error', 'display-section');

        const checkbox = document.getElementById(`enabled-${objClass}`);
        if (checkbox) {
            checkbox.checked = !enabled;
        }
    }

}

async function deleteRule(objClass){
    console.log('Deleting rule:', objClass);
    const response = await window.electron.deleteRule(objClass);

    if (response.success) {
        showMessage('Rule deleted successfully!', 'success', 'display-section');
        // Reload the rules list to reflect the deletion
        loadRules();
    } else {
        showMessage(`Delete failed: ${response.message}`, 'error', 'display-section');
    }
}


async function loadClasses(){
    const select = document.getElementById('object-type')
    select.innerHTML = ''

    const model = await window.electron.getActiveModelInfo()
    if(!model)
        return;

    const classes = []

    model.objects.forEach(item => {
        if(!classes.includes(item))
            classes.push(item)
    })
    

    for(const cl of classes){
        const option = document.createElement('option')

        option.value = cl
        option.innerText = cl.charAt(0).toUpperCase() + cl.slice(1)

        select.appendChild(option)
    }
}

function toggleTimeInputs(){
    const allDayCheckbox = document.getElementById('all-day');
    const startTimeInput = document.getElementById('start-time');
    const endTimeInput = document.getElementById('end-time');

    if(allDayCheckbox.checked){

        startTimeInput.disabled = true
        endTimeInput.disabled = true
        startTimeInput.value = ''
        endTimeInput.value = ''

        startTimeInput.removeAttribute('required')
        endTimeInput.removeAttribute('required')
    } else{

        startTimeInput.disabled = false
        endTimeInput.disabled = false

        startTimeInput.setAttribute('required', '')
        endTimeInput.setAttribute('required', '')
    }
}


/* ---Alert Configurations--- */

async function addAlertConfig(event) {
    event.preventDefault();

    const objectType = document.getElementById('object-type').value.trim();
    const email = document.getElementById('alert-email').value.trim();
    const viber = document.getElementById('alert-viber').value.trim();
    const api = document.getElementById('alert-api').value.trim();

    if(!objectType || !email && !viber && !api){
        showMessage('Information missing', 'error', 'upload-section')
        return;
    }

    const config = {
        objectType,
        channels: {
            email,
            viber,
            api
        }
    }

    const response = await window.electron.saveAlertConfig(config);
    
    if(response.success){
        showMessage('Alert configuration saved successfully', 'success', 'upload-section')
        loadAlertConfigs();
    } else {
        showMessage(`Error: ${response.message}`, 'error', 'upload-section')
    }
}


async function loadAlertConfigs(){
    alertsList.innerHTML='';
    
    const modelInfo = await window.electron.getActiveModelInfo();
    const configs = modelInfo.alerts;

    console.log(configs)

    for(const config of configs){
        const li = document.createElement('li');
        li.innerHTML = `<span class="info"><strong>Object:</strong> <span style="text-transform: capitalize;">${config.objectType}</span> <br>
        <strong>Email:</strong> ${config.channels.email || 'None'}<br>
        <strong>Viber:</strong> ${config.channels.viber || 'None'}<br>
        <strong>API:</strong> ${config.channels.api || 'None'}<br>
        <strong>Confidence Threshold:</strong> ${config.confidence_min}</span>
        <div class="alert-actions">
            <label for="enabled-${config.objectType}" style="display: inline-flex; align-items: center; margin-left: 10px;">
                <input type="checkbox" id="enabled-${config.objectType}" ${config.enabled == true ? 'checked' : ''} 
                    onchange="toggleAlertEnabled('${config.objectType}', this.checked)">
                    <span style="margin-left: 5px;">Enabled</span>
            </label>
            <button class="delete-btn" onclick="deleteConfig('${config.objectType}')">Delete</button>
        </div>`
        alertsList.appendChild(li);
    }
}

async function deleteConfig(objectType){
    const response = await window.electron.deleteAlertConfig(objectType);

    if(response.success){
        showMessage('Alert configuration deleted successfully', 'success', 'display-section')
        loadAlertConfigs();
    } else {
        showMessage(`Error: ${response.message}`, 'error', 'display-section')
    }
}


async function toggleAlertEnabled(objectType, enabled){
    const response = await window.electron.toggleAlertEnabled(objectType, enabled);

    if(response.success){
        showMessage('Alert configuration toggled successfully', 'success', 'display-section')
        loadAlertConfigs();
    } else {
        showMessage(`Error: ${response.message}`, 'error', 'display-section')
    }
}

/* --- Logs --- */

async function loadLogs() {
  const logsList = document.getElementById('logs-list');
  const filterType = document.getElementById('log-filter')?.value || 'all';
  if (!logsList) return;
  logsList.innerHTML = '';

  const logs = await window.electron.getSystemLogs();

  const filtered = filterType === 'all' ? logs : logs.filter(l => l.type === filterType);

  filtered.forEach(log => {
    const li = document.createElement('li');
    li.id = `${log.type}`;
    li.textContent = `[${new Date(log.timestamp).toLocaleString()}] (${log.type.toUpperCase()}) ${log.message}`;
    logsList.appendChild(li);
  });
}

async function exportLogs() {
  const logs = await window.electron.getSystemLogs();
  const blob = new Blob([JSON.stringify(logs, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `system-logs-${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}


/* --- Camera Configurations --- */


async function addCamera(event){
    event.preventDefault();

    const id = document.getElementById('camera-id');
    const type = document.getElementById('camera-type');
    const source = document.getElementById('camera-src');
    const description = document.getElementById('camera-desc');
    const alt = document.getElementById('camera-alt');
    const mode = document.getElementById('camera-form-mode').value;


    if(!alt || alt == '')
        alt = description

    if(!id || !source)
        return;

    const camera = {
        id: id.value, 
        type: type.value,
        source: source.value, 
        description: description.value, 
        alt: alt.value
    };

    let response;
    if(mode == 'edit')
        response = await window.electron.updateCamera(camera);
    else
        response = await window.electron.saveCmera(camera);

    if(response.success){
        showMessage(response.message, 'success', 'add-camera-section');
        loadCameraList();
        document.querySelector('form').reset();
        id.disabled = false;
        document.getElementById('camera-form-mode').value = 'add';
    }
    else{
        showMessage(response.message, 'error', 'add-camera-section');
    }
}

async function loadCameraList() {
  const list = document.getElementById('camera-list');
  if (!list) return;

  list.innerHTML = '';
  const cameras = await window.electron.getCameras();

  cameras.forEach(cam => {
    const li = document.createElement('li');

    li.innerHTML = `<div class="list-item">
            <h3>${cam.id}</h3>
            <p><strong>Camera Type:</strong> ${cam.type}</p>
            <p><strong>Source:</strong> ${cam.source}</p>
            <p><strong>Description:</strong> ${cam.description || 'No description'}</p>
            <div class="cam-actions">
            <button onclick="deleteCam('${cam.id}')" class="delete-btn">Delete</button>
            <button onclick='editCamera(${JSON.stringify(cam)})' class="edit-btn delete-btn">Edit</button>
            </div>
        </div>`
    list.appendChild(li);
  });
}

async function deleteCam(cameraId){
    if(!cameraId)
        return;

    const response = await window.electron.deleteCam(cameraId)

    if(response.success){
        showMessage(response.message, 'success', 'camera-section')
        loadCameraList();
    } else {
        showMessage(response.message, 'error', 'camera-section')
    }
}

function editCamera(cam) {
    // Fill form inputs with camera data
    document.getElementById('camera-id').value = cam.id;
    document.getElementById('camera-id').disabled = true; // Prevent changing ID
    document.getElementById('camera-type').value = cam.type;
    document.getElementById('camera-src').value = cam.source;
    document.getElementById('camera-desc').value = cam.description;
    document.getElementById('camera-alt').value = cam.alt;

    // Store a flag to indicate we're in edit mode
    document.getElementById('camera-form-mode').value = 'edit';

    // Scroll into view
    document.getElementById('add-camera-section').scrollIntoView({
    behavior: 'smooth',
    block: 'start'
    });
}


function showMessage(message, type = 'info', positionID) {
    // Remove existing message if any
    const existingMessage = document.querySelector('.message');
    if (existingMessage) {
        existingMessage.remove();
    }
    
    // Create message element
    const messageDiv = document.createElement('div');
    messageDiv.className = `message message-${type}`;
    messageDiv.textContent = message;
    
    // Insert message at top of first section
    const section = document.getElementById(positionID);
    section.insertBefore(messageDiv, section.firstChild);
    
    // Auto-remove message after 5 seconds
    setTimeout(() => {
        if (messageDiv.parentNode) {
            messageDiv.remove();
        }
    }, 5000);
}


document.addEventListener('DOMContentLoaded', initializePage);