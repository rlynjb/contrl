import { View, StyleSheet } from 'react-native';
import type { Landmark } from '../../lib/pose/landmarks';
import { POSE, SKELETON_CONNECTIONS } from '../../lib/pose/landmarks';

const GOOD_VISIBILITY = 0.6;
const DOT_SIZE = 8;
const LINE_WIDTH = 2;

interface SkeletonOverlayProps {
  landmarks: Landmark[];
  width: number;
  height: number;
  /** If true, rotate landmarks 90° for portrait mode */
  portrait?: boolean;
  /** If true, mirror x-axis (for front camera) */
  mirror?: boolean;
}

/**
 * Draws pose landmarks and skeleton connections as colored dots and lines.
 * Uses absolute positioning over the camera view.
 *
 * Landmarks are normalized (0-1), so we multiply by container dimensions.
 * Only draws landmarks used for exercise detection (shoulders, elbows, wrists,
 * hips, knees, ankles).
 */
export function SkeletonOverlay({ landmarks, width, height, portrait = true, mirror = false }: SkeletonOverlayProps) {
  if (width === 0 || height === 0 || landmarks.length === 0) return null;

  // Convert normalized landmark to screen coordinates
  // MediaPipe returns landmarks in camera's native orientation (landscape)
  // For portrait mode, rotate 90°: screenX = lm.y * width, screenY = (1 - lm.x) * height
  const toScreen = (lm: Landmark): { x: number; y: number } => {
    if (portrait) {
      const sx = lm.y * width;
      const sy = (1 - lm.x) * height;
      return { x: mirror ? width - sx : sx, y: sy };
    }
    const sx = lm.x * width;
    const sy = lm.y * height;
    return { x: mirror ? width - sx : sx, y: sy };
  };

  const relevantIndices = Object.values(POSE);

  return (
    <View style={[styles.container, { width, height }]} pointerEvents="none">
      {/* Connections (lines) */}
      {SKELETON_CONNECTIONS.map(([fromIdx, toIdx], i) => {
        const from = landmarks[fromIdx];
        const to = landmarks[toIdx];
        if (!from || !to) return null;

        const visible = from.visibility > GOOD_VISIBILITY && to.visibility > GOOD_VISIBILITY;

        const p1 = toScreen(from);
        const p2 = toScreen(to);
        const x1 = p1.x;
        const y1 = p1.y;
        const x2 = p2.x;
        const y2 = p2.y;

        const dx = x2 - x1;
        const dy = y2 - y1;
        const length = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx) * (180 / Math.PI);

        return (
          <View
            key={`line-${i}`}
            style={[
              styles.line,
              {
                width: length,
                height: LINE_WIDTH,
                left: x1,
                top: y1 - LINE_WIDTH / 2,
                backgroundColor: visible ? '#00e5ff' : 'rgba(107,138,171,0.4)',
                transform: [
                  { rotate: `${angle}deg` },
                ],
                transformOrigin: 'left center',
              },
            ]}
          />
        );
      })}

      {/* Dots */}
      {relevantIndices.map(idx => {
        const lm = landmarks[idx];
        if (!lm) return null;

        const visible = lm.visibility > GOOD_VISIBILITY;
        const p = toScreen(lm);
        const x = p.x - DOT_SIZE / 2;
        const y = p.y - DOT_SIZE / 2;

        return (
          <View
            key={`dot-${idx}`}
            style={[
              styles.dot,
              {
                left: x,
                top: y,
                backgroundColor: visible ? '#00e5ff' : 'rgba(107,138,171,0.4)',
                borderColor: visible ? 'rgba(0,229,255,0.6)' : 'transparent',
              },
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  dot: {
    position: 'absolute',
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    borderWidth: 1,
  },
  line: {
    position: 'absolute',
    borderRadius: LINE_WIDTH / 2,
  },
});
