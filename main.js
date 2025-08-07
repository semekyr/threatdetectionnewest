/**
 * Electron Main Process File
 * ---------------------------
 * This file bootstraps the Electron app by creating the main window,
 * setting up the application menu, and handling IPC communications
 * between the frontend and backend.
 *
 * Major responsibilities:
 * - Manage Electron window lifecycle
 * - Handle model management (load, download, delete)
 * - Handle alert and rule configuration through InfluxDB
 * - IPC handlers for frontend-backend communication
 */

/* --- Importing required modules --- */
//require('dotenv').config({ path: './.env' });
const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const Database = require('./database.js');
const { Point } = require('@influxdata/influxdb-client');
const EmailSender = require('./EmailSender.js');
const yaml = require('js-yaml');
const { get } = require('https');
const axios = require('axios').default;
const isDev = !app.isPackaged;






/* --- Initialize paths and constants --- */
const CAMERA_PATH = isDev
    ? path.join(__dirname, 'configs/cameras.json')
    : path.join(process.resourcesPath, 'cameras.json');

const MODEL_PATH = isDev
    ? path.join(__dirname, 'fe-models')
    : path.join(process.resourcesPath, 'fe-models')



let mainWindow;
let sentAlertsCount = 12 //just for testing for now
loadEnvironmentVariables();

// Set axios base URL with fallback
axios.defaults.baseURL = process.env.BACKEND_BASE_URL || 'http://127.0.0.1:5000';


function loadEnvironmentVariables() {  
  let envPath;
  if (isDev) {
    // Development: .env file is in the project root (same directory as main.js)
    envPath = path.join(__dirname, '.env');
  } else {
    // Production: .env file is in the resources directory
    envPath = path.join(process.resourcesPath, '.env');
  }

  // Load environment variables if file exists
  if (fs.existsSync(envPath)) {
    require('dotenv').config({ path: envPath });
    console.log('Environment variables loaded from:', envPath);
  } else {
    console.warn('No .env file found at:', envPath);
    // Set default values for missing environment variables
    process.env.BACKEND_BASE_URL = process.env.BACKEND_BASE_URL || 'http://127.0.0.1:5000';
    process.env.BACKEND_API_KEY = process.env.BACKEND_API_KEY || 'efecd5a4-40ff-45df-b1d9-0e3256f2265d';
    process.env.INFLUX_URL = process.env.INFLUX_URL || 'http://localhost:8086';
    process.env.INFLUX_TOKEN = process.env.INFLUX_TOKEN || 'hlzFOUbqafa1O4NsyKTB7urMtBhTmfYGThK-9_meVF9cf-jmc9xvpzPlzMRldWeWxekLWGGqXA1q8phmV8hJ3Q==' ;
    process.env.INFLUX_ORG = process.env.INFLUX_ORG || 'SignalGeneriX';
    process.env.INFLUX_BUCKET = process.env.INFLUX_BUCKET || 'detectionAlerts';
  }
}




/* --- menu configuration --- */
const menuTemplate = [
    {
        label: "File",
        submenu: [
            {
                label: "Reload",
                role: "reload"
            },
            {
                label: "Quit",
                role: "quit"
            },
            // {
            //     label: "Send Daily Report",
            //     click: () => sendDailyReport()
            // }
        ]
    },
    {
        label: "Navigate",
        submenu: [
            {
                label: "Dashboard",
                click: () => {
                    navigateTo('html/dashboard.html');
                }
            },
            {
                label: "AI Model Manager",
                click: () => navigateTo('html/model-manager.html')
            },
            {
                label: "Detection Configurations",
                click: () => navigateTo('html/rules.html')
            },
            {
                label: "Alert Configurations",
                click: () => navigateTo('html/alerts.html')
            },
            {
                label: "System Logs",
                click: () => navigateTo('html/logs.html')
            },
            {
                label: "Camera Manager",
                click: () => navigateTo('html/cameras.html')
            }
            // Add the rest of the pages later....       
        ]
    }
]


/**
 * Function used to send a daily report containing basic info regarding the system.
 */
async function sendDailyReport() {

    const reportWindow = new BrowserWindow({
        show: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true
        }
    })

    /* Used for debugging */

    // reportWindow.webContents.on('before-input-event', (event, input) => {
    //     if (input.control && input.key.toLowerCase() === 'i') {
    //         reportWindow.webContents.toggleDevTools();
    //     }
    //     if (input.key === 'F12') {
    //     reportWindow.webContents.toggleDevTools();
    //     }
    // });

    await reportWindow.loadFile('html/daily-report.html')


    // Ensures that the page is correctly loaded before sending email
    const html = await reportWindow.webContents.executeJavaScript(`
    new Promise(resolve => {
      
        const handleReportReady = () => {
            window.removeEventListener('reportReady', handleReportReady)
            resolve(document.documentElement.outerHTML)    
        }

        window.addEventListener('reportReady', handleReportReady);

        // Fallback in case event never fires (20 secs)
        setTimeout(() => {
            window.removeEventListener('reportReady', handleReportReady);
            resolve(document.documentElement.outerHTML);
        }, 20000);
    });
    `);
    console.log('html code:\n' + html)

    const emailsender = new EmailSender();

    emailsender.setMailOptions(process.env.EMAIL_RECEIVERS, `Daily Report Test - ${new Date().toLocaleDateString()}`);
    emailsender.setMailBody(html);

    emailsender.send();

    reportWindow.close();
}

//Function to navigate to different page
function navigateTo(page) {
    mainWindow.loadFile(page)
}

// Function to create the main electron window
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
        }
    });

    mainWindow.loadFile('html/dashboard.html');

    mainWindow.webContents.on('did-finish-load', () => {
        const menu = Menu.buildFromTemplate(menuTemplate);
        Menu.setApplicationMenu(menu);
    });

    // Enable inspection with ctrl + i or F12
    mainWindow.webContents.on('before-input-event', (event, input) => {
        if (input.control && input.key.toLowerCase() === 'i') {
            mainWindow.webContents.toggleDevTools();
        }
        if (input.key === 'F12') {
            mainWindow.webContents.toggleDevTools();
        }

    });
}

// App lifecycle
app.whenReady().then(() => {
    createWindow();
    downloadModels();
})

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin')
        app.quit();
})



// ======================= IPC HANDLERS =========================
// Each handler below responds to frontend requests via ipcMain
// and performs appropriate async tasks (DB queries, file ops, etc)

ipcMain.on('login', (event, data) => {

    if (fs.existsSync(USERS_PATH)) {
        const users = JSON.parse(fs.readFileSync(USERS_PATH, 'utf-8'));
        const user = users.find(u => u.username === data.username && u.password === data.password);
        if (!user) {
            event.sender.send('login-failed', { message: 'Invalid username or password' });
            return;
        }
        event.sender.send('login-success', { message: 'Login successful', user: data.username, role: user.role });
    }
    else {
        event.sender.send('login-failed', { message: 'User database not found' });
    }
})


/**
 * Loads and returns the list of camera configurations.
 * Adds default values where needed.
 * 
 * @returns A list containg camera objects
 */
ipcMain.handle('get-cameras', async () => {
    if (!fs.existsSync(CAMERA_PATH))
        return [];

    const cameras = JSON.parse(fs.readFileSync(CAMERA_PATH, 'utf-8'));
    return cameras.map(camera => ({
        type: camera.type,
        source: camera.source,
        status: 'unknown',
        alt: camera.alt || 'Camera Feed',
        id: camera.id,
        description: camera.description
    }));
})


/**
 * Fetches a list of available model filenames from the backend API.
 *
 * Makes a GET request to the `/get-models` endpoint using the backend base URL
 * and includes the API key for authorization. Returns the result as a list
 * of model filenames (typically YAML configuration files).
 *
 * @returns {Promise<{ success: boolean, models: string[] }>}
 *          An object containing a success flag and an array of model filenames.
 */
async function getModels() {
    try {
        const response = await axios.get('/get-models', {
            responseType: 'json',
            headers: {
                'x-api-key': process.env.BACKEND_API_KEY || 'efecd5a4-40ff-45df-b1d9-0e3256f2265d'
            }
        });

        return {
            success: true,
            models: response.data
        };
    } catch (error) {
        console.error('Failed to fetch model list:', error);
        return {
            success: false,
            models: []
        };
    }
}

/**
 * Finds and returns the path of the currently active model configuration file.
 *
 * Iterates through all YAML model config files in the `fe-models` directory
 * and looks for the one with `yolov5_deepsort.main.active` set to true.
 *
 * @returns {Promise<string>} The file path of the active model config, or an empty string if none are active.
 */
async function getActiveModelPath() {
    const modelConfigFiles = getFilePaths(MODEL_PATH);
    if (!modelConfigFiles)
        return ""

    for (const filePath of modelConfigFiles) {
        try {
            const fileContents = fs.readFileSync(filePath, 'utf8');
            const config = yaml.load(fileContents);

            const active = config.yolov5_deepsort.main.active;
            if (active) {
                console.log(filePath)
                return filePath;
            }
        } catch (error) {
            console.error('Error reading config:', error.message);
        }
    }
}

/**
 * Downloads a model file from the backend and saves it to the local `fe-models` directory.
 *
 * Sends a GET request to `/download/<fileName>`, streams the file content, and writes it to disk.
 * Automatically creates the destination directory if it doesn't exist.
 *
 * @param {string} fileName - The name of the file to download.
 * @returns {Promise<string>} Resolves with the local path of the downloaded file.
 * @throws Will re-throw any error encountered during download or writing.
 */
async function downloadModelFile(fileName) {
    try {
        const destPath = isDev 
            ? path.join(__dirname, 'fe-models', fileName)
            : path.join(process.resourcesPath, 'fe-models', fileName);


        const dir = path.dirname(destPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        const response = await axios.get(`/download/${fileName}`, {
            responseType: 'stream',
            headers: {
                'x-api-key': process.env.BACKEND_API_KEY
            }
        });

        const writer = fs.createWriteStream(destPath);
        response.data.pipe(writer);

        return new Promise((resolve, reject) => {
            writer.on('finish', () => {
                console.log('Download complete:', destPath);
                resolve(destPath);
            });
            writer.on('error', reject);
        })
    } catch (error) {
        console.log(`Couldn't download file ${fileName}: `, error.message)
        throw error;
    }
}

/**
 * Returns an array of full paths for all entries in the specified directory.
 *
 * @param {string} dirPath - The path to the directory to read.
 * @returns {string[]} Array of full file and folder paths inside dirPath.
 *                   Returns an empty array if the directory can't be read.
 */
function getFilePaths(dirPath) {
    try {
        const files = fs.readdirSync(dirPath);
        console.log(files)
        return files.map(file => path.join(dirPath, file));
    } catch (error) {
        console.error('Error reading directory:', error);
        return [];
    }
}

/**
 * Downloads all model files listed by `getModels` and returns the result for each.
 *
 * @async
 * @returns {Promise<Object>} An object containing:
 *   - `success` {boolean} Overall success status.
 *   - `results` {Array<Object>} For each model:
 *       - `fileName` {string} Name of the model file.
 *       - `success` {boolean} Download success status.
 *       - `path` {string} Full path to the downloaded file (if successful).
 *       - `error` {string} Error message (if failed).
 *   - `message` {string} Error message if the operation fails entirely.
 */
async function downloadModels() {
    try {
        const modelResult = await getModels();

        if (!modelResult.success) {
            return {
                success: false,
                message: 'Failed to fetch model list'
            };
        }

        const downloadResults = [];

        // Download each model file
        for (const fileName of modelResult.models) {
            try {
                const filePath = await downloadModelFile(fileName);
                downloadResults.push({
                    fileName,
                    success: true,
                    path: filePath
                });
            } catch (error) {
                downloadResults.push({
                    fileName,
                    success: false,
                    error: error.message
                });
            }
        }

        return {
            success: true,
            results: downloadResults
        };
    } catch (error) {
        console.error('Error in download-models handler:', error);
        return {
            success: false,
            message: error.message
        };
    }
}

/**
 * IPC handler for 'download-models' event.
 * Triggers the `downloadModels` function and returns its result to the renderer process.
 *
 * @event ipcMain.handle('download-models')
 * @returns {Promise<Object>} Result of the `downloadModels` function containing download status for each model.
 */
ipcMain.handle('download-models', async () => {
    return await downloadModels()
});

/**
 * IPC handler for 'get-model-info' event.
 * Parses each YAML model config file in the fe-models directory and extracts metadata about detection settings.
 *
 * @event ipcMain.handle('get-model-info')
 * @returns {Promise<Array<Object>>} Array of model info objects, each containing:
 *   - `name` {string} The model's display name.
 *   - `objects` {string[]} List of available object classes for detection.
 *   - `path` {string} Path to the YOLO weights file.
 *   - `rules` {Array<Object>} Detection schedule rules per object type:
 *       - `objectType` {string} The name of the object.
 *       - `startTime` {string} Schedule start time.
 *       - `endTime` {string} Schedule end time.
 *       - `enabled` {boolean} Whether the object type is tracked.
 *   - `active` {boolean} Whether the model is currently marked as active.
 *
 * Returns an empty array if no model config files are loaded.
 */
ipcMain.handle('get-model-info', async () => {
    const modelConfigFiles = getFilePaths(MODEL_PATH);
    if (!modelConfigFiles)
        return [];

    return modelConfigFiles.map(filePath => {
        const model = yaml.load(fs.readFileSync(filePath, 'utf-8'));
        let rules = [];

        rules = Object.entries(model.yolov5_deepsort.detection_schedule).map(([objectType, schedules]) => {
            const enabled = model.yolov5_deepsort.detector.tracked_class.includes(objectType);

            return {
                objectType: objectType,
                startTime: schedules[0].start,
                endTime: schedules[0].end,
                enabled: enabled
            }
        })

        return {
            name: model.yolov5_deepsort?.main?.model_name,
            objects: model.yolov5_deepsort?.detector?.available_classes,
            path: model.yolov5_deepsort?.YOLO?.weights,
            rules: rules,
            active: model.yolov5_deepsort?.main?.active,
        };
    });
})

/**
 * IPC handler for 'select-model' event.
 * Sends a POST request to the backend to select the specified model (mark it as active), then downloads all model files.
 *
 * @event ipcMain.handle('select-model')
 * @param {string} modelName - The name of the model to select.
 * @returns {Promise<Object>} An object containing:
 *   - `success` {boolean} Whether the operation succeeded.
 *   - `message` {string} Success or error message.
 */
ipcMain.handle('select-model', async (event, modelName) => {

    const data = {
        model_name: modelName
    }


    console.log("Model name: ", modelName)
    try {
        const response = await axios.post('/select-model', data, {
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': process.env.BACKEND_API_KEY
            }
        })

        console.log('Server Response: ', response.data);
        await downloadModels()
        return {
            success: true,
            message: 'Selected model successfully'
        };
    } catch (error) {
        console.error('Failed to select model.')
        return {
            success: false,
            message: `Error occured: ${error.message}`
        }
    }
})

/**
 * IPC handler for 'get-active-model-info' event.
 * Loads and returns metadata for the currently active model from its YAML config file.
 *
 * @event ipcMain.handle('get-active-model-info')
 * @returns {Promise<Object|null>} A model info object if an active model is found, otherwise `null`. The object includes:
 *   - `name` {string} The model's display name.
 *   - `objects` {string[]} List of available object classes for detection.
 *   - `path` {string} Path to the YOLO weights file.
 *   - `rules` {Array<Object>} Detection schedule rules per object type:
 *       - `objectType` {string} Name of the object class.
 *       - `startTime` {string} Schedule start time.
 *       - `endTime` {string} Schedule end time.
 *       - `enabled` {boolean} Whether the object type is tracked by the model.
 */
ipcMain.handle('get-active-model-info', async () => {
    const filePath = await getActiveModelPath()
    if (!filePath || filePath === "")
        return null;

    const model = yaml.load(fs.readFileSync(filePath, 'utf-8'))
    let rules = [];

    rules = Object.entries(model.yolov5_deepsort.detection_schedule).map(([objectType, schedules]) => {
        const enabled = model.yolov5_deepsort.detector.tracked_class.includes(objectType);

        return {
            objectType: objectType,
            startTime: schedules[0].start,
            endTime: schedules[0].end,
            enabled: enabled
        }
    })

    alerts = Object.entries(model.yolov5_deepsort.alert_configs).map(([objectType, details]) => ({
        objectType,
        ...details
    }))

    return {
        name: model.yolov5_deepsort?.main?.model_name,
        objects: model.yolov5_deepsort?.detector?.available_classes,
        path: model.yolov5_deepsort?.YOLO?.weights,
        rules: rules,
        alerts: alerts
    };
})


/*  FUNCTIONS USED TO UPLOAD MODELS - NOT USED ANYMORE
async function validateModelPath(modelPath) {
    try {
        fs.existsSync(modelPath);
        return true;
    } catch (error) {
        return false;
    }
}

ipcMain.handle('upload-model', async (event, modelData) => {
    console.log('Uploading model:', modelData);
       
    try{
        const pathExists = await validateModelPath(modelData.path);
        if (!pathExists) {
            return {                
                success: false,
                message: 'Model file not found at specified path'
            };
        }

        const models = JSON.parse(fs.readFileSync(MODEL_PATH));

        const existingModel = models.find(model => model.name === modelData.name)
        if(existingModel){
            return{
                success: false,
                message: 'A model with this name already exists'
            };
        }
        
        const newModel = {
            ...modelData,
            id: Date.now().toString(),
            uploadDate: new Date().toISOString(),
            status: 'active',
        };

        models.push(newModel);
        fs.writeFileSync(MODEL_PATH, JSON.stringify(models, null, 2));

        console.log('Model uploaded successfully:', newModel.name);
        return {
            success: true,
            message: 'Model uploaded successfully',
            model: newModel
        };
    }
    catch (error){
        console.error('Failed to upload model', error)
        return{
            success: false,
            message: `Upload failed: ${error.message}`  
        }
    }

})
*/

/**
 * IPC Handler: Deletes a model configuration on both the server and local system.
 *
 * Sends a POST request to the backend to delete the model by name,
 * then clears the local `fe-models` directory and re-downloads fresh models.
 *
 * @ipcChannel delete-model
 * @param {string} modelName - The name of the model to delete.
 * @returns {Promise<{ success: boolean, message: string }>}
 *          Success status and message about the operation.
 */
ipcMain.handle('delete-model', async (event, modelName) => {
    try {
        const modelConfigFiles = getFilePaths(MODEL_PATH);
        if (!modelConfigFiles) {
            return {
                success: false,
                message: 'No model files found!'
            };
        }

        const data = {
            model_name: modelName
        }

        const response = await axios.post('/delete-model', data, {
            headers:{
                'Content-Type': 'application/json',
                "x-api-key": process.env.BACKEND_API_KEY
            }
        })

        console.log('Server Response: ', response.data);

        // Delete everything in the fe-models directory in order to remove unwanted models
        clearDirectorySync(MODEL_PATH)
        await downloadModels()

        return {
            success: true,
            message: 'Saved rule successfully'
        };
    } catch (error) {
        if (error.response) {
            console.log('Error: ', error.response.status, error.response.data);
        } else {
            console.log('Request Failed: ', error.message);
        }

        return {
            success: false,
            message: 'Failed to delete model file'
        };
    }
})

/**
 * Recursively deletes all files and subdirectories within the given directory.
 *
 * This is a synchronous operation. It ensures the entire contents of the directory
 * are removed, including nested folders. The top-level directory itself is not deleted.
 *
 * @param {string} dirPath - Absolute or relative path to the directory to clear.
 */
function clearDirectorySync(dirPath) {
    const files = fs.readdirSync(dirPath);
    for (const file of files) {
        const fullPath = path.join(dirPath, file);
        const stat = fs.lstatSync(fullPath);

        if (stat.isDirectory()) {
            clearDirectorySync(fullPath); // Recursively delete contents
            fs.rmdirSync(fullPath);
        } else {
            fs.unlinkSync(fullPath);
        }
    }
    console.log(`Cleared contents of ${dirPath}`);
}

/**
 * IPC handler for 'toggle-rule-enable' event.
 * Sends a request to enable or disable detection for a specific object class in the active model,
 * then updates local model files.
 *
 * @event ipcMain.handle('toggle-rule-enable')
 * @param {string} objClass - The name of the object class to toggle.
 * @param {boolean} enabled - Whether to enable (true) or disable (false) detection for the class.
 * @returns {Promise<Object>} An object containing:
 *   - `success` {boolean} Whether the operation succeeded.
 *   - `message` {string} A message describing the result.
 */
ipcMain.handle('toggle-rule-enable', async (event, objClass, enabled) => {

    const modelPath = await getActiveModelPath();
    const model = yaml.load(fs.readFileSync(modelPath, 'utf-8'))

    const data = {
        class_name: objClass,
        enabled: enabled,
        model_name: model.yolov5_deepsort.main.model_name || null
    }

    try {
        const response = await axios.post('/toggle_enable', data, {
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': process.env.BACKEND_API_KEY
            }
        });

        console.log('Server Response: ', response.data);
        await downloadModels()
        return {
            success: true,
            message: 'Toggled enable successfully'
        };
    } catch (error) {
        if (error.response) {
            console.log('Error: ', error.response.status, error.response.data);
        } else {
            console.log('Request Failed: ', error.message);
        }

        return {
            success: false,
            message: 'Failed to toggle enable'
        };
    }
})

/**
 * IPC handler for 'save-rule' event.
 * Sends a request to update the detection schedule for a specific object class in the active model,
 * and refreshes local model files after a successful update.
 *
 * @event ipcMain.handle('save-rule')
 * @param {Object} rule - The rule object to save.
 * @param {string} rule.objectType - Object class to update.
 * @param {string} rule.startTime - Start time for the detection schedule.
 * @param {string} rule.endTime - End time for the detection schedule.
 * @param {boolean} rule.enabled - Whether detection is enabled for the object class.
 * @returns {Promise<Object>} An object containing:
 *   - `success` {boolean} Whether the operation succeeded.
 *   - `message` {string} A message describing the result.
 */
ipcMain.handle('save-rule', async (event, rule) => {
    const modelPath = await getActiveModelPath();
    const model = yaml.load(fs.readFileSync(modelPath, 'utf-8'))

    const data = {
        class_name: rule.objectType,
        periods: [
            { start: rule.startTime, end: rule.endTime }
        ],
        enabled: rule.enabled || true,
        model_name: model.yolov5_deepsort.main.model_name
    };

    try {
        const response = await axios.post('/update_schedule', data, {
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': process.env.BACKEND_API_KEY
            }
        });

        console.log('Server Response: ', response.data);
        await downloadModels()
        return {
            success: true,
            message: 'Saved rule successfully'
        };

    } catch (err) {
        if (err.response) {
            console.log('Error: ', err.response.status, err.response.data);
        } else {
            console.log('Request Failed: ', err.message);
        }

        return {
            success: false,
            message: 'Failed to save Rule'
        };
    }
});


/**
 * IPC handler for 'delete-rule' event.
 * Sends a request to delete the detection rule for a specified object class from the active model,
 * then updates local model files.
 *
 * @event ipcMain.handle('delete-rule')
 * @param {string} objClass - The name of the object class whose rule should be deleted.
 * @returns {Promise<Object>} An object containing:
 *   - `success` {boolean} Whether the deletion succeeded.
 *   - `message` {string} A message describing the result.
 */
ipcMain.handle('delete-rule', async (event, objClass) => {
    const modelPath = await getActiveModelPath();
    const model = yaml.load(fs.readFileSync(modelPath, 'utf-8'))

    const data = {
        class_name: objClass,
        model_name: model.yolov5_deepsort.main.model_name || null
    }

    try {
        const response = await axios.post('/delete-rule', data, {
            headers: {
                "Content-Type": "application/json",
                "x-api-key": process.env.BACKEND_API_KEY
            }
        })

        console.log('Server Response: ', response.data)
        await downloadModels()
        return {
            success: true,
            message: 'Deleted rule successfully'
        }
    } catch (error) {
        if (error.response) {
            console.log('Error: ', error.response.status, error.response.data)
        } else {
            console.log('Request Failed: ', error.message)
        }

        return {
            success: false,
            message: 'Failed to delete rule'
        }
    }
})

/**
 * IPC handler for 'get-influx-alerts' event.
 * Queries the InfluxDB `detectionAlerts` bucket for detection alert entries,
 * sorts them by timestamp (newest first), and returns up to `num` results.
 *
 * @event ipcMain.handle('get-influx-alerts')
 * @param {number} num - (Optional) Maximum number of alerts to return.
 * @returns {Promise<Array<Object>>} A list of detection alert objects, each containing:
 *   - `timestamp` {string} Time of the detection.
 *   - `object` {string} Detected object type.
 *   - `camera` {string} Camera identifier.
 *   - `confidence` {number} Detection confidence score.
 * 
 * Returns an empty array if the query fails.
 */
ipcMain.handle('get-influx-alerts', async (event, num) => {
    try {
        // Check if InfluxDB is configured
        if (!process.env.INFLUX_TOKEN ) {
            console.log('InfluxDB token:', process.env.INFLUX_TOKEN);
            console.log('InfluxDB not configured - returning empty alerts list');
            return [];
        }

        // Create a Database instance with fallback values
        const detectionAlertDB = new Database(
            process.env.INFLUX_TOKEN || 'hlzFOUbqafa1O4NsyKTB7urMtBhTmfYGThK-9_meVF9cf-jmc9xvpzPlzMRldWeWxekLWGGqXA1q8phmV8hJ3Q==',
            process.env.INFLUX_ORG || 'SignalGeneriX',
            process.env.INFLUX_BUCKET || 'detectionAlerts',
            process.env.INFLUX_URL || 'http://localhost:8086'
        );

        const query = `
            from(bucket: "detectionAlerts")
            |> range(start: 0)
            |> filter(fn: (r) => r._measurement == "detection")
            |> sort(columns: ["_time"], desc: true)
        `;

        detectionAlertDB.setQuery(query);
        const results = await detectionAlertDB.read();

        const alerts = results.map(obj => ({
            timestamp: obj._time,
            object: obj.object,
            camera: obj.camera,
            confidence: obj._value
        }));

        alerts.sort((a, b) => {
            const dateA = new Date(a.timestamp);
            const dateB = new Date(b.timestamp);
            return dateB.getTime() - dateA.getTime();
        });

        // Use the passed parameter or default to all alerts
        const limitNum = num || alerts.length;
        return alerts.slice(0, limitNum);

    } catch (error) {
        if (error.code === 'ECONNREFUSED') {
            console.log('InfluxDB connection refused - database may not be running');
            console.log('To use InfluxDB features, please:');
            console.log('1. Install and start InfluxDB');
            console.log('2. Update the .env file with correct InfluxDB credentials');
            console.log('3. Or set up a local InfluxDB instance on port 8086');
        } else {
            console.error('Error in get-influx-alerts:', error);
        }
        return [];
    }
});



ipcMain.handle('save-alert-config', async (event, config) => {
    const modelPath = await getActiveModelPath();
    const model = yaml.load(fs.readFileSync(modelPath, 'utf-8'))

    try {
        const data = {
            object_type: config.objectType,
            channels: {
                email: config.channels?.email || false,
                viber: config.channels?.viber || false,
                api: config.channels?.api || false
            },
            confidence_min: config.confidence_min || 0.8,
            enabled: true,
            model_name: model.yolov5_deepsort.main.model_name
        }

        console.log(data)

        const response = axios.post('/save-alert', data, {
            headers:{
                'Content-Type': 'application/json',
                'x-api-key': process.env.BACKEND_API_KEY
            }
        })

        console.log('Server Response: ', response.data);
        await downloadModels()
        return {
            success: true,
            message: 'Saved rule successfully'
        };
    } catch(err){
        if (err.response) {
            console.log('Error: ', err.response.status, err.response.data);
        } else {
            console.log('Request Failed: ', err.message);
        }

        return {
            success: false,
            message: 'Failed to save alert configuration'
        };        
    }
})

ipcMain.handle('delete-alert-config', async (event, objectType) => {
    const modelPath = await getActiveModelPath();
    const model = yaml.load(fs.readFileSync(modelPath, 'utf-8'))
    try {
        console.log('Attempting to delete alert config for object:', objectType);

        const data = {
            model_name: model.yolov5_deepsort.main.model_name,
            object_type: objectType
        }

        const response = axios.post('/delete-alert', data, {
            headers:{
                'Content-Type': 'application/json',
                'x-api-key': process.env.BACKEND_API_KEY
            }
        })
        
        console.log('Server Response: ', response.data);
        await downloadModels()
        return {
            success: true,
            message: 'Saved rule successfully'
        };
    } catch(err){
        if (err.response) {
            console.log('Error: ', err.response.status, err.response.data);
        } else {
            console.log('Request Failed: ', err.message);
        }

        return {
            success: false,
            message: 'Failed to delete alert configuration'
        };        
    }
});


ipcMain.handle('toggle-alert-enable', async (event, objectType, enabled) => {
    const modelPath = await getActiveModelPath();
    const model = yaml.load(fs.readFileSync(modelPath, 'utf-8'))
    try{
        const data = {
            model_name: model.yolov5_deepsort.main.model_name,
            object_type: objectType,
            enabled: enabled
        }

        const response = axios.post('/toggle-alert', data, {
            headers:{
                'Content-Type': 'application/json',
                'x-api-key': process.env.BACKEND_API_KEY
            }
        })
        
        console.log('Server Response: ', response.data);
        await downloadModels()
        return {
            success: true,
            message: 'Saved rule successfully'
        };
    } catch(err){
        if (err.response) {
            console.log('Error: ', err.response.status, err.response.data);
        } else {
            console.log('Request Failed: ', err.message);
        }

        return {
            success: false,
            message: 'Failed to delete alert configuration'
        }; 
    }
})

/**
 * IPC handler for 'get-system-logs' event.
 * Fetches and returns system log entries from the InfluxDB `Logs` bucket,
 * sorted by timestamp in descending order (newest first).
 *
 * @event ipcMain.handle('get-system-logs')
 * @returns {Promise<Array<Object>>} A list of system log objects, each containing:
 *   - `timestamp` {string} Time the log was recorded.
 *   - `type` {string} Type or severity of the log (e.g., "info", "error").
 *   - `message` {string} The log message content.
 *
 * Returns an empty array if the query fails.
 */
ipcMain.handle('get-system-logs', async () => {
    try {
        // Check if InfluxDB is configured
        if (!process.env.INFLUX_TOKEN) {
            // Print if the condition above is true or not 
        
            console.log('InfluxDB not configured - returning empty logs list');
            return [];
        }

        const logsDB = new Database(
            process.env.INFLUX_TOKEN,
            'SignalGeneriX',
            'Logs'
        )

        const query = `
            from(bucket: "${logsDB.bucket}")
            |> range(start: 0)
            |> filter(fn: (r) => r._measurement == "log")
        `
        logsDB.setQuery(query);

        const raw = await logsDB.read();

        const logs = raw.map(obj => ({
            timestamp: obj._time,
            type: obj.type,
            message: obj._value
        }));

        logs.sort((a, b) => {
            const dateA = new Date(a.timestamp);
            const dateB = new Date(b.timestamp);
            return dateB.getTime() - dateA.getTime();
        });

        return logs;
    } catch (error) {
        if (error.code === 'ECONNREFUSED') {
            console.log('InfluxDB connection refused - database may not be running');
            console.log('To use InfluxDB features, please:');
            console.log('1. Install and start InfluxDB');
            console.log('2. Update the .env file with correct InfluxDB credentials');
            console.log('3. Or set up a local InfluxDB instance on port 8086');
        } else {
            console.error('Error in load logs:', error);
        }
        return [];
    }
})

/**
 * IPC handler for 'save-camera' event.
 * Saves a new camera object to a JSON file specified by the CAMERA_PATH global variable, ensuring no duplicate camera IDs exist.
 * Creates the file if it does not already exist.
 *
 * @event ipcMain.handle('save-camera')
 * @param {Object} camera - The camera object to save, must include an `id` property.
 * @returns {Promise<Object>} An object containing:
 *   - `success` {boolean} Whether the camera was saved successfully.
 *   - `message` {string} A message describing the result or error.
 */
ipcMain.handle('save-camera', async (event, camera) => {
    try {
        let cameras = []

        if (!fs.existsSync(CAMERA_PATH)) {
            console.log('Cameras file not found. Creating file...');
            fs.writeFileSync(CAMERA_PATH, JSON.stringify([], null, 2));
        } else {
            cameras = JSON.parse(fs.readFileSync(CAMERA_PATH, 'utf-8'));
        }

        for (const existingCam of cameras) {
            if (existingCam.id === camera.id) {
                console.log('Could not save camera. There already exists a camera with this ID');
                return {
                    success: false,
                    message: 'Camera with the same ID already exists'
                }
            }
        }

        if(camera.type === 'youtube')
            camera.source = appendParams(camera.source);

        cameras.push(camera);
        fs.writeFileSync(CAMERA_PATH, JSON.stringify(cameras, null, 2));

        console.log('Camera saved successfully:', camera);
        return {
            success: true,
            message: 'Camera saved successfully'
        };
    } catch (error) {
        return {
            success: false,
            message: `Error occured: ${error.message}`
        }
    }
})


ipcMain.handle('update-camera', async (event, camera) => {
    try {
        if (!fs.existsSync(CAMERA_PATH)) {
            return {
                success: false,
                message: 'Camera file not found!'
            };
        }

        const cameras = JSON.parse(fs.readFileSync(CAMERA_PATH), 'utf-8');
        const cameraIndex = cameras.findIndex(target => target.id == camera.id)

        if (cameraIndex === -1) {
            return {
                success: false,
                message: "Couldn't find specified camera"
            };
        }

        cameras[cameraIndex] = camera
        fs.writeFileSync(CAMERA_PATH, JSON.stringify(cameras, null, 2))

        console.log('Camera configuration updated successfully');
        return {
            success: true,
            message: 'Camera configuration updated successfully'
        };
    }
    catch (error) {
        console.error('Failed to update camera.')
        return {
            success: false,
            message: `Error occured: ${error.message}`
        }
    }
})


/**
 * Appends default query parameters to a given URL if they are not already present.
 *
 * This function is useful for embedding YouTube or similar videos where you want to ensure
 * certain parameters (like autoplay, mute, etc.) are set without overwriting existing ones.
 *
 * @param {string} urlStr - The original URL as a string. Can contain existing query parameters.
 * @returns {string} The updated URL string with the necessary parameters appended if missing.
 *
 * @example
 * const url = 'https://www.youtube.com/embed/abc123';
 * const updated = appendParams(url);
 * // updated: 'https://www.youtube.com/embed/abc123?autoplay=1&mute=1&controls=0&showinfo=0&rel=0'
 */
function appendParams(urlStr) {
  const url = new URL(urlStr);

  const defaults = {
    autoplay: '1',
    mute: '1',
    controls: '0',
    showinfo: '0',
    rel: '0'
  };

  for (const [key, value] of Object.entries(defaults)) {
    if (!url.searchParams.has(key)) {
      url.searchParams.append(key, value);
    }
  }

  return url.toString();
}

/**
 * IPC handler for 'delete-camera' event.
 * Deletes a camera configuration by ID from the JSON cameras file.
 *
 * @event ipcMain.handle('delete-camera')
 * @param {string|number} cameraId - The ID of the camera to delete.
 * @returns {Promise<Object>} An object containing:
 *   - `success` {boolean} Whether the deletion succeeded.
 *   - `message` {string} A message describing the result or error.
 */
ipcMain.handle('delete-camera', async (event, cameraId) => {
    try {
        if (!fs.existsSync(CAMERA_PATH)) {
            return {
                success: false,
                message: 'Camera file not found!'
            };
        }

        const cameras = JSON.parse(fs.readFileSync(CAMERA_PATH), 'utf-8');
        const cameraIndex = cameras.findIndex(target => target.id == cameraId)

        if (cameraIndex === -1) {
            return {
                success: false,
                message: "Couldn't find specified camera"
            };
        }

        cameras.splice(cameraIndex, 1)
        fs.writeFileSync(CAMERA_PATH, JSON.stringify(cameras, null, 2))

        console.log('Camera configuration deleted successfully:', cameraId);
        return {
            success: true,
            message: 'Camera configuration deleted successfully'
        };
    }
    catch (error) {
        console.error('Failed to delete camera.')
        return {
            success: false,
            message: `Error occured: ${error.message}`
        }
    }
})

/**
 * IPC handler for 'get-report-data' event.
 * Retrieves detection alert data from InfluxDB, including total detections and recent alerts,
 * and returns a report summary object.
 * Used for the creation of the report html page.
 *
 * @event ipcMain.handle('get-report-data')
 * @returns {Promise<Object>} An object containing:
 *   - `date` {string} Current date (localized).
 *   - `detectionNumber` {number} Total number of detection alerts.
 *   - `alertCount` {number} Count of sent alerts (from `sentAlertsCount` variable).
 *   - `recentAlerts` {Array<Object>} Up to 10 most recent detection alerts, each with:
 *       - `timestamp` {string} Alert timestamp.
 *       - `object` {string} Detected object type.
 *       - `camera` {string} Camera identifier.
 *       - `confidence` {number} Detection confidence.
 *   - `detectionSummary` {string} Placeholder for summary text.
 *   - `dateAndTime` {string} Current date and time (localized).
 *   - `contactInfo` {string} Contact email for reports.
 */
ipcMain.handle('get-report-data', async () => {

    const detectionAlertDB = new Database(
        process.env.INFLUX_TOKEN,
        'SignalGeneriX',
        'detectionAlerts'
    );

    let query = `
        from(bucket: "detectionAlerts")
        |> range(start: 0)
        |> filter(fn: (r) => r._measurement == "detection")
        |> sort(columns: ["_time"], desc: true)
    `;

    detectionAlertDB.setQuery(query);
    const results = await detectionAlertDB.read();

    const totalDetections = results.length

    const alerts = results.map(obj => ({
        timestamp: obj._time,
        object: obj.object,
        camera: obj.camera,
        confidence: obj._value
    }));

    const timeStamp = new Date();


    return {
        date: timeStamp.toLocaleDateString(),
        detectionNumber: totalDetections,
        alertCount: sentAlertsCount,
        recentAlerts: alerts.slice(0, 10),
        detectionSummary: '',
        dateAndTime: timeStamp.toLocaleString(),
        contactInfo: 'example@gmail.com'
    }
})

// ======================= DETECTION SYSTEM HANDLERS =========================

/**
 * IPC handler for 'start-detection' event.
 * Sends a POST request to the backend to start the detection system.
 *
 * @event ipcMain.handle('start-detection')
 * @returns {Promise<Object>} An object containing:
 *   - `success` {boolean} Whether the operation succeeded.
 *   - `message` {string} A message describing the result.
 */
ipcMain.handle('start-detection', async () => {
    try {
        await writeSystemLog('Attempting to start detection system', 'info', 'detection');
        
        const response = await axios.post('/start-detection', {}, {
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': process.env.BACKEND_API_KEY
            }
        });

        console.log('Detection started:', response.data);
        await writeSystemLog('Detection system started successfully', 'info', 'detection');
        return {
            success: true,
            message: 'Detection system started successfully'
        };
    } catch (error) {
        console.error('Failed to start detection:', error);
        await writeSystemLog(`Detection system start failed: ${error.message}`, 'error', 'detection');
        return {
            success: false,
            message: error.response?.data?.error || 'Failed to start detection system'
        };
    }
});

/**
 * IPC handler for 'stop-detection' event.
 * Sends a POST request to the backend to stop the detection system.
 *
 * @event ipcMain.handle('stop-detection')
 * @returns {Promise<Object>} An object containing:
 *   - `success` {boolean} Whether the operation succeeded.
 *   - `message` {string} A message describing the result.
 */
ipcMain.handle('stop-detection', async () => {
    try {
        await writeSystemLog('Attempting to stop detection system', 'info', 'detection');
        
        const response = await axios.post('/stop-detection', {}, {
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': process.env.BACKEND_API_KEY
            }
        });

        console.log('Detection stopped:', response.data);
        await writeSystemLog('Detection system stopped successfully', 'info', 'detection');
        return {
            success: true,
            message: 'Detection system stopped successfully'
        };
    } catch (error) {
        console.error('Failed to stop detection:', error);
        await writeSystemLog(`Detection system stop failed: ${error.message}`, 'error', 'detection');
        return {
            success: false,
            message: error.response?.data?.error || 'Failed to stop detection system'
        };
    }
});

/**
 * IPC handler for 'get-detection-status' event.
 * Sends a GET request to the backend to get the current detection system status.
 *
 * @event ipcMain.handle('get-detection-status')
 * @returns {Promise<Object>} An object containing:
 *   - `status` {string} The current status ('running' or 'stopped').
 *   - `pid` {number} Process ID if running.
 */
ipcMain.handle('get-detection-status', async () => {
    try {
        const response = await axios.get('/detection-status', {
            headers: {
                'x-api-key': process.env.BACKEND_API_KEY
            }
        });

        return response.data;
    } catch (error) {
        console.error('Failed to get detection status:', error);
        return {
            status: 'error',
            error: error.response?.data?.error || 'Failed to get detection status'
        };
    }
});

/**
 * IPC handler for 'get-analyzed-frame' event.
 * Sends a GET request to the backend to get the analyzed frame for a specific camera.
 *
 * @event ipcMain.handle('get-analyzed-frame')
 * @param {string} cameraId - The ID of the camera to get the frame for.
 * @returns {Promise<Object>} An object containing the frame data or error information.
 */
ipcMain.handle('get-analyzed-frame', async (event, cameraId) => {
    try {
        const response = await axios.get(`/get-analyzed-frame/${cameraId}`, {
            headers: {
                'x-api-key': process.env.BACKEND_API_KEY
            },
            responseType: 'arraybuffer'
        });

        return {
            success: true,
            data: Buffer.from(response.data).toString('base64'),
            contentType: response.headers['content-type'] || 'image/jpeg'
        };
    } catch (error) {
        console.error('Failed to get analyzed frame:', error);
        return {
            success: false,
            error: error.response?.data?.error || 'Failed to get analyzed frame'
        };
    }
});

/**
 * IPC handler for 'get-camera-status' event.
 * Sends a GET request to the backend to get the current camera status from the detection system.
 *
 * @event ipcMain.handle('get-camera-status')
 * @returns {Promise<Object>} An object containing camera status information.
 */
ipcMain.handle('get-camera-status', async () => {
    try {
        const response = await axios.get('/camera-status', {
            headers: {
                'x-api-key': process.env.BACKEND_API_KEY
            }
        });

        return response.data;
    } catch (error) {
        console.error('Failed to get camera status:', error);
        return {
            error: error.response?.data?.error || 'Failed to get camera status'
        };
    }
});

/**
 * IPC handler for 'get-alert-status' event.
 * Sends a GET request to the backend to get the current alert status from the detection system.
 *
 * @event ipcMain.handle('get-alert-status')
 * @returns {Promise<Object>} An object containing alert status information.
 */
ipcMain.handle('get-alert-status', async () => {
    try {
        const response = await axios.get('/alert-status', {
            headers: {
                'x-api-key': process.env.BACKEND_API_KEY
            }
        });

        return response.data;
    } catch (error) {
        console.error('Failed to get alert status:', error);
        return {
            error: error.response?.data?.error || 'Failed to get alert status'
        };
    }
});

/**
 * IPC handler for 'restart-detection' event.
 * Stops the current detection system and then starts it again.
 *
 * @event ipcMain.handle('restart-detection')
 * @returns {Promise<Object>} An object containing:
 *   - `success` {boolean} Whether the operation succeeded.
 *   - `message` {string} A message describing the result.
 */
ipcMain.handle('restart-detection', async () => {
    try {
        await writeSystemLog('Attempting to restart detection system', 'info', 'detection');
        
        // First stop the detection system
        const stopResponse = await axios.post('/stop-detection', {}, {
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': process.env.BACKEND_API_KEY
            }
        });

        // Wait a moment for the system to stop
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Then start it again
        const startResponse = await axios.post('/start-detection', {}, {
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': process.env.BACKEND_API_KEY
            }
        });

        console.log('Detection restarted:', startResponse.data);
        await writeSystemLog('Detection system restarted successfully', 'info', 'detection');
        return {
            success: true,
            message: 'Detection system restarted successfully'
        };
    } catch (error) {
        console.error('Failed to restart detection:', error);
        await writeSystemLog(`Detection system restart failed: ${error.message}`, 'error', 'detection');
        return {
            success: false,
            message: error.response?.data?.error || 'Failed to restart detection system'
        };
    }
});

/**
 * Helper function to write system logs.
 * Sends a POST request to the backend to write a system log entry.
 *
 * @param {string} message - The log message.
 * @param {string} logType - The type of log (e.g., 'info', 'error', 'warning').
 * @param {string} category - The category of the log (e.g., 'system', 'detection').
 */
async function writeSystemLog(message, logType = 'info', category = 'system') {
    try {
        const logData = {
            message: message,
            type: logType,
            category: category,
            timestamp: new Date().toISOString()
        };

        await axios.post('/write-system-log', logData, {
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': process.env.BACKEND_API_KEY
            }
        });
    } catch (error) {
        // Log to console if API is not available
        console.log(`[${logType.toUpperCase()}] [${category}] ${message}`);
        if (error.code === 'ECONNREFUSED') {
            console.log('Backend API not available - logging to console only');
        } else {
            console.error('Failed to write system log:', error.message);
        }
    }
}
