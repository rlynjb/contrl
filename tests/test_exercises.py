"""Tests for the exercise library."""

from calistheniq.exercises import (
    Exercise,
    ExerciseLibrary,
    DifficultyLevel,
    MuscleGroup
)


def test_exercise_creation():
    """Test creating an exercise."""
    exercise = Exercise(
        name="Test Push-up",
        description="A test exercise",
        difficulty=DifficultyLevel.BEGINNER,
        muscle_groups=[MuscleGroup.CHEST],
        form_cues=["Keep body straight"],
        common_mistakes=["Sagging hips"],
        sets=3,
        reps="10-12"
    )
    
    assert exercise.name == "Test Push-up"
    assert exercise.difficulty == DifficultyLevel.BEGINNER
    assert MuscleGroup.CHEST in exercise.muscle_groups
    assert len(exercise.form_cues) == 1


def test_exercise_library_beginner():
    """Test getting beginner exercises."""
    exercises = ExerciseLibrary.get_beginner_exercises()
    
    assert len(exercises) > 0
    assert "wall_pushup" in exercises
    assert "bodyweight_squat" in exercises
    
    wall_pushup = exercises["wall_pushup"]
    assert wall_pushup.difficulty == DifficultyLevel.BEGINNER
    assert len(wall_pushup.form_cues) > 0


def test_exercise_library_get_exercise():
    """Test getting a specific exercise."""
    exercise = ExerciseLibrary.get_exercise("wall_pushup")
    
    assert exercise is not None
    assert exercise.name == "Wall Push-up"
    assert exercise.difficulty == DifficultyLevel.BEGINNER


def test_exercise_progressions():
    """Test exercise progressions and regressions."""
    exercises = ExerciseLibrary.get_beginner_exercises()
    
    wall_pushup = exercises["wall_pushup"]
    incline_pushup = exercises["incline_pushup"]
    
    # Wall pushup should progress to incline pushup (harder)
    assert "incline_pushup" in wall_pushup.progressions
    
    # Incline pushup should regress to wall pushup (easier)
    assert "wall_pushup" in incline_pushup.regressions


if __name__ == "__main__":
    test_exercise_creation()
    test_exercise_library_beginner()
    test_exercise_library_get_exercise()
    test_exercise_progressions()
    print("✓ All exercise tests passed!")
