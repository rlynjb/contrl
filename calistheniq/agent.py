"""
Agent-based coaching system for adaptive calisthenics training.
"""

from typing import List, Dict, Optional
from enum import Enum
from pydantic import BaseModel, Field
from .exercises import Exercise, ExerciseLibrary, DifficultyLevel


class FormQuality(str, Enum):
    """Assessment of exercise form quality."""
    EXCELLENT = "excellent"
    GOOD = "good"
    NEEDS_WORK = "needs_work"
    POOR = "poor"


class UserFeedback(BaseModel):
    """User feedback after an exercise or workout."""
    exercise_id: str
    difficulty_rating: int = Field(..., ge=1, le=5, description="1=too easy, 5=too hard")
    form_quality: FormQuality
    completed_reps: int
    target_reps: int
    notes: Optional[str] = None


class UserProfile(BaseModel):
    """User profile tracking progress and preferences."""
    name: str = "User"
    experience_level: DifficultyLevel = DifficultyLevel.BEGINNER
    completed_workouts: int = 0
    exercise_history: Dict[str, List[UserFeedback]] = Field(default_factory=dict)
    current_exercises: List[str] = Field(default_factory=list)
    goals: List[str] = Field(default_factory=list)
    
    def add_feedback(self, feedback: UserFeedback):
        """Record feedback for an exercise."""
        if feedback.exercise_id not in self.exercise_history:
            self.exercise_history[feedback.exercise_id] = []
        self.exercise_history[feedback.exercise_id].append(feedback)
    
    def get_exercise_performance(self, exercise_id: str) -> Optional[List[UserFeedback]]:
        """Get historical performance for an exercise."""
        return self.exercise_history.get(exercise_id)


class CoachingAgent:
    """AI Coach that adapts training based on user feedback and progress."""
    
    def __init__(self, user_profile: UserProfile):
        self.user = user_profile
        self.exercise_library = ExerciseLibrary()
    
    def assess_and_adapt(self, feedback: UserFeedback) -> Dict[str, any]:
        """
        Analyze feedback and provide coaching advice and adaptations.
        This is the core agent intelligence.
        """
        self.user.add_feedback(feedback)
        
        current_exercise = self.exercise_library.get_exercise(feedback.exercise_id)
        if not current_exercise:
            return {"error": "Exercise not found"}
        
        advice = {
            "exercise": feedback.exercise_id,
            "assessment": "",
            "form_feedback": [],
            "progression_advice": "",
            "next_action": "",
            "encouragement": ""
        }
        
        # Assess form quality
        if feedback.form_quality == FormQuality.POOR:
            advice["assessment"] = "Form needs significant improvement before progressing."
            advice["form_feedback"] = current_exercise.form_cues[:3]  # Focus on top 3 cues
            advice["next_action"] = "focus_on_form"
            advice["encouragement"] = "Remember: quality over quantity! Let's master the basics."
        
        elif feedback.form_quality == FormQuality.NEEDS_WORK:
            advice["assessment"] = "You're making progress, but let's refine your form."
            advice["form_feedback"] = current_exercise.form_cues
            advice["next_action"] = "maintain_current"
            advice["encouragement"] = "Good effort! Focus on these form cues in your next session."
        
        # Assess difficulty and completion
        completion_rate = feedback.completed_reps / feedback.target_reps if feedback.target_reps > 0 else 0
        
        if feedback.form_quality in [FormQuality.GOOD, FormQuality.EXCELLENT]:
            if feedback.difficulty_rating <= 2 and completion_rate >= 1.0:
                # Too easy - suggest progression (harder)
                if current_exercise.progressions:
                    advice["assessment"] = "You're crushing this! Ready for a challenge?"
                    advice["progression_advice"] = f"Consider progressing to: {current_exercise.progressions[0]}"
                    advice["next_action"] = "suggest_progression"
                    advice["encouragement"] = "Your consistency is paying off. Let's level up!"
                else:
                    advice["assessment"] = "Excellent work! Increase volume to continue building strength."
                    advice["progression_advice"] = "Add 2-3 more reps or an additional set"
                    advice["next_action"] = "increase_volume"
                    advice["encouragement"] = "You've mastered this movement!"
            
            elif feedback.difficulty_rating >= 4 or completion_rate < 0.6:
                # Too hard - suggest regression (easier)
                if current_exercise.regressions:
                    advice["assessment"] = "This variation might be too challenging right now."
                    advice["progression_advice"] = f"Let's build strength with: {current_exercise.regressions[0]}"
                    advice["next_action"] = "suggest_regression"
                    advice["encouragement"] = "No rush! Building a strong foundation takes time."
                else:
                    advice["assessment"] = "This is challenging, but you're on the right track."
                    advice["progression_advice"] = "Reduce reps or add more rest between sets"
                    advice["next_action"] = "reduce_volume"
                    advice["encouragement"] = "Every rep counts. Keep showing up!"
            
            else:
                # Just right
                advice["assessment"] = "Perfect! This is the right level for building strength."
                advice["next_action"] = "maintain_current"
                advice["encouragement"] = "Excellent work! Consistency at this level will build solid strength."
        
        return advice
    
    def generate_workout(self, focus_areas: Optional[List[str]] = None) -> Dict[str, any]:
        """
        Generate an adaptive workout based on user profile and focus areas.
        """
        exercises = self.exercise_library.get_beginner_exercises()
        
        # Select exercises based on user's current level
        selected_exercises = []
        
        # Balance workout across muscle groups
        muscle_groups_covered = set()
        
        for ex_id, exercise in exercises.items():
            # Check if already in user's current exercises or if it matches focus
            if ex_id in self.user.current_exercises:
                selected_exercises.append((ex_id, exercise))
                muscle_groups_covered.update(exercise.muscle_groups)
        
        # If user has no current exercises, create a balanced beginner routine
        if not selected_exercises:
            # Add core exercises for beginners
            priority_exercises = ["wall_pushup", "bodyweight_squat", "plank", "glute_bridge"]
            for ex_id in priority_exercises:
                if ex_id in exercises:
                    selected_exercises.append((ex_id, exercises[ex_id]))
                    self.user.current_exercises.append(ex_id)
        
        workout = {
            "name": f"Session {self.user.completed_workouts + 1}",
            "focus": "Building foundational strength with proper form",
            "warm_up": [
                "5 minutes light cardio (walking, jogging in place)",
                "Arm circles - 10 each direction",
                "Leg swings - 10 each leg",
                "Hip circles - 10 each direction"
            ],
            "exercises": [],
            "cool_down": [
                "Light stretching - 5-10 minutes",
                "Focus on muscles worked",
                "Deep breathing"
            ],
            "coaching_notes": []
        }
        
        for ex_id, exercise in selected_exercises:
            exercise_plan = {
                "id": ex_id,
                "name": exercise.name,
                "sets": exercise.sets,
                "reps": exercise.reps,
                "rest_seconds": exercise.rest_seconds,
                "form_cues": exercise.form_cues[:3],  # Top 3 most important
                "description": exercise.description
            }
            workout["exercises"].append(exercise_plan)
        
        # Add coaching notes
        workout["coaching_notes"] = [
            "Focus on quality over quantity - perfect form is the priority",
            "If something hurts (not muscle fatigue), stop and reassess",
            "Take extra rest if needed - recovery is part of training",
            "Rate your form honestly after each exercise"
        ]
        
        return workout
    
    def provide_form_guidance(self, exercise_id: str) -> Dict[str, any]:
        """Provide detailed form guidance for an exercise."""
        exercise = self.exercise_library.get_exercise(exercise_id)
        if not exercise:
            return {"error": "Exercise not found"}
        
        return {
            "exercise": exercise.name,
            "description": exercise.description,
            "key_points": exercise.form_cues,
            "common_mistakes": exercise.common_mistakes,
            "focus_tip": "Start slow and controlled. Feel the muscles working."
        }
