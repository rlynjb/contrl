'use client'

import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useChat } from '@/hooks/useChat'

interface MessageBubbleProps {
  content: string
  role: 'user' | 'assistant'
  agent?: string
  sessionState?: string
  timestamp: Date
}

function MessageBubble({ content, role, agent, sessionState, timestamp }: MessageBubbleProps) {
  const isUser = role === 'user'
  
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <div className={`max-w-[80%] rounded-lg px-4 py-2 ${
        isUser 
          ? 'bg-primary text-primary-foreground ml-12' 
          : 'bg-muted mr-12'
      }`}>
        {!isUser && agent && (
          <div className="text-xs text-muted-foreground mb-1 capitalize">
            {agent} Agent • {sessionState}
          </div>
        )}
        <div className="whitespace-pre-wrap">{content}</div>
        <div className={`text-xs mt-1 ${
          isUser ? 'text-primary-foreground/70' : 'text-muted-foreground'
        }`}>
          {timestamp.toLocaleTimeString()}
        </div>
      </div>
    </div>
  )
}

export default function ChatInterface() {
  const [inputValue, setInputValue] = useState('')
  const [userId] = useState(() => `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  
  const {
    messages,
    isLoading,
    sessionId,
    sessionState,
    currentAgent,
    error,
    sendMessage,
    clearChat,
    retryLastMessage
  } = useChat()

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inputValue.trim() || isLoading) return

    const message = inputValue.trim()
    setInputValue('')
    await sendMessage(message, userId)
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e as any)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Chat Header */}
      <div className="border-b p-4">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-lg font-semibold">CalisthenIQ Coach</h2>
            <p className="text-sm text-muted-foreground">
              {sessionId ? (
                <>
                  Session: {sessionId.slice(-8)} • Agent: {currentAgent} • State: {sessionState}
                </>
              ) : (
                'Your AI-powered calisthenics coach'
              )}
            </p>
          </div>
          <div className="flex gap-2">
            {error && (
              <Button
                variant="outline"
                size="sm"
                onClick={retryLastMessage}
                disabled={isLoading}
              >
                Retry
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={clearChat}
              disabled={isLoading}
            >
              New Session
            </Button>
          </div>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">
            <div className="mb-4">
              <div className="text-4xl mb-2">🤸‍♂️</div>
              <h3 className="text-lg font-semibold mb-2">Welcome to CalisthenIQ!</h3>
              <p className="max-w-md mx-auto">
                Welcome! Here is your current workout for today. You are at Level 1 with Push/Pull and Level 0 with Squat muscle groups. 
                How are your muscles feeling? Any discomfort or pain? Let me know so I can decrease the level or suggest lighter exercises for you today.
              </p>
            </div>
            <div className="bg-muted rounded-lg p-4 max-w-md mx-auto">
              <p className="text-sm font-medium mb-2">Try saying:</p>
              <ul className="text-sm space-y-1">
                <li>"My knees are feeling stiff today"</li>
                <li>"I feel ready for today's workout"</li>
                <li>"Can you modify today's squat exercises?"</li>
              </ul>
            </div>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto">
            {messages.map((message) => (
              <MessageBubble
                key={message.id}
                content={message.content}
                role={message.role}
                agent={message.agent}
                sessionState={message.sessionState}
                timestamp={message.timestamp}
              />
            ))}
            {isLoading && (
              <div className="flex justify-start mb-4">
                <div className="bg-muted rounded-lg px-4 py-2 mr-12">
                  <div className="flex items-center space-x-2">
                    <div className="flex space-x-1">
                      <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce"></div>
                      <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                      <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                    </div>
                    <span className="text-sm text-muted-foreground">Coach is thinking...</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="border-t p-4">
        <form onSubmit={handleSubmit} className="max-w-4xl mx-auto">
          <div className="flex gap-2">
            <Input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Tell me about your fitness goals and available time..."
              disabled={isLoading}
              className="flex-1"
            />
            <Button 
              type="submit" 
              disabled={!inputValue.trim() || isLoading}
            >
              {isLoading ? 'Sending...' : 'Send'}
            </Button>
          </div>
          {error && (
            <p className="text-sm text-destructive mt-2">
              Error: {error}
            </p>
          )}
          <p className="text-xs text-muted-foreground mt-2">
            Example: "I'm a beginner looking to build upper body strength. I have 20 minutes and just bodyweight equipment."
          </p>
        </form>
      </div>
    </div>
  )
}
