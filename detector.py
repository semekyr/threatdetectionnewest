import cv2
import numpy as np
import torch
from datetime import datetime

class YOLOv5Detector:

    def __init__(self, model_name, config):
        self.config = config
        detector_config = config['detector']
        yolo_config = config['YOLO']
        self.schedule_config = config.get('detection_schedule', {})

        self.model_name = model_name or config['main']['model_name']
        self.model = self.load_model(self.model_name)
        self.classes = self.model.names
        self.device = 'cuda' if torch.cuda.is_available() else 'cpu'
        print("[YOLOv5Detector] Using device:", self.device)

        self.downscale_factor = detector_config['downscale_factor']
        self.confidence_threshold = detector_config['confidence_threshold']
        self.disp_boxes = detector_config['disp_obj_detect_box']

        tracked = detector_config['tracked_class']
        self.tracked_class = self.classes if tracked == 'all' else ([tracked] if isinstance(tracked, str) else tracked)

    def load_model(self, model_name):
        weights_path = self.config['YOLO'].get('weights', 'yolov5s.pt')
        if model_name == 'custom':
            model = torch.hub.load('ultralytics/yolov5', 'custom', path=weights_path)
        else:
            model = torch.hub.load('ultralytics/yolov5', model_name, pretrained=True)
        return model

    def run_yolo(self, frame):
        self.model.to(self.device)
        frame_width = int(frame.shape[1] / self.downscale_factor)
        frame_height = int(frame.shape[0] / self.downscale_factor)
        frame_resized = cv2.resize(frame, (frame_width, frame_height))

        yolo_result = self.model(frame_resized)
        labels, bb_cord = yolo_result.xyxyn[0][:, -1], yolo_result.xyxyn[0][:, :-1]
        return labels, bb_cord

    def class_to_label(self, x):
        return self.classes[int(x)]

    def extract_detections(self, results, frame, height, width):
        labels, bb_cordinates = results
        detections = []
        class_count = 0
        x_shape, y_shape = width, height

        for i in range(len(labels)):
            row = bb_cordinates[i]
            if row[4] >= self.confidence_threshold:
                x1, y1 = int(row[0] * x_shape), int(row[1] * y_shape)
                x2, y2 = int(row[2] * x_shape), int(row[3] * y_shape)

                class_name = self.class_to_label(labels[i])
                if class_name in self.tracked_class and self._is_schedule_active(class_name):
                    if self.disp_boxes:
                        self.plot_boxes(x1, y1, x2, y2, frame)

                    conf_val = float(row[4].item())
                    detections.append(([x1, y1, x2 - x1, y2 - y1], conf_val, class_name))
                    class_count += 1

        print(f"[YOLOv5Detector] Frame detections: {len(detections)}")
        return detections, class_count

    def plot_boxes(self, x1, y1, x2, y2, frame):
        cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 0), 2)

    def _is_schedule_active(self, class_name):
        if class_name not in self.schedule_config:
            return True  # Always active if no schedule
        now = datetime.now().time()

        for period in self.schedule_config[class_name]:
            try:
                start_time = datetime.strptime(str(period['start']), '%H:%M').time()
                end_time = datetime.strptime(str(period['end']), '%H:%M').time()

                if start_time <= end_time:
                    if start_time <= now <= end_time:
                        return True
                else:
                    if now >= start_time or now <= end_time:
                        return True
            except Exception as e:
                print(f"[Schedule Error] Invalid time format for '{class_name}': {e}")
                continue
        return False
