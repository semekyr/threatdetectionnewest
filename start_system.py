#!/usr/bin/env python3
# This is to test whether the detection system is working. 

import subprocess
import sys
import time
import signal
import os
import requests
from pathlib import Path


# Check if all dependencies are installed (Debuggin an issue): 
def check_dependencies():
    try:
        import flask
        import yaml
        import requests
        import cv2
        print("All dependencies are installed")
        return True
    except ImportError as e:
        print(f"Missing dependency: {e}")
        return False


# Function to start the Flask API server (api.py):
def start_api_server():
    print("Starting API server...")
    try:
        # Launch the API server as a subprocess:
        api_process = subprocess.Popen([
            sys.executable, 'api.py'
        ], cwd=os.getcwd())
        
        # Give some time for the server to start:
        time.sleep(3)
        
        # Check if the server is up and runnning:
        try:
            import requests
            response = requests.get('http://127.0.0.1:5000/detection-status', 
                                  headers={'x-api-key': 'efecd5a4-40ff-45df-b1d9-0e3256f2265d'}, 
                                  timeout=5)
            if response.status_code == 200:
                print("API server started successfully")
                return api_process
            else:
                print("API server failed to start properly")
                api_process.terminate()
                return None
        except requests.exceptions.RequestException:
            print("API server is not responding")
            api_process.terminate()
            return None
            
    except Exception as e:
        print(f"Failed to start API server: {e}")
        return None

# Function to check if detection system should be auto-started:
def should_auto_start_detection():
    """Check if detection system should be started automatically"""
    # Check for command line argument
    if '--auto-start-detection' in sys.argv:
        return True
    
    # Check for environment variable
    if os.environ.get('AUTO_START_DETECTION', '').lower() in ['true', '1', 'yes']:
        return True
    
    return False

# Function to start the detection system (models/main.py):
def start_detection_system():
    print("Starting detection system...")
    try:
        # Check if there is an active model:
        config_path = Path('fe-models/config.yml')
        if not config_path.exists():
            print("No active model found - detection system will not start")
            print("   Use the frontend to configure and start detection manually")
            return None
        
        # Start detection system as a subprocess:
        detection_process = subprocess.Popen([
            sys.executable, 'models/main.py',
            '--config', 'fe-models/config.yml',
            '--cameras', 'configs/cameras.json'
        ], cwd=os.getcwd())
        
        # Give some time for the detection system to start:
        time.sleep(5)
        
        # Check if the detection system's camera status endpoint is running:
        try:
            response = requests.get('http://127.0.0.1:5050/camera_status', timeout=5)
            if response.status_code == 200:
                print("Detection system started successfully")
                return detection_process
            else:
                print("Detection system failed to start properly")
                detection_process.terminate()
                return None
        except requests.exceptions.RequestException:
            print("Detection system is not responding")
            detection_process.terminate()
            return None
            
    except Exception as e:
        print(f"Failed to start detection system: {e}")
        return None

# Function to check system status:
def check_system_status():
    """Check the status of all system components"""
    print("\nChecking system status...")
    
    # Check API server
    try:
        response = requests.get('http://127.0.0.1:5000/detection-status', 
                              headers={'x-api-key': 'efecd5a4-40ff-45df-b1d9-0e3256f2265d'}, 
                              timeout=5)
        if response.status_code == 200:
            print("API Server: Running")
        else:
            print("API Server: Error")
    except:
        print("API Server: Not responding")
    
    # Check detection system
    try:
        response = requests.get('http://127.0.0.1:5050/camera_status', timeout=5)
        if response.status_code == 200:
            print("Detection System: Running")
        else:
            print("Detection System: Error")
    except:
        print("Detection System: Not responding")
    
    # Check camera configuration
    camera_config = Path('configs/cameras.json')
    if camera_config.exists():
        print("Camera Configuration: Found")
    else:
        print("Camera Configuration: Not found")
    
    # Check model configuration
    model_config = Path('fe-models/config.yml')
    if model_config.exists():
        print("Model Configuration: Found")
    else:
        print("Model Configuration: Not found")

# Helper function to handle shutdown signals:
def signal_handler(signum, frame):
    print("\nShutting down system...")
    sys.exit(0)


# Main function to start up the system:
def main():
    print("Threat Detection System Startup")
    print("=" * 50)
    
    # Set up signal handlers for shutdown
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    # Check dependencies:
    if not check_dependencies():
        print("Dependency check failed. Exiting.")
        sys.exit(1)
    
    # Start API server:
    api_process = start_api_server()
    if not api_process:
        print("Failed to start API server. Exiting.")
        sys.exit(1)
    
    # Check if detection system should be auto-started
    detection_process = None
    if should_auto_start_detection():
        print("\nAuto-starting detection system...")
        detection_process = start_detection_system()
        if not detection_process:
            print("Detection system failed to start automatically.")
            print("   You can start it manually through the frontend.")
    else:
        print("\n Detection system auto-start disabled.")
        print("   Use the frontend to start detection when ready.")

    # Print system startup status:
    print("\n" + "=" * 50)
    print("System startup complete!")
    print("\n Next steps:")
    print("   1. Start the Electron frontend: npm start")
    print("   2. Navigate to the Dashboard")
    print("   3. Use the detection controls to start/stop the system")
    print("\n Services:")
    print(f"   • API Server: http://127.0.0.1:5000")
    if detection_process:
        print(f"   • Detection System: http://127.0.0.1:5050 (Auto-started)")
    else:
        print(f"   • Detection System: http://127.0.0.1:5050 (Manual start)")
    
    print("\nTips:")
    print("   • Use Ctrl+C to stop the system")
    print("   • Check the logs page for system information")
    print("   • Use --auto-start-detection flag to auto-start detection")
    print("=" * 50)
    
    try:
        # Keep the script running to monitor the subprocesses:
        while True:
            time.sleep(10)  # Check every 10 seconds instead of every second
            
            # Check if processes are still running
            if api_process.poll() is not None:
                print("API server has stopped unexpectedly")
                break
                
            if detection_process and detection_process.poll() is not None:
                print("Detection system has stopped unexpectedly")
                break
                
    except KeyboardInterrupt:
        print("\nReceived shutdown signal")
    finally:
        # Cleanup
        print("Cleaning up processes...")
        if api_process:
            api_process.terminate()
            try:
                api_process.wait(timeout=5)
                print("API server stopped")
            except subprocess.TimeoutExpired:
                api_process.kill()
                print("API server force-killed")
        
        if detection_process:
            detection_process.terminate()
            try:
                detection_process.wait(timeout=5)
                print("Detection system stopped")
            except subprocess.TimeoutExpired:
                detection_process.kill()
                print("Detection system force-killed")
        
        print("✅ System shutdown complete")

if __name__ == "__main__":
    main() 