# 1. Preface — What this project is really about

contrl is not a fitness app. It's a state-machine engine wrapped in a UI, with a real-time computer-vision pipeline bolted to one side and a bidirectional sync engine bolted to the other. The fitness domain is the excuse; the engineering surface is everything that makes a "simple" tracking app actually hard:

- **Derived state vs. stored state.** Levels, gates, week progress, and streaks are computed, never stored on the wire. The local DB persists a cache of them, but the source of truth is `sessions[]` replayed through a deterministic state machine. That decision shapes the entire sync and reinstall story.
- **A real-time pipeline that can't have a server.** Pose detection runs at frame rate, on-device, in a worklet. There is no escape hatch to a backend. Every choice — smoothing, hysteresis, FSM phase ordering — has to be defensible at 30+ fps inside a JSI bridge.
- **A sync layer that has to lose data correctly.** Last-edit-wins with a 2-minute remote bias is not an accident; it's the intentional answer to the question "whose write do we trust when the user logged a session on two devices three seconds apart?"

What an interviewer should take away before asking a single question: this is a project whose hard parts aren't where the line count is. The hardest 200 lines (`rep-counter.ts`, `reconstruct.ts`, `sync.ts`) decide whether the other 6,000 are correct.
