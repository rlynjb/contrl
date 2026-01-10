"""
Exercise definitions and progressions for calisthenics training.
"""

from enum import Enum
from typing import List, Dict, Optional
from pydantic import BaseModel, Field


class DifficultyLevel(str, Enum):
    """Exercise difficulty levels."""
    BEGINNER = "beginner"
    INTERMEDIATE = "intermediate"
    ADVANCED = "advanced"


class MuscleGroup(str, Enum):
    """Primary muscle groups targeted."""
    CHEST = "chest"
    BACK = "back"
    SHOULDERS = "shoulders"
    ARMS = "arms"
    CORE = "core"
    LEGS = "legs"


class Exercise(BaseModel):
    """Represents a single exercise."""
    name: str
    description: str
    difficulty: DifficultyLevel
    muscle_groups: List[MuscleGroup]
    form_cues: List[str] = Field(default_factory=list, description="Key form points to focus on")
    common_mistakes: List[str] = Field(default_factory=list, description="Common form errors to avoid")
    regressions: List[str] = Field(default_factory=list, description="Easier variations")
    progressions: List[str] = Field(default_factory=list, description="Harder variations")
    sets: int = Field(default=3, description="Recommended sets")
    reps: str = Field(default="8-12", description="Recommended rep range")
    rest_seconds: int = Field(default=60, description="Rest between sets")
    

class ExerciseLibrary:
    """Library of exercises with progressions."""
    
    @staticmethod
    def get_beginner_exercises() -> Dict[str, Exercise]:
        """Get beginner-friendly exercises."""
        return {
            "wall_pushup": Exercise(
                name="Wall Push-up",
                description="Push-up performed against a wall to reduce resistance",
                difficulty=DifficultyLevel.BEGINNER,
                muscle_groups=[MuscleGroup.CHEST, MuscleGroup.ARMS, MuscleGroup.SHOULDERS],
                form_cues=[
                    "Stand arm's length from wall",
                    "Keep body straight from head to heels",
                    "Lower chest to wall with control",
                    "Push back to starting position"
                ],
                common_mistakes=[
                    "Hips sagging or piking",
                    "Elbows flaring out too wide",
                    "Not going through full range of motion"
                ],
                progressions=["incline_pushup"],
                regressions=[],
                sets=3,
                reps="10-15",
                rest_seconds=60
            ),
            "incline_pushup": Exercise(
                name="Incline Push-up",
                description="Push-up with hands elevated on a bench or elevated surface",
                difficulty=DifficultyLevel.BEGINNER,
                muscle_groups=[MuscleGroup.CHEST, MuscleGroup.ARMS, MuscleGroup.SHOULDERS],
                form_cues=[
                    "Hands on elevated surface shoulder-width apart",
                    "Body forms straight line",
                    "Lower until chest nearly touches surface",
                    "Press back up maintaining form"
                ],
                common_mistakes=[
                    "Dropping hips",
                    "Not maintaining neutral spine",
                    "Rushing the movement"
                ],
                progressions=["knee_pushup"],
                regressions=["wall_pushup"],
                sets=3,
                reps="8-12",
                rest_seconds=60
            ),
            "knee_pushup": Exercise(
                name="Knee Push-up",
                description="Push-up performed from knees to reduce load",
                difficulty=DifficultyLevel.BEGINNER,
                muscle_groups=[MuscleGroup.CHEST, MuscleGroup.ARMS, MuscleGroup.SHOULDERS],
                form_cues=[
                    "Knees on ground, hands shoulder-width",
                    "Straight line from knees to head",
                    "Lower chest with control",
                    "Push back up smoothly"
                ],
                common_mistakes=[
                    "Hips sagging",
                    "Looking up instead of down",
                    "Not lowering enough"
                ],
                progressions=["standard_pushup"],
                regressions=["incline_pushup"],
                sets=3,
                reps="10-15",
                rest_seconds=60
            ),
            "dead_hang": Exercise(
                name="Dead Hang",
                description="Hanging from a bar to build grip strength and shoulder stability",
                difficulty=DifficultyLevel.BEGINNER,
                muscle_groups=[MuscleGroup.BACK, MuscleGroup.ARMS, MuscleGroup.SHOULDERS],
                form_cues=[
                    "Grip bar with hands shoulder-width",
                    "Hang with straight arms",
                    "Engage shoulders slightly",
                    "Keep core tight"
                ],
                common_mistakes=[
                    "Completely relaxing shoulders",
                    "Swinging",
                    "Gripping too tight causing early fatigue"
                ],
                progressions=["assisted_pullup"],
                regressions=[],
                sets=3,
                reps="10-30 seconds",
                rest_seconds=90
            ),
            "plank": Exercise(
                name="Plank",
                description="Isometric hold to build core stability",
                difficulty=DifficultyLevel.BEGINNER,
                muscle_groups=[MuscleGroup.CORE, MuscleGroup.SHOULDERS],
                form_cues=[
                    "Forearms on ground, elbows under shoulders",
                    "Body forms straight line",
                    "Engage core and glutes",
                    "Breathe normally"
                ],
                common_mistakes=[
                    "Hips too high or too low",
                    "Holding breath",
                    "Head dropping or lifting"
                ],
                progressions=["side_plank"],
                regressions=[],
                sets=3,
                reps="20-45 seconds",
                rest_seconds=60
            ),
            "bodyweight_squat": Exercise(
                name="Bodyweight Squat",
                description="Fundamental lower body movement",
                difficulty=DifficultyLevel.BEGINNER,
                muscle_groups=[MuscleGroup.LEGS, MuscleGroup.CORE],
                form_cues=[
                    "Feet shoulder-width apart",
                    "Lower hips back and down",
                    "Keep chest up",
                    "Drive through heels to stand"
                ],
                common_mistakes=[
                    "Knees caving inward",
                    "Heels lifting off ground",
                    "Rounding lower back"
                ],
                progressions=["jump_squat"],
                regressions=[],
                sets=3,
                reps="12-15",
                rest_seconds=60
            ),
            "glute_bridge": Exercise(
                name="Glute Bridge",
                description="Hip extension exercise for glutes and core",
                difficulty=DifficultyLevel.BEGINNER,
                muscle_groups=[MuscleGroup.LEGS, MuscleGroup.CORE],
                form_cues=[
                    "Lie on back, knees bent, feet flat",
                    "Lift hips by squeezing glutes",
                    "Form straight line from knees to shoulders",
                    "Lower with control"
                ],
                common_mistakes=[
                    "Arching lower back excessively",
                    "Not squeezing glutes",
                    "Pushing through toes instead of heels"
                ],
                progressions=["single_leg_glute_bridge"],
                regressions=[],
                sets=3,
                reps="12-15",
                rest_seconds=60
            ),
        }
    
    @staticmethod
    def get_all_exercises() -> Dict[str, Exercise]:
        """Get all exercises in the library."""
        exercises = ExerciseLibrary.get_beginner_exercises()
        # Can be extended with intermediate and advanced exercises
        return exercises
    
    @staticmethod
    def get_exercise(exercise_id: str) -> Optional[Exercise]:
        """Get a specific exercise by ID."""
        all_exercises = ExerciseLibrary.get_all_exercises()
        return all_exercises.get(exercise_id)
