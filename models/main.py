import cv2
import time
import yaml
import argparse
import threading
from pathlib import Path
from multiprocessing import Queue
from flask import Flask, Response, send_file
from multiprocessing import freeze_support
import requests
from datetime import datetime
from detector import YOLOv5Detector
from tracker import DeepSortTracker
import io
import json
import base64

def write_system_log(message, log_type='info', category='system'):
    # Write a system log entry to the backend API:
    try:
        log_data = {
            'message': message,
            'type': log_type,
            'category': category,
            'timestamp': datetime.now().isoformat()
        }
        
        # Send log to the main API server
        response = requests.post(
            'http://127.0.0.1:5000/write-system-log',
            json=log_data,
            headers={'x-api-key': 'efecd5a4-40ff-45df-b1d9-0e3256f2265d'},
            timeout=2
        )
        
        if response.status_code == 200:
            print(f"[{log_type.upper()}] [{category}] {message}")
        else:
            print(f"[LOG ERROR] Failed to write log: {response.status_code}")
            
    except Exception as e:
        # Fallback to console if API is not available
        print(f"[{log_type.upper()}] [{category}] {message}")
        print(f"[LOG ERROR] Could not send to API: {e}")

# Shared manager for storing analyzed frames per camera:
# Use regular dictionaries with thread locks for Windows compatibility
analyzed_frames = {}  # camera_id -> frame_bytes
camera_processes = {}  # camera_id -> process_status
frames_lock = threading.Lock()
processes_lock = threading.Lock()

# Alert tracking to prevent spam:
alert_cooldowns = {}  # camera_id -> {object_type -> last_alert_time}
alert_cooldown_duration = 30  # seconds between alerts for same object type

# Flask app to stream detection frames
stream_app = Flask(__name__)

# Route to stream detection frames:
@stream_app.route('/video_feed/<camera_id>')
def video_feed(camera_id):
    def generate():
        while True:
            with frames_lock:
                if camera_id in analyzed_frames:
                    frame = analyzed_frames[camera_id]
                    yield (b'--frame\r\n'
                           b'Content-Type: image/jpeg\r\n\r\n' + frame + b'\r\n')
            time.sleep(0.1)  # 10 FPS
    return Response(generate(), mimetype='multipart/x-mixed-replace; boundary=frame')


# Route to get analyzed frame:
@stream_app.route('/get_analysed_frame/<camera_id>')
def get_analysed_frame(camera_id):
    with frames_lock:
        if camera_id in analyzed_frames:
            frame = analyzed_frames[camera_id]
            return Response(frame, mimetype='image/jpeg')
        else:
            return jsonify({"error": "Camera not found or no frame available"}), 404

# Route to get camera status:
@stream_app.route('/camera_status')
def camera_status():
    with processes_lock:
        return jsonify(dict(camera_processes))

# Route to get alert status:
@stream_app.route('/alert_status')
def alert_status():
    #Get current alert status and cooldown information
    return jsonify({
        "alert_cooldowns": alert_cooldowns,
        "cooldown_duration": alert_cooldown_duration
    })


# Alert functions
def send_email_alert(email_addresses, camera_id, object_type, confidence, timestamp):
    # Send email alert for detected object
    try:
        subject = f"Security Alert: {object_type} detected on camera {camera_id}"
        body = f"""
        Security Alert Detected!
        
        Camera: {camera_id}
        Object Type: {object_type}
        Confidence: {confidence:.2f}
        Timestamp: {timestamp}
        
        This is an automated alert from the threat detection system.
        """
        
        print(f"[ALERT] Email alert would be sent to {email_addresses}: {subject}")
        return True
    except Exception as e:
        print(f"[ALERT ERROR] Failed to send email alert: {e}")
        return False

def send_viber_alert(viber_token, camera_id, object_type, confidence, timestamp):
    # Send Viber alert for detected object:
    try:
        if not viber_token:
            return False
            
        message = f"Security Alert: {object_type} detected on camera {camera_id} (confidence: {confidence:.2f})"
        
        # Viber API implementation would go here
        # For now, just log the alert
        print(f"[ALERT] Viber alert would be sent with token {viber_token}: {message}")
        return True
    except Exception as e:
        print(f"[ALERT ERROR] Failed to send Viber alert: {e}")
        return False

def send_api_alert(api_endpoint, camera_id, object_type, confidence, timestamp):
    # Send API alert for detected object:
    try:
        if not api_endpoint:
            return False
            
        payload = {
            "camera_id": camera_id,
            "object_type": object_type,
            "confidence": confidence,
            "timestamp": timestamp,
            "alert_type": "object_detection"
        }
        
        response = requests.post(api_endpoint, json=payload, timeout=5)
        if response.status_code == 200:
            print(f"[ALERT] API alert sent successfully to {api_endpoint}")
            return True
        else:
            print(f"[ALERT ERROR] API alert failed with status {response.status_code}")
            return False
    except Exception as e:
        print(f"[ALERT ERROR] Failed to send API alert: {e}")
        return False

def check_and_send_alerts(camera_id, detections, alert_configs):
    # Check detections against alert configurations and send alerts if needed:
    current_time = datetime.now()
    
    # Initialize cooldown tracking for this camera if not exists
    if camera_id not in alert_cooldowns:
        alert_cooldowns[camera_id] = {}
    
    for detection in detections:
        bbox, confidence, class_name = detection
        
        # Check if this object type has alert configuration
        if class_name in alert_configs:
            alert_config = alert_configs[class_name]
            
            # Check if alerts are enabled and confidence meets threshold
            if (alert_config.get('enabled', False) and 
                confidence >= alert_config.get('confidence_min', 0.8)):
                
                # Check cooldown to prevent spam
                last_alert_time = alert_cooldowns[camera_id].get(class_name)
                if (last_alert_time is None or 
                    (current_time - last_alert_time).total_seconds() > alert_cooldown_duration):
                    
                    # Send alerts through configured channels
                    channels = alert_config.get('channels', {})
                    timestamp = current_time.strftime("%Y-%m-%d %H:%M:%S")
                    
                    # Email alerts
                    if channels.get('email'):
                        email_addresses = channels['email'].split(',')
                        for email in email_addresses:
                            send_email_alert(email.strip(), camera_id, class_name, confidence, timestamp)
                    
                    # Viber alerts
                    if channels.get('viber'):
                        send_viber_alert(channels['viber'], camera_id, class_name, confidence, timestamp)
                    
                    # API alerts
                    if channels.get('api'):
                        send_api_alert(channels['api'], camera_id, class_name, confidence, timestamp)
                    
                    # Update cooldown
                    alert_cooldowns[camera_id][class_name] = current_time
                    print(f"[ALERT] Alert sent for {class_name} on camera {camera_id}")
                    write_system_log(f"Alert sent for {class_name} on camera {camera_id} (confidence: {confidence:.2f})", 'warning', 'alert')


# Helper function to start Flask server:
def start_flask():
    stream_app.run(host='127.0.0.1', port=5050, debug=False, use_reloader=False)

# Helper function to parse arguments:
# 1. config: Path to config YAML file
# 2. cameras: Path to cameras.json file
def parse_args():
    parser = argparse.ArgumentParser(description="Threat Detection Pipeline")
    parser.add_argument('--config', type=str, default="../fe-models/config.yml",
                        help="Path to config YAML file")
    parser.add_argument('--cameras', type=str, default="../configs/cameras.json",
                        help="Path to cameras config JSON file")
    return parser.parse_args()

# Function to run detection for a camera:
# 1. camera_config: Camera configuration
# 2. config_path: Path to config YAML file
def run_detection_for_camera(camera_config, config_path):
    camera_id = camera_config['id']
    source = camera_config['source'] 
    camera_type = camera_config['type'] # can be file, ip or youtube
    
    print(f"Starting detection for camera: {camera_id}")
    write_system_log(f"Starting detection for camera: {camera_id} ({source})", 'info', 'detection')

    config_path = Path(config_path)
    if not config_path.exists():
        print(f"Config file not found at {config_path}")
        with processes_lock:
            camera_processes[camera_id] = "error"
        return

    try:
        # Load config file:
        with open(config_path, 'r') as f:
            full_config = yaml.safe_load(f)['yolov5_deepsort']
        print("Config loaded successfully")

        # Extract necessary configs:
        main_config = full_config['main']
        dataloader_config = full_config['dataloader']
        tracker_config = full_config['tracker']
        visual_config = {
            'disp_tracks': tracker_config.get('disp_tracks', True),
            'disp_obj_track_box': tracker_config.get('disp_obj_track_box', True)
        }

        # Handle different camera types:
        if camera_type == 'file':
            video_source = source
        elif camera_type == 'ip':
            video_source = source
        elif camera_type == 'youtube':
            # Skip YouTube cameras for now!
            print(f"YouTube videos not supported: {camera_id}")
            with processes_lock:
                camera_processes[camera_id] = "unsupported"
            return
        else:
            video_source = source

        # Open stream for camera:
        print(f"Opening stream for camera: {camera_id}")
        cap = cv2.VideoCapture(video_source)
        if not cap.isOpened():
            print(f"Failed to open stream: {video_source}")
            with processes_lock:
                camera_processes[camera_id] = "error"
            return

        cap.set(cv2.CAP_PROP_FRAME_WIDTH, dataloader_config.get('frame_width', 1280))
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, dataloader_config.get('frame_height', 720))

        # Initialize object detector and tracker:
        object_detector = YOLOv5Detector(model_name=main_config['model_name'], config=full_config)
        tracker = DeepSortTracker(tracker_config, visual_config)

        # Get alert configurations
        alert_configs = full_config.get('alert_configs', {})

        # Set camera status to running:
        with processes_lock:
            camera_processes[camera_id] = "running"

        while True:
            success, img = cap.read()
            if not success:
                print(f"[{camera_id}] Failed to read frame")
                break

            start = time.time()

            results = object_detector.run_yolo(img)
            height, width = img.shape[:2]
            detections, num_objects = object_detector.extract_detections(results, img, height, width)
            print(f"[{camera_id}] Detections: {num_objects}")

            # Check for alerts if we have detections
            if detections and alert_configs:
                check_and_send_alerts(camera_id, detections, alert_configs)

            tracks_current = tracker.object_tracker.update_tracks(detections, frame=img)

            for det, track in zip(detections, tracks_current):
                if track.is_confirmed():
                    track.det_class = det[2]
                    x1, y1, w, h = det[0]
                    x2, y2 = x1 + w, y1 + h
                    label = f"{track.det_class} {det[1]:.2f}"

                    cv2.rectangle(img, (x1, y1), (x2, y2), (0, 255, 0), 2)
                    cv2.putText(img, label, (x1, y1 - 10), cv2.FONT_HERSHEY_SIMPLEX,
                                0.5, (0, 255, 0), 2)

            tracker.display_tracks(tracks_current, img)

            fps = int(1 / max(time.time() - start, 1e-6))
            overlay_text = f'{camera_id} - FPS: {fps} - Det: {num_objects}'
            cv2.putText(img, overlay_text, (20, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2)
            
            # Store the analyzed frame:
            ret, buffer = cv2.imencode('.jpg', img)
            if ret:
                with frames_lock:
                    analyzed_frames[camera_id] = buffer.tobytes()
                print(f"[{camera_id}] Frame analysis completed")

            if cv2.waitKey(1) & 0xFF == 27:  # ESC key to stop
                break

        cap.release()
        cv2.destroyAllWindows()
        with processes_lock:
            camera_processes[camera_id] = "stopped"
        print(f"Detection stopped for camera: {camera_id}")
        
    except Exception as e:
        print(f"Error in detection for camera {camera_id}: {e}")
        with processes_lock:
            camera_processes[camera_id] = "error"


def run(queue, config_path, cameras_path):
    print("Starting multi-camera detection system")
    
    # Load cameras configuration:
    cameras_path = Path(cameras_path)
    if not cameras_path.exists():
        print(f"Cameras config file not found at {cameras_path}")
        return
    
    with open(cameras_path, 'r') as f:
        cameras = json.load(f)
    
    # For debugging:
    print(f"Loaded {len(cameras)} cameras")
    
    # Start detection for each camera in separate threads:
    detection_threads = []
    for camera in cameras:
        thread = threading.Thread(
            target=run_detection_for_camera,
            args=(camera, config_path)
        )
        thread.daemon = True
        thread.start()
        detection_threads.append(thread)
        print(f"Started detection thread for camera: {camera['id']}")
    
    # Keep main thread alive
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("Shutting down detection system...")
        with processes_lock:
            camera_processes.clear()
        with frames_lock:
            analyzed_frames.clear()

if __name__ == "__main__":
    freeze_support()  
    args = parse_args()

    # Start Flask streaming:
    flask_thread = threading.Thread(target=start_flask)
    flask_thread.daemon = True
    flask_thread.start()
    print("Flask server started on port 5050.")

    # Start detection
    run(queue=None, config_path=args.config, cameras_path=args.cameras)


if __name__ == "__main__":
    freeze_support()  
    args = parse_args()

    # Start Flask streaming:
    flask_thread = threading.Thread(target=start_flask)
    flask_thread.daemon = True
    flask_thread.start()
    print("Flask server started on port 5050.")

    # Start detection
    run(queue=None, config_path=args.config, cameras_path=args.cameras)
