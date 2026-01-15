'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import ChatInterface from '@/components/chat/ChatInterface'
import WeeklyProgress from '@/components/WeeklyProgress'
import CurrentLevel from '@/components/CurrentLevel'
import WorkoutLevels from '@/components/WorkoutLevels'

function ProgressPanel() {
  const [activeTab, setActiveTab] = useState('progress')

  const tabs = [
    { id: 'progress', label: '📅 Weekly Progress' },
    { id: 'current', label: '🎯 Current Level' },
    { id: 'levels', label: '🏆 Workout Levels' }
  ]

  return (
    <Card className="mb-6">
      <CardHeader>
        <div className="flex items-center justify-center border-b">
          <div className="flex items-center gap-1 p-1 bg-secondary rounded-lg mb-4">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                  activeTab === tab.id 
                    ? 'bg-primary text-primary-foreground shadow-sm' 
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary/80'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        {activeTab === 'progress' && (
          <WeeklyProgress />
        )}

        {activeTab === 'current' && (
          <CurrentLevel />
        )}

        {activeTab === 'levels' && (
          <WorkoutLevels />
        )}
      </CardContent>
    </Card>
  )
}

export default function DashboardPage() {
  return (
    <div className="container mx-auto px-4 py-6 max-w-4xl">
      <ProgressPanel />

      <Card>
        <CardContent className="p-0">
          <div className="h-[600px]">
            <ChatInterface />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
