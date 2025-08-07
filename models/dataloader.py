import cv2
import time
import requests
import yaml
from pathlib import Path

headers = {'x-api-key': 'efecd5a4-40ff-45df-b1d9-0e3256f2265d'}


# Load the configuration file from the local path:
config_path = Path("fe-models/config.yml")
if not config_path.exists():
    raise FileNotFoundError(f"Could not find config file at {config_path}")

with open(config_path, 'r') as file:
    config = yaml.safe_load(file)['yolov5_deepsort']['dataloader']


# Data Source Parameters:
DATA_SOURCE = config['data_source']   
WEBCAM_ID = config['webcam_id']  
DATA_PATH = config['data_path']  
FRAME_WIDTH = config['frame_width']
FRAME_HEIGHT = config['frame_height'] 

# Select Data Source: 
if DATA_SOURCE == "live": 
    cap = cv2.VideoCapture(WEBCAM_ID if WEBCAM_ID is not None else 0)
elif DATA_SOURCE == "video file": 
    print("Opening video from:", DATA_PATH)
    cap = cv2.VideoCapture(DATA_PATH)
else: print(f"Incorrect data source: {DATA_SOURCE}. Please use 'live' or 'video file'.")

if not cap.isOpened():
    raise RuntimeError(f"Could not open video source: {DATA_SOURCE} with ID: {WEBCAM_ID} or path: {DATA_PATH}")


# Set the frame width and height:
cap.set(cv2.CAP_PROP_FRAME_WIDTH, FRAME_WIDTH)
cap.set(cv2.CAP_PROP_FRAME_HEIGHT, FRAME_HEIGHT)

