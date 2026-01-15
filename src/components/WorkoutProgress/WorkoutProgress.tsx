'use client'

import { Badge } from '@/components/ui/badge'
import { workoutProgressData } from '@/data/WorkoutProgress'
import './WorkoutProgress.css'

export default function WorkoutProgress() {
  const { 
    lastWorkout, 
    todaysWorkout, 
    progressComparisons
  } = workoutProgressData

  return (
    <div className="workout-progress">
      <div className="workout-progress__description">
        Your workout progress: last session results and today's targets
      </div>
      
      <div className="workout-progress__main-grid">
        {/* Last Session Column */}
        <div className="workout-progress__session-card">
          <div className="workout-progress__session-header">
            <Badge variant="outline" className="workout-progress__session-badge">
              📋 Last Session
            </Badge>
            <div className="workout-progress__session-meta">
              {lastWorkout.date.toLocaleDateString('en-US', { 
                weekday: 'short',
                month: 'short', 
                day: 'numeric' 
              })} • {lastWorkout.duration} min
            </div>
          </div>
          
          <div className="workout-progress__exercises">
            {lastWorkout.exercises.map((exercise, exerciseIndex) => (
              <div key={exerciseIndex} className="workout-progress__exercise-card workout-progress__exercise-card--last">
                <div className="workout-progress__exercise-header">
                  <h4 className="workout-progress__exercise-name">{exercise.name}</h4>
                  <Badge variant="outline" className="workout-progress__completion-badge">
                    {exercise.sets.filter(s => s.completed).length}/{exercise.sets.length}
                  </Badge>
                </div>
                
                <div className="workout-progress__exercise-details">
                  {/* Sets, Tempo, and Rest in one line */}
                  <div className="workout-progress__sets-info">
                    <span className="workout-progress__sets-label">{exercise.sets.length} Sets: </span>
                    <span className="workout-progress__sets-value">
                      {exercise.sets.map((set, index) => {
                        const value = 'reps' in set ? set.reps : `${set.duration}s`
                        return set.completed ? `${value}✓` : `${value}✗`
                      }).join(' → ')}
                    </span>
                  </div>
                  
                  <div className="workout-progress__exercise-meta">
                    <span className="workout-progress__meta-label">Tempo: </span>
                    <span className="workout-progress__meta-value">{exercise.tempo}</span>
                    <span className="workout-progress__meta-label workout-progress__meta-label--spaced">Rest: </span>
                    <span className="workout-progress__meta-value">{exercise.rest}s</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Today's Plan Column */}
        <div className="workout-progress__session-card">
          <div className="workout-progress__session-header">
            <Badge variant="outline" className="workout-progress__session-badge">
              🎯 Today's Plan
            </Badge>
            <div className="workout-progress__session-meta">
              Based on your progress
            </div>
          </div>
          
          <div className="workout-progress__exercises">
            {todaysWorkout.exercises.map((exercise, exerciseIndex) => (
              <div key={exerciseIndex} className="workout-progress__exercise-card workout-progress__exercise-card--today">
                <div className="workout-progress__exercise-header workout-progress__exercise-header--today">
                  <h4 className="workout-progress__exercise-name">{exercise.name}</h4>
                </div>
                
                <div className="workout-progress__exercise-details">
                  {/* Sets, Tempo, and Rest in one line */}
                  <div className="workout-progress__sets-info">
                    <span className="workout-progress__sets-label">{exercise.targetSets.length} Sets: </span>
                    <span className="workout-progress__sets-value">
                      {exercise.targetSets.map((set, index) => 
                        'reps' in set ? set.reps : `${set.duration}s`
                      ).join(' → ')}
                    </span>
                  </div>
                  
                  <div className="workout-progress__exercise-meta">
                    <span className="workout-progress__meta-label">Tempo: </span>
                    <span className="workout-progress__meta-value">{exercise.tempo}</span>
                    <span className="workout-progress__meta-label workout-progress__meta-label--spaced">Rest: </span>
                    <span className="workout-progress__meta-value">{exercise.rest}s</span>
                  </div>
                </div>
                
                <div className="workout-progress__progression-note">
                  <div className="workout-progress__progression-title">PROGRESSION NOTE</div>
                  <div className="workout-progress__progression-text">{exercise.notes}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      
      {/* Progress Comparison */}
      <div className="workout-progress__progress-section">
        <div className="workout-progress__progress-header">
          <div className="workout-progress__progress-icon">📈</div>
          <h3 className="workout-progress__progress-title">Progress Comparison</h3>
        </div>
        
        <div className="workout-progress__comparisons">
          {progressComparisons.map((comparison, index) => (
            <div key={index} className="workout-progress__comparison-card">
              <div className="workout-progress__comparison-header">
                <div className="workout-progress__comparison-exercise">{comparison.exerciseName}</div>
                <div className="workout-progress__improvement-badges">
                  {comparison.hasImprovement ? (
                    <Badge variant="default" className="workout-progress__improvement-badge workout-progress__improvement-badge--positive">
                      +{comparison.improvement} ({comparison.improvementPercent > 0 ? `+${comparison.improvementPercent}` : comparison.improvementPercent}%)
                    </Badge>
                  ) : comparison.isDecline ? (
                    <Badge variant="outline" className="workout-progress__improvement-badge workout-progress__improvement-badge--negative">
                      {comparison.improvement} ({comparison.improvementPercent}%)
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="workout-progress__improvement-badge">
                      Maintain
                    </Badge>
                  )}
                </div>
              </div>
              <div className="workout-progress__comparison-details">
                <div className="workout-progress__comparison-column">
                  <div className="workout-progress__comparison-title">Last Session</div>
                  <div className="workout-progress__comparison-data">
                    <div className="workout-progress__comparison-metric">
                      <span className="workout-progress__metric-label">Total: </span>
                      <span className="workout-progress__metric-value">{comparison.lastTotal}</span>
                    </div>
                  </div>
                </div>
                <div className="workout-progress__comparison-column">
                  <div className="workout-progress__comparison-title">Today's Target</div>
                  <div className="workout-progress__comparison-data">
                    <div className="workout-progress__comparison-metric">
                      <span className="workout-progress__metric-label">Target: </span>
                      <span className="workout-progress__metric-value">{comparison.todayTotal}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      
      {/* Workout Tips */}
      <div className="workout-progress__tips">
        <div className="workout-progress__tips-header">
          <div className="workout-progress__tips-icon">💡</div>
          <div className="workout-progress__tips-title">Today's Workout Tips</div>
        </div>
        <div className="workout-progress__tips-content">
          <p className="workout-progress__tip-item">• Focus on completing all planned sets with proper form</p>
          <p className="workout-progress__tip-item">• If you can't hit the target reps, maintain good form and do what you can</p>
          <p className="workout-progress__tip-item">• Rest adequately between sets - don't rush the workout</p>
          <p className="workout-progress__tip-item">• Chat with your AI coach if you need form guidance or modifications</p>
        </div>
      </div>
    </div>
  )
}
