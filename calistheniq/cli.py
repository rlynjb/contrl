"""
Command-line interface for CalisthenIQ.
"""

import sys
import json
from pathlib import Path
from typing import Optional
from .agent import CoachingAgent, UserProfile, UserFeedback, FormQuality
from .exercises import ExerciseLibrary


class CalisthenIQCLI:
    """Interactive CLI for the calisthenics coach."""
    
    def __init__(self):
        self.config_dir = Path.home() / ".calistheniq"
        self.config_dir.mkdir(exist_ok=True)
        self.profile_path = self.config_dir / "profile.json"
        self.user_profile = self.load_profile()
        self.coach = CoachingAgent(self.user_profile)
    
    def load_profile(self) -> UserProfile:
        """Load user profile from disk or create new."""
        if self.profile_path.exists():
            try:
                with open(self.profile_path, 'r') as f:
                    data = json.load(f)
                return UserProfile(**data)
            except Exception as e:
                print(f"Warning: Could not load profile: {e}")
                return UserProfile()
        return UserProfile()
    
    def save_profile(self):
        """Save user profile to disk."""
        try:
            with open(self.profile_path, 'w') as f:
                json.dump(self.user_profile.model_dump(), f, indent=2)
        except Exception as e:
            print(f"Warning: Could not save profile: {e}")
    
    def print_header(self):
        """Print application header."""
        print("\n" + "="*60)
        print("  CalisthenIQ - Your AI-Powered Calisthenics Coach")
        print("  Building Strength Through Proper Form & Progression")
        print("="*60 + "\n")
    
    def print_menu(self):
        """Print main menu."""
        print("\nWhat would you like to do?")
        print("  1. Start a workout")
        print("  2. Get exercise form guidance")
        print("  3. View progress")
        print("  4. Setup profile")
        print("  5. Exit")
        print()
    
    def setup_profile(self):
        """Interactive profile setup."""
        print("\n--- Profile Setup ---")
        name = input("What's your name? (press Enter to skip): ").strip()
        if name:
            self.user_profile.name = name
        
        print("\nWhat are your fitness goals? (one per line, empty line to finish)")
        goals = []
        while True:
            goal = input("  Goal: ").strip()
            if not goal:
                break
            goals.append(goal)
        
        if goals:
            self.user_profile.goals = goals
        
        self.save_profile()
        print(f"\n✓ Profile saved! Welcome, {self.user_profile.name}!")
    
    def start_workout(self):
        """Start a guided workout session."""
        print("\n" + "="*60)
        print("  WORKOUT SESSION")
        print("="*60)
        
        # Generate workout
        workout = self.coach.generate_workout()
        
        print(f"\n📋 {workout['name']}")
        print(f"Focus: {workout['focus']}\n")
        
        # Warm-up
        print("🔥 WARM-UP")
        for item in workout['warm_up']:
            print(f"  • {item}")
        
        input("\nPress Enter when warm-up is complete...")
        
        # Main exercises
        print("\n💪 MAIN WORKOUT\n")
        
        for i, ex_plan in enumerate(workout['exercises'], 1):
            print(f"\n--- Exercise {i}/{len(workout['exercises'])}: {ex_plan['name']} ---")
            print(f"Description: {ex_plan['description']}")
            print(f"Target: {ex_plan['sets']} sets × {ex_plan['reps']} reps")
            print(f"Rest: {ex_plan['rest_seconds']} seconds between sets\n")
            
            print("Form Cues:")
            for cue in ex_plan['form_cues']:
                print(f"  ✓ {cue}")
            
            input("\nPress Enter to start exercise...")
            
            # Simulate sets
            for set_num in range(1, ex_plan['sets'] + 1):
                print(f"\n  Set {set_num}: Go!")
                input(f"  Press Enter when set {set_num} is complete...")
                
                if set_num < ex_plan['sets']:
                    print(f"  Rest {ex_plan['rest_seconds']} seconds...")
            
            # Get feedback
            print(f"\n--- Feedback for {ex_plan['name']} ---")
            feedback = self.collect_exercise_feedback(ex_plan['id'], ex_plan['reps'])
            
            # Get coaching advice
            advice = self.coach.assess_and_adapt(feedback)
            self.display_coaching_advice(advice)
            
            input("\nPress Enter to continue to next exercise...")
        
        # Cool-down
        print("\n🧘 COOL-DOWN")
        for item in workout['cool_down']:
            print(f"  • {item}")
        
        input("\nPress Enter when cool-down is complete...")
        
        # Workout complete
        self.user_profile.completed_workouts += 1
        self.save_profile()
        
        print("\n" + "="*60)
        print("  🎉 WORKOUT COMPLETE! Great job!")
        print("="*60)
        print(f"\nTotal workouts completed: {self.user_profile.completed_workouts}")
        
        print("\nCoaching Notes:")
        for note in workout['coaching_notes']:
            print(f"  • {note}")
    
    def collect_exercise_feedback(self, exercise_id: str, target_reps: str) -> UserFeedback:
        """Collect user feedback after an exercise."""
        print("\nHow did it go?")
        
        # Get completed reps
        while True:
            try:
                reps_input = input(f"How many reps did you complete? (target: {target_reps}): ").strip()
                completed_reps = int(reps_input)
                break
            except ValueError:
                print("Please enter a number.")
        
        # Get difficulty rating
        while True:
            try:
                diff_input = input("Difficulty (1=too easy, 2=easy, 3=just right, 4=hard, 5=too hard): ").strip()
                difficulty = int(diff_input)
                if 1 <= difficulty <= 5:
                    break
                print("Please enter a number between 1 and 5.")
            except ValueError:
                print("Please enter a number.")
        
        # Get form quality
        print("\nHow was your form?")
        print("  1. Poor - struggled to maintain form")
        print("  2. Needs work - some form breakdown")
        print("  3. Good - maintained form with focus")
        print("  4. Excellent - perfect form throughout")
        
        while True:
            try:
                form_input = input("Form quality (1-4): ").strip()
                form_num = int(form_input)
                if form_num == 1:
                    form_quality = FormQuality.POOR
                    break
                elif form_num == 2:
                    form_quality = FormQuality.NEEDS_WORK
                    break
                elif form_num == 3:
                    form_quality = FormQuality.GOOD
                    break
                elif form_num == 4:
                    form_quality = FormQuality.EXCELLENT
                    break
                else:
                    print("Please enter a number between 1 and 4.")
            except ValueError:
                print("Please enter a number.")
        
        # Parse target reps (handle ranges like "10-15")
        try:
            if '-' in target_reps:
                target_num = int(target_reps.split('-')[1])
            else:
                target_num = int(''.join(filter(str.isdigit, target_reps)))
        except (ValueError, IndexError, AttributeError):
            target_num = completed_reps
        
        notes = input("Any notes? (press Enter to skip): ").strip()
        
        return UserFeedback(
            exercise_id=exercise_id,
            difficulty_rating=difficulty,
            form_quality=form_quality,
            completed_reps=completed_reps,
            target_reps=target_num,
            notes=notes if notes else None
        )
    
    def display_coaching_advice(self, advice: dict):
        """Display coaching advice from the agent."""
        print("\n" + "-"*60)
        print("  🤖 COACH'S FEEDBACK")
        print("-"*60)
        
        print(f"\n{advice.get('assessment', '')}")
        
        if advice.get('form_feedback'):
            print("\n📝 Form Focus Points:")
            for cue in advice['form_feedback']:
                print(f"  • {cue}")
        
        if advice.get('progression_advice'):
            print(f"\n📈 {advice['progression_advice']}")
        
        print(f"\n💬 {advice.get('encouragement', '')}")
    
    def get_form_guidance(self):
        """Show form guidance for a specific exercise."""
        exercises = ExerciseLibrary.get_all_exercises()
        
        print("\n--- Exercise Library ---")
        ex_list = list(exercises.items())
        for i, (ex_id, ex) in enumerate(ex_list, 1):
            print(f"  {i}. {ex.name} ({ex.difficulty.value})")
        
        print()
        try:
            choice = int(input("Select exercise number: ").strip())
            if 1 <= choice <= len(ex_list):
                ex_id, _ = ex_list[choice - 1]
                guidance = self.coach.provide_form_guidance(ex_id)
                
                print("\n" + "="*60)
                print(f"  {guidance['exercise']}")
                print("="*60)
                print(f"\n{guidance['description']}\n")
                
                print("KEY FORM POINTS:")
                for i, point in enumerate(guidance['key_points'], 1):
                    print(f"  {i}. {point}")
                
                print("\nCOMMON MISTAKES TO AVOID:")
                for mistake in guidance['common_mistakes']:
                    print(f"  ✗ {mistake}")
                
                print(f"\n💡 TIP: {guidance['focus_tip']}")
            else:
                print("Invalid selection.")
        except (ValueError, IndexError):
            print("Invalid input.")
    
    def view_progress(self):
        """Display user progress and statistics."""
        print("\n" + "="*60)
        print(f"  PROGRESS - {self.user_profile.name}")
        print("="*60)
        
        print(f"\nWorkouts completed: {self.user_profile.completed_workouts}")
        print(f"Experience level: {self.user_profile.experience_level.value}")
        
        if self.user_profile.goals:
            print("\nYour Goals:")
            for goal in self.user_profile.goals:
                print(f"  • {goal}")
        
        if self.user_profile.current_exercises:
            print(f"\nCurrent exercises in your routine:")
            exercises = ExerciseLibrary.get_all_exercises()
            for ex_id in self.user_profile.current_exercises:
                ex = exercises.get(ex_id)
                if ex:
                    print(f"  • {ex.name}")
        
        if self.user_profile.exercise_history:
            print(f"\nExercise History:")
            for ex_id, feedback_list in self.user_profile.exercise_history.items():
                ex = ExerciseLibrary.get_exercise(ex_id)
                if ex:
                    print(f"\n  {ex.name}: {len(feedback_list)} sessions")
                    if feedback_list:
                        latest = feedback_list[-1]
                        print(f"    Latest: {latest.completed_reps} reps, form: {latest.form_quality.value}")
    
    def run(self):
        """Main application loop."""
        self.print_header()
        
        print(f"Welcome back, {self.user_profile.name}!")
        if self.user_profile.completed_workouts == 0:
            print("This is your first session. Let's build a strong foundation!\n")
            print("Remember: CalisthenIQ focuses on proper form and sustainable progress.")
            print("We'll adapt exercises based on your feedback, not push you to failure.")
        
        while True:
            self.print_menu()
            
            choice = input("Select option (1-5): ").strip()
            
            if choice == '1':
                self.start_workout()
            elif choice == '2':
                self.get_form_guidance()
            elif choice == '3':
                self.view_progress()
            elif choice == '4':
                self.setup_profile()
            elif choice == '5':
                print("\n👋 Great work today! See you next session!")
                self.save_profile()
                break
            else:
                print("Invalid choice. Please select 1-5.")
            
            input("\nPress Enter to continue...")


def main():
    """Entry point for the CLI."""
    try:
        cli = CalisthenIQCLI()
        cli.run()
    except KeyboardInterrupt:
        print("\n\n👋 Session interrupted. Progress saved!")
        sys.exit(0)
    except Exception as e:
        print(f"\n❌ An error occurred: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
