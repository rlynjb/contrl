'use client'

import { Badge } from '@/components/ui/badge'
import type { 
  WorkoutLevel, 
  BaseExercise as Exercise 
} from '@/types'
import { getLevelByIndex } from '@/data/WorkoutLevels'
import { currentLevelData, type MovementCategory } from '@/data/CurrentLevel'
import './CurrentLevel.css'

export default function CurrentLevel() {
  const { 
    currentLevels, 
    progressStats, 
    personalizedRecommendations 
  } = currentLevelData

  return (
    <div className="current-level">
      <div className="current-level__description">
        Your current level progress across movement categories
      </div>
      
      <div className="current-level__grid">
        {Object.entries(currentLevels).map(([category, level]) => {
          const levelInfo = getLevelByIndex(level)
          const nextLevel = getLevelByIndex(level + 1)
          
          return (
            <div key={category} className="current-level__category-card">
              <div className="current-level__category-header">
                <h3 className="current-level__category-title">{category}</h3>
                <Badge variant="outline" className="current-level__level-badge">
                  Level {level}
                </Badge>
              </div>
              
              <div className="current-level__category-content">
                <div className="current-level__current-info">
                  <span className="current-level__current-label">Current: </span>
                  <span className="current-level__current-value">{levelInfo.name}</span>
                </div>
                
                {levelInfo?.description && (
                  <p className="current-level__description-text">{levelInfo.description}</p>
                )}
                
                <div className="current-level__exercises">
                  <h4 className="current-level__exercises-title">Current Exercises:</h4>
                  {levelInfo?.exercises[category as MovementCategory]?.map((exercise: Exercise, index: number) => (
                    <div key={index} className="current-level__exercise-item">
                      <div className="current-level__exercise-name">{exercise.name}</div>
                      <div className="current-level__exercise-sets">
                        {exercise.sets.length} Sets: {exercise.sets.map((set) => 
                          'reps' in set ? set.reps : `${set.duration}s`
                        ).join(' → ')}
                      </div>
                    </div>
                  ))}
                </div>
                
                {nextLevel && (
                  <div className="current-level__next-level">
                    <div className="current-level__next-info">
                      <span className="current-level__next-label">Next: </span>
                      <span className="current-level__next-value">Level {level + 1} - {nextLevel.name}</span>
                    </div>
                  </div>
                )}
                
                {!nextLevel && (
                  <div className="current-level__max-level">
                    <Badge variant="default" className="current-level__max-level-badge">
                      🏆 Max Level Achieved
                    </Badge>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
      
      {/* Progress Summary */}
      <div className="current-level__progress-summary">
        <div className="current-level__progress-header">
          <div className="current-level__progress-icon">📊</div>
          <h3 className="current-level__progress-title">Progress Summary</h3>
        </div>
        
        <div className="current-level__progress-grid">
          <div className="current-level__progress-stats">
            <div className="current-level__stat-item">
              <span className="current-level__stat-label">Overall Level: </span>
              <span className="current-level__stat-value">{progressStats.overallLevel}</span>
            </div>
            
            <div className="current-level__stat-item">
              <span className="current-level__stat-label">Strongest Area: </span>
              <span className="current-level__stat-value current-level__stat-value--strong">{progressStats.strongestArea}</span>
            </div>
            
            <div className="current-level__stat-item">
              <span className="current-level__stat-label">Focus Area: </span>
              <span className="current-level__stat-value current-level__stat-value--focus">{progressStats.focusArea}</span>
            </div>
          </div>
          
          <div className="current-level__progress-chart">
            <div className="current-level__progress-info">
              <span className="current-level__progress-label">Total Progression: </span>
              <span className="current-level__progress-value">{progressStats.progressToMastery}%</span>
            </div>
            
            <div className="current-level__progress-bar">
              <div 
                className="current-level__progress-fill"
                style={{ width: `${progressStats.progressToMastery}%` }}
              ></div>
            </div>
            
            <div className="current-level__progress-caption">
              Progress to mastery (Level 5 in all categories)
            </div>
          </div>
        </div>
      </div>
      
      {/* Recommendations */}
      <div className="current-level__recommendations">
        <div className="current-level__recommendations-header">
          <div className="current-level__recommendations-icon">💡</div>
          <div className="current-level__recommendations-title">Personalized Recommendations</div>
        </div>
        <div className="current-level__recommendations-content">
          {personalizedRecommendations.map((recommendation, index) => (
            <p key={index} className="current-level__recommendation-item">• {recommendation}</p>
          ))}
        </div>
      </div>
    </div>
  )
}
