'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Modal } from '@/components/ui/modal'
import ChatInterface from '@/components/chat/ChatInterface'
import WeeklyProgress from '@/components/WeeklyProgress'
import WorkoutLevels from '@/components/WorkoutLevels'

function ProgressPanel() {
  const [isWorkoutLevelsModalOpen, setIsWorkoutLevelsModalOpen] = useState(false)

  return (
    <>
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between border-b pb-4">
            {/* Left side - Weekly Progress title */}
            <div className="flex items-center gap-2">
              <span className="text-lg font-medium">📅 Weekly Progress</span>
            </div>
            
            {/* Right side - Action buttons */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsWorkoutLevelsModalOpen(true)}
                className="px-3 py-2 bg-secondary text-secondary-foreground rounded-md text-sm font-medium hover:bg-secondary/80 transition-colors"
              >
                🏆 Workout Levels
              </button>
            </div>
          </div>
        </CardHeader>
        
        <CardContent>
          <WeeklyProgress />
        </CardContent>
      </Card>

      {/* Workout Levels Modal */}
      <Modal 
        isOpen={isWorkoutLevelsModalOpen} 
        onClose={() => setIsWorkoutLevelsModalOpen(false)}
        title="🏆 Workout Levels"
      >
        <WorkoutLevels />
      </Modal>
    </>
  )
}

export default function DashboardPage() {
  return (
    <div className="container mx-auto px-4 py-6 max-w-4xl">
      <ProgressPanel />

      {/* <Card>
        <CardContent className="p-0">
          <div className="h-[600px]">
            <ChatInterface />
          </div>
        </CardContent>
      </Card> */}
    </div>
  )
}
