import { useState, useRef, useCallback, useEffect } from 'react';
import { Modal } from 'react-native';
import type { Category, Exercise } from '../../types';
import type { Landmark } from '../../lib/pose/landmarks';
import type { RepPhase } from '../../lib/pose/rep-counter';
import { createPushupProcessor } from '../../lib/pose/exercises/pushup';
import { createSquatProcessor } from '../../lib/pose/exercises/squat';
import { createPlankProcessor } from '../../lib/pose/exercises/plank';
import { PoseCamera } from './PoseCamera';
import { SetCameraHUD } from './SetCameraHUD';
import { DebugPanel } from './DebugPanel';

interface SetCameraOverlayProps {
  category: Category;
  exercise: Exercise;
  setIndex: number;
  targetValue: number;
  onComplete: (value: number) => void;
  onClose: () => void;
}

export function SetCameraOverlay({
  category,
  exercise,
  setIndex,
  targetValue,
  onComplete,
  onClose,
}: SetCameraOverlayProps) {
  const [repCount, setRepCount] = useState(0);
  const [holdTimeMs, setHoldTimeMs] = useState(0);
  const [targetReached, setTargetReached] = useState(false);
  const [isHolding, setIsHolding] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);

  // Debug state
  const [debugAngle, setDebugAngle] = useState(0);
  const [debugPhase, setDebugPhase] = useState<RepPhase | 'holding' | 'broken' | null>(null);

  const lastFrameTimeRef = useRef(0);

  // Create processor once on mount
  const processorRef = useRef(
    exercise.isHold
      ? { type: 'plank' as const, processor: createPlankProcessor() }
      : category === 'squat'
        ? { type: 'rep' as const, processor: createSquatProcessor() }
        : { type: 'rep' as const, processor: createPushupProcessor() }
  );

  // Countdown timer
  useEffect(() => {
    if (countdown === null || countdown <= 0) return;
    const timer = setTimeout(() => setCountdown(prev => (prev ?? 1) - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  const handleStart = useCallback(() => {
    setCountdown(10);
  }, []);

  const handleLandmarks = useCallback((landmarks: Landmark[]) => {
    if (countdown === null || countdown > 0) return;

    const { type, processor } = processorRef.current;
    const now = performance.now();

    if (type === 'plank') {
      if (targetReached) return;
      const deltaMs = lastFrameTimeRef.current > 0 ? now - lastFrameTimeRef.current : 0;
      lastFrameTimeRef.current = now;

      const result = processor.processFrame(landmarks, deltaMs);
      setHoldTimeMs(result.holdTimeMs);
      setIsHolding(result.isHolding);
      setDebugAngle(result.alignmentAngle);
      setDebugPhase(result.isHolding ? 'holding' : 'broken');
      if (Math.round(result.holdTimeMs / 1000) >= targetValue) {
        setTargetReached(true);
      }
    } else {
      if (targetReached) return;
      const result = processor.processFrame(landmarks);
      setDebugAngle(result.angle);
      setDebugPhase(result.phase);
      if (result.repCompleted) {
        setRepCount(prev => {
          const next = prev + 1;
          if (next >= targetValue) setTargetReached(true);
          return next;
        });
      }
    }
  }, [targetValue, targetReached, countdown]);

  const handleDone = useCallback(() => {
    if (exercise.isHold) {
      onComplete(Math.round(holdTimeMs / 1000));
    } else {
      onComplete(repCount);
    }
  }, [exercise.isHold, holdTimeMs, repCount, onComplete]);

  const exerciseType = exercise.isHold
    ? 'Plank (alignment)'
    : category === 'squat'
      ? 'Squat (knee angle)'
      : 'Push-up (elbow angle)';

  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="fullScreen"
      statusBarTranslucent
    >
      <PoseCamera onLandmarks={handleLandmarks}>
        <SetCameraHUD
          exerciseName={exercise.name}
          setLabel={`Set ${setIndex + 1} / ${exercise.targetSets}`}
          isHold={exercise.isHold}
          repCount={repCount}
          holdTimeMs={holdTimeMs}
          targetValue={targetValue}
          targetReached={targetReached}
          isHolding={isHolding}
          countdown={countdown}
          onStart={handleStart}
          onDone={handleDone}
          onCancel={onClose}
        />
        {countdown !== null && (
          <DebugPanel
            angle={debugAngle}
            phase={debugPhase}
            repCount={repCount}
            holdTimeMs={holdTimeMs}
            isHold={exercise.isHold}
            exerciseType={exerciseType}
          />
        )}
      </PoseCamera>
    </Modal>
  );
}
