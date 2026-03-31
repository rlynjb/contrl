import { useCallback, useState, useEffect } from 'react';
import { View, Text, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import type { CameraPosition } from 'react-native-vision-camera';
import { Camera } from 'react-native-vision-camera';
import {
  usePoseDetection,
  MediapipeCamera,
  RunningMode,
  Delegate,
  type PoseDetectionResultBundle,
  type DetectionCallbacks,
} from 'react-native-mediapipe-posedetection';
import type { Landmark as MPLandmark } from 'react-native-mediapipe-posedetection';
import type { Landmark } from '../../lib/pose/landmarks';
import { SkeletonOverlay } from './SkeletonOverlay';
import { colors, fonts } from '../../constants/theme';

const POSE_MODEL = 'pose_landmarker_lite.task';

interface PoseCameraProps {
  onLandmarks: (landmarks: Landmark[]) => void;
  children?: React.ReactNode;
}

export function PoseCamera({ onLandmarks, children }: PoseCameraProps) {
  const [confidence, setConfidence] = useState(0);
  const [ready, setReady] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState<'loading' | 'granted' | 'denied'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [camera, setCamera] = useState<CameraPosition>('front');
  const [currentLandmarks, setCurrentLandmarks] = useState<Landmark[]>([]);
  const [cameraSize, setCameraSize] = useState({ width: 0, height: 0 });

  // Request camera permission
  useEffect(() => {
    (async () => {
      const status = await Camera.requestCameraPermission();
      setPermissionStatus(status === 'granted' ? 'granted' : 'denied');
    })();
  }, []);

  const callbacks: DetectionCallbacks<PoseDetectionResultBundle> = {
    onResults: useCallback((result: PoseDetectionResultBundle) => {
      if (result.results.length > 0 && result.results[0].landmarks.length > 0) {
        const rawLandmarks = result.results[0].landmarks[0];
        const landmarks: Landmark[] = rawLandmarks.map((lm: MPLandmark) => ({
          x: lm.x,
          y: lm.y,
          z: lm.z,
          visibility: lm.visibility ?? 0,
        }));

        const avgVisibility =
          landmarks.reduce((sum, l) => sum + l.visibility, 0) / landmarks.length;
        setConfidence(Math.round(avgVisibility * 100));

        setCurrentLandmarks(landmarks);
        if (!ready) setReady(true);
        onLandmarks(landmarks);
      }
    }, [onLandmarks, ready]),
    onError: useCallback((err: { code: number; message: string }) => {
      console.warn('[PoseCamera] Detection error:', err.message);
      setError(err.message);
    }, []),
  };

  const solution = usePoseDetection(callbacks, RunningMode.LIVE_STREAM, POSE_MODEL, {
    numPoses: 1,
    minPoseDetectionConfidence: 0.5,
    minPosePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
    delegate: Delegate.GPU,
    mirrorMode: 'mirror-front-only',
  });

  if (permissionStatus === 'loading') {
    return (
      <View style={styles.centeredContainer}>
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={styles.statusText}>Requesting camera permission...</Text>
      </View>
    );
  }

  if (permissionStatus === 'denied') {
    return (
      <View style={styles.centeredContainer}>
        <Text style={styles.errorText}>Camera permission denied</Text>
        <Text style={styles.statusText}>
          Go to Settings and enable camera access for contrl
        </Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centeredContainer}>
        <Text style={styles.errorText}>Pose detection error</Text>
        <Text style={styles.statusText}>{error}</Text>
      </View>
    );
  }

  return (
    <View
      style={styles.container}
      onLayout={e => {
        const { width, height } = e.nativeEvent.layout;
        setCameraSize({ width, height });
      }}
    >
      <MediapipeCamera
        style={styles.camera}
        solution={solution}
        activeCamera={camera}
        resizeMode="cover"
      />

      {ready && currentLandmarks.length > 0 && (
        <SkeletonOverlay
          landmarks={currentLandmarks}
          width={cameraSize.width}
          height={cameraSize.height}
          portrait
          mirror={camera === 'front'}
        />
      )}

      {!ready && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={styles.statusText}>Loading pose detection...</Text>
        </View>
      )}

      {ready && (
        <View style={styles.topRow}>
          <Pressable
            style={styles.flipButton}
            onPress={() => setCamera(c => c === 'front' ? 'back' : 'front')}
          >
            <Feather name="refresh-cw" size={16} color="#fff" />
          </Pressable>
          <View style={styles.confidenceBadge}>
            <Text
              style={[
                styles.confidenceText,
                { color: confidence > 60 ? colors.success : colors.warning },
              ]}
            >
              {confidence}%
            </Text>
          </View>
        </View>
      )}

      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  centeredContainer: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  camera: {
    flex: 1,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  statusText: {
    color: colors.muted,
    fontFamily: fonts.regular,
    fontSize: 14,
    marginTop: 12,
    textAlign: 'center',
  },
  errorText: {
    color: colors.danger,
    fontFamily: fonts.bold,
    fontSize: 16,
  },
  topRow: {
    position: 'absolute',
    top: 50,
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  flipButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  confidenceBadge: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  confidenceText: {
    fontSize: 12,
    fontFamily: fonts.semiBold,
  },
});
