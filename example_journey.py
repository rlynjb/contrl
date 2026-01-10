"""
Example demonstrating complete workflow with CalisthenIQ
"""

from calistheniq.agent import CoachingAgent, UserProfile, UserFeedback, FormQuality
from calistheniq.exercises import ExerciseLibrary


def example_beginner_journey():
    """Demonstrates a beginner's journey through CalisthenIQ."""
    
    print("="*80)
    print("  CALISTHENIQ - BEGINNER'S JOURNEY EXAMPLE")
    print("="*80)
    print()
    
    # Day 1: New user starts
    print("📅 DAY 1: First Workout")
    print("-"*80)
    
    user = UserProfile(
        name="Alex",
        goals=["Do my first pull-up", "Build upper body strength"]
    )
    coach = CoachingAgent(user)
    
    print(f"Welcome {user.name}!")
    print("Goals:")
    for goal in user.goals:
        print(f"  • {goal}")
    print()
    
    # Generate first workout
    workout = coach.generate_workout()
    print(f"Generated workout: {workout['name']}")
    print(f"Exercises: {', '.join([ex['name'] for ex in workout['exercises']])}")
    print()
    
    # Simulate Day 1 performance
    print("Performance:")
    feedback1 = UserFeedback(
        exercise_id="wall_pushup",
        difficulty_rating=3,
        form_quality=FormQuality.NEEDS_WORK,
        completed_reps=10,
        target_reps=12,
        notes="Arms felt shaky"
    )
    
    advice1 = coach.assess_and_adapt(feedback1)
    print(f"  Wall Push-ups: {feedback1.completed_reps}/12 reps")
    print(f"  Coach says: {advice1['encouragement']}")
    print()
    
    # Day 2: Second session
    print("📅 DAY 2: Building Consistency")
    print("-"*80)
    
    feedback2 = UserFeedback(
        exercise_id="wall_pushup",
        difficulty_rating=3,
        form_quality=FormQuality.GOOD,
        completed_reps=12,
        target_reps=12,
        notes="Felt more controlled"
    )
    
    advice2 = coach.assess_and_adapt(feedback2)
    print(f"  Wall Push-ups: {feedback2.completed_reps}/12 reps")
    print(f"  Form improved to: {feedback2.form_quality.value}")
    print(f"  Coach says: {advice2['encouragement']}")
    print()
    
    # Day 7: Progress
    print("📅 DAY 7: Week 1 Complete")
    print("-"*80)
    user.completed_workouts = 7
    
    feedback3 = UserFeedback(
        exercise_id="wall_pushup",
        difficulty_rating=2,
        form_quality=FormQuality.EXCELLENT,
        completed_reps=15,
        target_reps=12,
        notes="Felt easy!"
    )
    
    advice3 = coach.assess_and_adapt(feedback3)
    print(f"  Wall Push-ups: {feedback3.completed_reps}/12 reps (exceeded target!)")
    print(f"  Form quality: {feedback3.form_quality.value}")
    print(f"  Coach says: {advice3['assessment']}")
    print(f"  📈 Next step: {advice3['progression_advice']}")
    print()
    
    # Day 8: Progression
    print("📅 DAY 8: First Progression")
    print("-"*80)
    print("Coach recommends trying Incline Push-ups...")
    
    # Get form guidance for new exercise
    guidance = coach.provide_form_guidance("incline_pushup")
    print(f"\n  {guidance['exercise']}")
    print(f"  {guidance['description']}")
    print(f"  Key focus: {guidance['key_points'][0]}")
    print()
    
    feedback4 = UserFeedback(
        exercise_id="incline_pushup",
        difficulty_rating=4,
        form_quality=FormQuality.GOOD,
        completed_reps=8,
        target_reps=10,
        notes="Harder than wall pushups but manageable"
    )
    
    advice4 = coach.assess_and_adapt(feedback4)
    print(f"  Incline Push-ups: {feedback4.completed_reps}/10 reps")
    print(f"  Coach says: {advice4['assessment']}")
    print()
    
    # Progress summary
    print("="*80)
    print("  PROGRESS SUMMARY")
    print("="*80)
    print(f"Total workouts: {user.completed_workouts}")
    print(f"Exercises tracked: {len(user.exercise_history)}")
    print()
    print("Exercise History:")
    
    for ex_id, feedbacks in user.exercise_history.items():
        exercise = ExerciseLibrary.get_exercise(ex_id)
        print(f"\n  {exercise.name}:")
        print(f"    Sessions: {len(feedbacks)}")
        print(f"    First session: {feedbacks[0].completed_reps} reps, form: {feedbacks[0].form_quality.value}")
        print(f"    Latest: {feedbacks[-1].completed_reps} reps, form: {feedbacks[-1].form_quality.value}")
        
        if len(feedbacks) > 1:
            improvement = feedbacks[-1].completed_reps - feedbacks[0].completed_reps
            if improvement > 0:
                print(f"    📈 Improvement: +{improvement} reps")
    
    print()
    print("="*80)
    print("  Key Takeaways:")
    print("  • Consistency leads to progress")
    print("  • Form quality improved through focus")
    print("  • Natural progression when ready")
    print("  • Coach adapts to individual pace")
    print("="*80)


if __name__ == "__main__":
    example_beginner_journey()
