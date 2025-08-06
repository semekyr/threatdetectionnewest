import cv2
import numpy as np
from deep_sort_realtime.deepsort_tracker import DeepSort

class DeepSortTracker:
    def __init__(self, tracker_config, visual_config):
        self.algo_name = "DeepSORT"
        self.track_history = {}

        self.DISP_TRACKS = visual_config.get('disp_tracks', True)
        self.DISP_OBJ_TRACK_BOX = visual_config.get('disp_obj_track_box', True)

        self.object_tracker = DeepSort(
            max_age=tracker_config.get('max_age', 30),
            n_init=tracker_config.get('n_init', 3),
            nms_max_overlap=tracker_config.get('nms_max_overlap', 1.0),
            max_cosine_distance=tracker_config.get('max_cosine_distance', 0.2),
            nn_budget=tracker_config.get('nn_budget', None),
            override_track_class=tracker_config.get('override_track_class', None),
            embedder=tracker_config.get('embedder', 'mobilenet'),
            half=tracker_config.get('half', True),
            bgr=tracker_config.get('bgr', False),
            embedder_gpu=tracker_config.get('embedder_gpu', True),
            embedder_model_name=tracker_config.get('embedder_model_name', None),
            embedder_wts=tracker_config.get('embedder_wts', None),
            polygon=tracker_config.get('polygon', False),
            today=tracker_config.get('today', None)
        )

    def update_tracks(self, detections, frame):
        """
        Input: detections from YOLO detector: list of (bbox_xywh, confidence, class)
        Output: list of active tracks
        """
        tracks = self.object_tracker.update_tracks(detections, frame=frame)
        return tracks

    def display_tracks(self, tracks, frame):
        """
        Draw bounding boxes and track lines on the frame.
        """
        for track in tracks:
            if not track.is_confirmed():
                continue

            track_id = track.track_id
            location = track.to_tlbr()[:4].astype(int)
            bbox = location
            bbox_center = ((bbox[0] + bbox[2]) // 2, (bbox[1] + bbox[3]) // 2)

            # Update and draw track lines
            prev_centers = self.track_history.get(track_id, [])
            prev_centers.append(bbox_center)
            self.track_history[track_id] = prev_centers

            if self.DISP_TRACKS and prev_centers:
                points = np.array(prev_centers, np.int32)
                cv2.polylines(frame, [points], False, (51, 225, 255), 2)

            if self.DISP_OBJ_TRACK_BOX:
                cv2.rectangle(frame, (bbox[0], bbox[1]), (bbox[2], bbox[3]), (0, 0, 255), 1)
                label = f"{track.det_class} (ID: {track_id})" if hasattr(track, 'det_class') else f"ID: {track_id}"
                cv2.putText(frame, label, (bbox[0], bbox[1] - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 0, 255), 1)
