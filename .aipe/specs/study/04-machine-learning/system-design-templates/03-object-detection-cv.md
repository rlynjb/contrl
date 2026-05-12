# Object detection / CV system design

**Industry name(s):** Object detection, computer vision pipeline, IK Module 4
**Type:** Industry standard

> Given an image (or video frame), produce bounding boxes + labels (or keypoints, or per-pixel segmentation). The architectural shape contrl-mo's pose pipeline shares — MediaPipe is exactly this template at pose-keypoint granularity.

**See also:** → [../13-on-device-inference.md](../13-on-device-inference.md) · → [../../01-system-design/07-pose-detection-pipeline.md](../../01-system-design/07-pose-detection-pipeline.md)

---

- **The prompt:** Design a computer vision system that processes a video stream and produces labeled detections (objects, keypoints, segments) at near-real-time frame rates.

- **Standard architecture:**

  ```
  camera frame
       │
       ▼
  ┌──────────────────┐
  │ preprocessing    │  ── resize, normalize, color-space convert
  └────────┬─────────┘
           │
           ▼
  ┌──────────────────┐
  │ CNN backbone     │  ── MobileNet / EfficientNet / BlazePose / YOLO
  │ (GPU delegate)   │       per-frame inference at 30+fps
  └────────┬─────────┘
           │
           ▼
  ┌──────────────────┐
  │ post-process     │  ── NMS (object detection)
  │                  │     keypoint extraction (pose)
  │                  │     segmentation map (semseg)
  └────────┬─────────┘
           │
           ▼
  ┌──────────────────┐
  │ downstream logic │  ── per-frame state, FSM, app logic
  │ (per-frame)      │
  └──────────────────┘
  ```

- **Data model:**
  - `frames` — `{id, source, timestamp, raw_bytes}` (usually NOT persisted; only metadata)
  - `detections` — `{frame_id, box / keypoints, label, confidence}`
  - `tracks` — `{track_id, frame_id, detection_id}` for cross-frame association

- **Key components:**
  - *Preprocessing*: resize to model input size, normalize pixel values, optionally convert color space (RGB ↔ BGR). On-device, ideally on the GPU.
  - *Backbone model*: the inference engine. Mobile-friendly architectures (MobileNet, EfficientDet-Lite, BlazePose) trade some accuracy for speed.
  - *Post-process*: NMS (non-maximum suppression) for object detection; pixel-to-coord for keypoints; argmax for segmentation.
  - *Tracking (optional)*: associate detections across frames (Kalman / SORT for object tracking; temporal smoothing for keypoints — see [../06-domain-gap-and-transfer-learning.md] and the smoothing pattern in contrl-mo).
  - *Eval*: mAP for object detection; PCK (percentage of correct keypoints) for pose; IoU for segmentation.

- **Scale concerns:**
  - At ~30fps capture and weaker phones: inference time exceeds frame interval. Mitigation: skip frames, lower resolution, smaller model variant (lite vs full).
  - At ~4 people in scene: multi-pose models slow down linearly. Mitigation: numPoses cap; switch to single-person modes when only one person tracked.
  - At ~100k bundled-model size: APK exceeds Play Store limits. Mitigation: quantize, use Play Asset Delivery for model files.

- **Eval framing:**
  - Offline: mAP @ IoU thresholds (object detection); PCK @ pixel thresholds (pose); pixel accuracy + mIoU (segmentation).
  - Online: per-frame latency (95th percentile), drop rate (frames missed), per-feature accuracy at deployment site.
  - Self-labeled validation set is essential — public test sets don't match deployment conditions ([../06-domain-gap-and-transfer-learning.md]).

- **Common failure modes:**
  - Occlusion (joint hidden behind body). Mitigation: visibility scores, skip frames with low confidence (see C-flag in [../../01-system-design/07-pose-detection-pipeline.md]).
  - Lighting / camera variance (model trained in studio, deployed at home). Mitigation: data augmentation, transfer learning, fine-tune on self.
  - Multiple subjects (model trained on one, scene has many). Mitigation: bigger model, or single-subject app constraint.
  - Latency variance (occasional 100ms inference). Mitigation: profile, prefer steady-state perf over peak.

- **Applies to this codebase:** `yes`. contrl-mo's pose pipeline is exactly this template: camera → MediaPipe pose model (BlazePose architecture, GPU-delegated) → per-frame keypoints → JS-side FSM. The pose model is quantized (lite variant). Inference at ~30fps on-device. Skip-frame behavior is implicit in `RunningMode.LIVE_STREAM`.

- **How to make it apply: (already applies)**. The form classifier (Phase 2C) is a *downstream* CV pipeline that takes pose keypoints as input — making this template the foundation for both pose detection (shipped) and per-rep form classification (planned). Defending the template = defending the existing camera pipeline plus the planned classifier.
