/**
 * Generic rep counting state machine.
 * Transition flow: idle → ready → down → bottom → up → ready (count++)
 */

export type RepPhase = 'idle' | 'ready' | 'down' | 'bottom' | 'up'

export interface RepCounterConfig {
  readyAngle: number
  bottomAngle: number
  hysteresis: number
}

export interface RepUpdateResult {
  phaseChanged: boolean
  repCompleted: boolean
  phase: RepPhase
  count: number
}

export class RepCounter {
  phase: RepPhase = 'idle'
  count = 0

  private config: RepCounterConfig

  constructor(config: RepCounterConfig) {
    this.config = config
  }

  update(angle: number): RepUpdateResult {
    const prev = this.phase
    const { readyAngle, bottomAngle, hysteresis } = this.config
    let repCompleted = false

    switch (this.phase) {
      case 'idle':
        if (angle >= readyAngle - hysteresis) {
          this.phase = 'ready'
        }
        break

      case 'ready':
        if (angle < readyAngle - hysteresis) {
          this.phase = 'down'
        }
        break

      case 'down':
        if (angle <= bottomAngle + hysteresis) {
          this.phase = 'bottom'
        } else if (angle >= readyAngle) {
          this.phase = 'ready'
        }
        break

      case 'bottom':
        if (angle > bottomAngle + hysteresis) {
          this.phase = 'up'
        }
        break

      case 'up':
        if (angle >= readyAngle - hysteresis) {
          this.count++
          this.phase = 'ready'
          repCompleted = true
        } else if (angle <= bottomAngle + hysteresis) {
          this.phase = 'bottom'
        }
        break
    }

    return {
      phaseChanged: this.phase !== prev,
      repCompleted,
      phase: this.phase,
      count: this.count,
    }
  }

  reset(): void {
    this.phase = 'idle'
    this.count = 0
  }
}
