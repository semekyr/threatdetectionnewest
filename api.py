from http.client import HTTPException
import os
from pathlib import Path
from flask import Flask, request, jsonify, send_from_directory, abort, Response
import yaml
from multiprocessing import Process, Queue
import time
import subprocess
import sys
import json
from datetime import datetime

# Create Flask app: 
app = Flask(__name__)
CONFIG_PATH = 'fe-models/config.yml'
API_KEY = 'efecd5a4-40ff-45df-b1d9-0e3256f2265d'
MODEL_DIR = Path("./fe-models")

# Global variable to track detection process:
detection_process = None

# Helper functions to load yaml files as a Python dictionary and save them with the updated data:
def load_config(filePath=CONFIG_PATH):
    with open(filePath, 'r') as file:
        return yaml.safe_load(file)

def save_config(config_data, filePath=CONFIG_PATH):
    with open(filePath, 'w') as file:
        yaml.safe_dump(config_data, file)

def get_path_from_name(modelName):
    for file in MODEL_DIR.iterdir():
        if file.is_file():
            try:
                config = load_config(file)
                # Check if the model name matches the model name in the config file:
                if config['yolov5_deepsort']['main']['model_name'] == modelName:
                    return str(file)
            except (KeyError, TypeError, yaml.YAMLError) as e:
                continue
    return None

# Endpoint to start detection system:
@app.route('/start-detection', methods=['POST'])
def start_detection():
    global detection_process
    
    if request.headers.get('x-api-key') != API_KEY:
        return jsonify({"error": "Unauthorized"}), 401
    
    if detection_process and detection_process.poll() is None:
        return jsonify({"error": "Detection system already running"}), 400
    
    try:
        # Get the active model config
        active_config = None
        for file in MODEL_DIR.iterdir():
            if file.is_file():
                try:
                    config = load_config(file)
                    if config.get('yolov5_deepsort', {}).get('main', {}).get('active', False):
                        active_config = str(file)
                        break
                except (KeyError, TypeError, yaml.YAMLError) as e:
                    continue
        
        if not active_config:
            return jsonify({"error": "No active model found"}), 400
        
        # Start the detection process
        detection_process = subprocess.Popen([
            sys.executable, 
            'models/main.py',
            '--config', active_config,
            '--cameras', 'configs/cameras.json'
        ], cwd=os.getcwd())
        
        return jsonify({"message": "Detection system started successfully"}), 200
        
    except Exception as e:
        return jsonify({"error": f"Failed to start detection: {str(e)}"}), 500

# Endpoint to stop detection system:
@app.route('/stop-detection', methods=['POST'])
def stop_detection():
    global detection_process
    
    if request.headers.get('x-api-key') != API_KEY:
        return jsonify({"error": "Unauthorized"}), 401
    
    if detection_process and detection_process.poll() is None:
        detection_process.terminate()
        try:
            detection_process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            detection_process.kill()
        detection_process = None
        return jsonify({"message": "Detection system stopped successfully"}), 200
    else:
        return jsonify({"error": "No detection system running"}), 400

# Endpoint to get detection status:
@app.route('/detection-status', methods=['GET'])
def get_detection_status():
    if request.headers.get('x-api-key') != API_KEY:
        return jsonify({"error": "Unauthorized"}), 401
    
    global detection_process
    
    if detection_process and detection_process.poll() is None:
        return jsonify({
            "status": "running",
            "pid": detection_process.pid
        }), 200
    else:
        return jsonify({
            "status": "stopped"
        }), 200

# Endpoint to get analyzed frame for a specific camera:
@app.route('/get-analyzed-frame/<camera_id>', methods=['GET'])
def get_analyzed_frame(camera_id):
    if request.headers.get('x-api-key') != API_KEY:
        return jsonify({"error": "Unauthorized"}), 401
    
    try:
        # Forward request to the detection system:
        import requests
        response = requests.get(f'http://127.0.0.1:5050/get_analysed_frame/{camera_id}', timeout=5)
        
        if response.status_code == 200:
            return Response(response.content, mimetype='image/jpeg')
        else:
            return jsonify({"error": "Frame not available"}), 404
            
    except requests.exceptions.RequestException:
        return jsonify({"error": "Detection system not responding"}), 503

# Endpoint to get camera status from detection system:
@app.route('/camera-status', methods=['GET'])
def get_camera_status():
    if request.headers.get('x-api-key') != API_KEY:
        return jsonify({"error": "Unauthorized"}), 401
    
    try:
        import requests
        response = requests.get('http://127.0.0.1:5050/camera_status', timeout=5)
        
        if response.status_code == 200:
            return jsonify(response.json()), 200
        else:
            return jsonify({"error": "Unable to get camera status"}), 500
            
    except requests.exceptions.RequestException:
        return jsonify({"error": "Detection system not responding"}), 503

# Endpoint to get alert status:
@app.route('/alert-status', methods=['GET'])
def get_alert_status():
    if request.headers.get('x-api-key') != API_KEY:
        return jsonify({"error": "Unauthorized"}), 401
    
    try:
        import requests
        response = requests.get('http://127.0.0.1:5050/alert_status', timeout=5)
        
        if response.status_code == 200:
            return jsonify(response.json()), 200
        else:
            return jsonify({"error": "Unable to get alert status"}), 500
            
    except requests.exceptions.RequestException:
        return jsonify({"error": "Detection system not responding"}), 503

# Endpoint to write system logs:
@app.route('/write-system-log', methods=['POST'])
def write_system_log():
    if request.headers.get('x-api-key') != API_KEY:
        return jsonify({"error": "Unauthorized"}), 401
    
    try:
        data = request.get_json()
        message = data.get('message', '')
        log_type = data.get('type', 'info')
        category = data.get('category', 'system')
        
        # Forward the log to the Electron main process via a simple file-based approach
        # or we could implement a more sophisticated logging system here
        log_entry = {
            'timestamp': data.get('timestamp', datetime.now().isoformat()),
            'message': message,
            'type': log_type,
            'category': category
        }
        
        # For now, we'll just print the log and let the Electron app handle the InfluxDB writing
        print(f"[{log_type.upper()}] [{category}] {message}")
        
        return jsonify({"success": True, "message": "Log written successfully"}), 200
        
    except Exception as e:
        return jsonify({"error": f"Failed to write log: {str(e)}"}), 500

# Endpoint to get system logs:
@app.route('/system-logs', methods=['GET'])
def get_system_logs():
    if request.headers.get('x-api-key') != API_KEY:
        return jsonify({"error": "Unauthorized"}), 401
    
    try:
        # This endpoint would typically query the InfluxDB logs bucket
        # For now, we'll return a placeholder response
        # In a real implementation, this would query the InfluxDB Logs bucket
        
        # Placeholder response - in reality this would come from InfluxDB
        logs = [
            {
                'timestamp': datetime.now().isoformat(),
                'message': 'System logs endpoint accessed',
                'type': 'info',
                'category': 'system'
            }
        ]
        
        return jsonify(logs), 200
        
    except Exception as e:
        return jsonify({"error": f"Failed to get logs: {str(e)}"}), 500

# Endpoint to update the schedule (accepts POST requests only): 
@app.route('/update_schedule', methods=['POST'])
def update_schedule():
    if request.headers.get('x-api-key')!= API_KEY:
        return jsonify({"error": "Unauthorized"}), 401
    
    data = request.get_json()
    if not data:
        return jsonify({"error": "Invalid data"}), 400
    
    class_name = data.get('class_name')
    periods = data.get('periods')
    enabled = data.get('enabled')
    model_name = data.get('model_name')

    if not class_name or not periods:
        return jsonify({"error": "Missing class_name or periods"}), 400


    filePath = get_path_from_name(model_name)
    if(filePath is None):
        return jsonify({"error": "Couldn't find config file with model name " + model_name})
    config = load_config(filePath)

    if 'yolov5_deepsort' not in config:
        return jsonify({"error": "Configuration not found"}), 500
    
    # Modify the schedule for the specified class (for time schedule):
    config['yolov5_deepsort'].setdefault('detection_schedule', {})
    config['yolov5_deepsort']['detection_schedule'][class_name] = [{"start": p["start"], "end": p["end"]} for p in periods]
    # Enable or disable the class:
    tracked_classes =  config['yolov5_deepsort'].get('detector', {}).get('tracked_class', [])
    if enabled is not None: 
        if enabled and class_name not in tracked_classes:
            tracked_classes.append(class_name)

        elif not enabled and class_name in tracked_classes:
            tracked_classes.remove(class_name)
        
        # Save the updated tracked classes:
        config['yolov5_deepsort']['detector']['tracked_class'] = tracked_classes
    
    save_config(config, filePath)
    return jsonify({"message": "Detection settings updated successfully"}), 200


# Endpoint to toggle enable (accepts POST requests only):
@app.route('/toggle_enable', methods=['POST'])
def toggle_model():
    if request.headers.get('x-api-key')!= API_KEY:
        return jsonify({"error": "Unauthorized"}), 401
    
    data = request.get_json()
    if not data:
        return jsonify({"error": "Invalid data"}), 400
    
    class_name = data.get('class_name')
    enabled = data.get('enabled')
    model_name = data.get('model_name')

    if not class_name or enabled is None:
        return jsonify({"error": "Missing class_name or enabled"}), 400
    
    filePath = get_path_from_name(model_name)
    if(filePath is None):
        return jsonify({"error": "Couldn't find config file with model name " + model_name}), 400
    
    config = load_config(filePath)

    if 'yolov5_deepsort' not in config:
        return jsonify({"error": "Configuration not found"}), 500
    
    tracked_classes =  config['yolov5_deepsort'].get('detector', {}).get('tracked_class', [])

    if enabled and class_name not in tracked_classes:
        tracked_classes.append(class_name)
    elif not enabled and class_name in tracked_classes:
        tracked_classes.remove(class_name)

    config['yolov5_deepsort']['detector']['tracked_class'] = tracked_classes

    save_config(config, filePath)
    return jsonify({"message": "Detection settings updated successfully"}), 200


# Endpoint to delete rule (accepts POST requests only):
@app.route('/delete-rule', methods=['POST'])
def delete_rule():
    if request.headers.get('x-api-key')!= API_KEY:
        return jsonify({"error": "Unauthorized"}), 401
    
    data = request.get_json()
    if not data:
        return jsonify({"error": "Invalid data"}), 400
    
    class_name = data.get('class_name')
    model_name = data.get('model_name')

    if not class_name: 
        return jsonify({"error": "Missing class_name"}), 400

    filePath = get_path_from_name(model_name)
    if(filePath is None):
        return jsonify({"error": "Couldn't find config file with model name " + model_name}), 400
    
    config = load_config(filePath)

    tracked_classes = config['yolov5_deepsort'].get('detector', {}).get('tracked_class', [])
    if class_name in tracked_classes:
        tracked_classes.remove(class_name)

    detections = config['yolov5_deepsort'].get('detection_schedule', {})
    detections.pop(class_name)

    config['yolov5_deepsort']['detector']['tracked_class'] = tracked_classes
    config['yolov5_deepsort']['detection_schedule'] = detections

    save_config(config, filePath)
    return jsonify({"message": "Detection deleted successfully"}), 200


# Endpoint to select a specific model as the active model:
@app.route('/select-model', methods=['POST'])
def select_model():
    if request.headers.get('x-api-key') != API_KEY:
        return jsonify({"error": "Unauthorized"}), 401
    
    data = request.get_json()
    if not data:
        return jsonify({"error": "Invalid data"}), 400
    
    model_name = data.get('model_name')
    
    if not model_name: 
        return jsonify({"error": "Missing model_name"}), 400

    for file in MODEL_DIR.iterdir():
        if file.is_file():
            try:
                config = load_config(file)
                if config['yolov5_deepsort']['main']['model_name'] == model_name:
                    config['yolov5_deepsort']['main']['active'] = True
                else:
                    config['yolov5_deepsort']['main']['active'] = False

                save_config(config, file)
            except (KeyError, TypeError, yaml.YAMLError) as e:
                continue
    
    return jsonify({"message": "Model file selected successfully"}), 200

    
    
# Endpoint to get a list of all available model files in the models directory:
@app.route('/get-models', methods=['GET'])
def list_models():
    if request.headers.get('x-api-key')!= API_KEY:
        return jsonify({"error": "Unauthorized"}), 401
    
    if not MODEL_DIR.exists():
        return jsonify([])
    files = [f.name for f in MODEL_DIR.iterdir() if f.is_file()]
    return jsonify(files)


# Endpoint to download (copy) a specific file from the models directory to the fe-models directory:
@app.route('/download/<fileName>', methods=['GET'])
def download_model(fileName: str):
    if request.headers.get('x-api-key')!= API_KEY:
        return jsonify({"error": "Unauthorized"}), 401
    
    file_path = os.path.join(MODEL_DIR, fileName)
    
    if not os.path.exists(file_path):
        print(f"Files in MODEL_DIR: {os.listdir(MODEL_DIR)}")
    
    try:
        return send_from_directory(MODEL_DIR, fileName, as_attachment=True)
    except FileNotFoundError:
        abort(404)


# Endpoint to delete a configuration file from the models directory:
@app.route('/delete-model', methods=['POST'])
def delete_model():
    if request.headers.get('x-api-key') != API_KEY:
        return jsonify({"error": "Unauthorized"}), 401
    
    data = request.get_json()
    if not data:
        return jsonify({"error": "Invalid data"}), 400
    
    model_name = data.get('model_name')
    
    if not model_name: 
        return jsonify({"error": "Missing model_name"}), 400
    
    filePathStr = get_path_from_name(model_name)
    if(filePathStr is None):
        return jsonify({"error": "Couldn't find config file with model name " + model_name}), 400
    
    filePath = Path(filePathStr)
    if(filePath.exists()):
        filePath.unlink()
        return jsonify({"message": "Model file deleted successfully"})
    else:
        return jsonify({"error": "Error converting from string to Path object"}), 400
    

# Endpoint to save alert configuration:
@app.route('/save-alert', methods=['POST'])
def save_alert():
    if request.headers.get('x-api-key')!= API_KEY:
        return jsonify({"error": "Unauthorized"}), 401
    
    data = request.get_json()
    if not data:
        return jsonify({"error": "Invalid data"}), 400
    
    object_type = data.get('object_type')
    channels = data.get('channels')
    enabled = data.get('enabled')
    confidence_min = data.get('confidence_min')
    model_name = data.get('model_name')

    if not model_name:
        return jsonify({"error": "Model name not specified"}), 400

    if not object_type or not channels:
        return jsonify({"error": "Missing object_type or channels"}), 400


    filePath = get_path_from_name(model_name)
    if(filePath is None):
        return jsonify({"error": f"Couldn't find config file with model name {model_name}"}), 400
    config = load_config(filePath)

    if 'yolov5_deepsort' not in config:
        return jsonify({"error": "Configuration not found"}), 500
    
    config['yolov5_deepsort'].setdefault('alert_configs', {})
    config['yolov5_deepsort']['alert_configs'][object_type] = {
        'enabled': enabled,
        'channels': channels,
        'confidence_min': confidence_min
    }

    save_config(config, filePath)
    return jsonify({"message": "Alert config saved successfully"}), 200


# Endpoint to delete alert configuration:
@app.route('/delete-alert', methods=['POST'])
def delete_alert():
    if request.headers.get('x-api-key') != API_KEY:
        return jsonify({"error": "Unauthorized"}), 401
    
    data = request.get_json()
    if not data:
        return jsonify({"error": "Invalid data"}), 400
    
    model_name = data.get('model_name')
    object_type = data.get('object_type')
    
    if not model_name: 
        return jsonify({"error": "Missing model_name"}), 400
    
    filePath = get_path_from_name(model_name)
    if(filePath is None):
        return jsonify({"error": "Couldn't find config file with model name " + model_name}), 400
    
    config = load_config(filePath)

    alerts = config['yolov5_deepsort'].get('alert_configs', {})
    if object_type in alerts:
        del alerts[object_type]
    else:
        return jsonify({"error": f"No alert config found for object_type: {object_type}"}), 404

    config['yolov5_deepsort']['alert_configs'] = alerts

    save_config(config, filePath)
    return jsonify({"message": "Detection deleted successfully"}), 200

    
       
# Endpoint to toggle whether or not an alert is enabled:
@app.route('/toggle-alert', methods=['POST'])
def toggle_alert():
    if request.headers.get('x-api-key') != API_KEY:
        return jsonify({"error": "Unauthorized"}), 401
    
    data = request.get_json()
    if not data:
        return jsonify({"error": "Invalid data"}), 400
    
    object_type = data.get('object_type')
    enabled = data.get('enabled')
    model_name = data.get('model_name')

    if not model_name:
        return jsonify({"error": "Missing model_name"}), 400
    if object_type is None or enabled is None:
        return jsonify({"error": "Missing object_type or enabled"}), 400
    
    filePath = get_path_from_name(model_name)
    if filePath is None:
        return jsonify({"error": f"Couldn't find config file with model name {model_name}"}), 400
    
    config = load_config(filePath)

    if 'yolov5_deepsort' not in config:
        return jsonify({"error": "Configuration not found"}), 500
    
    alert_configs = config['yolov5_deepsort'].get('alert_configs', {})

    if object_type not in alert_configs:
        return jsonify({"error": f"No alert config found for object_type: {object_type}"}), 404

    alert_configs[object_type]['enabled'] = enabled

    save_config(config, filePath)

    return jsonify({"message": "Alert toggled successfully"}), 200

# Endpoint to get the currently active model configuration:
@app.route('/get-config-default', methods=['GET'])
def get_config_default():
    if request.headers.get('x-api-key') != API_KEY:
        return jsonify({"error": "Unauthorized"}), 401

    for file in MODEL_DIR.iterdir():
        if file.is_file():
            try:
                config = load_config(file)
                if config.get('yolov5_deepsort', {}).get('main', {}).get('active', False):
                    return jsonify({
                        "path": str(file.resolve()),
                        "model_name": config['yolov5_deepsort']['main'].get('model_name', '')
                    })
            except Exception:
                continue

    return jsonify({"error": "No active model found"}), 404

if __name__ == '__main__':
    app.run(host='127.0.0.1', port=5000, debug=True)