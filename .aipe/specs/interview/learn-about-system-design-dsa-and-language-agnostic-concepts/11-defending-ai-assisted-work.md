# 11. Defending AI-assisted work

The questions you will be asked. The talking points to use.

**"How much of this did you write vs. the AI?"**

> The architecture is mine. Every spec under `.aipe/specs/` and every audit entry was written or reviewed by me before code touched the repo. Implementation was a mix: I wrote the rep-counter FSM and the reconstruction logic by hand because they're the parts where correctness depends on getting the small details right. Most of the React Native UI was AI-assisted — I reviewed the diffs, ran them on device, and pushed back when the AI proposed something that didn't fit. I can walk any file in this repo and explain why every decision was made; that's the bar I held.

**"What did the AI get wrong that you had to fix?"**

> Several things. Most memorably: an early version of the sync flow had push before pull, which the AI defended on the grounds that "we want to surface the user's edits first." I rejected that — pull-before-push is the only ordering that doesn't race the user's intent across devices (chapter 7). Another: the AI repeatedly proposed adding error-handling code in shapes that swallowed errors (`catch { return null }`). I caught those in review — silent failure is the worst-case error mode in a sync system. A third: the AI generated a `gates.json` rules file in the early prototype that I later realised was the wrong abstraction once exercises moved to Notion; deleting it (see `AUDIT.md`) was a deliberate de-AIification.

**"How do I know you understand the parts the AI wrote?"**

> Ask me anything in this document. Every chapter cites specific files and explains specific decisions. The defense isn't "trust me" — it's that I can answer follow-ups at the same depth as the prose.

**"Why use AI assistance at all?"**

> Because the parts of this app that aren't novel — boilerplate components, list views, theme tokens, screen scaffolding — are exactly where AI is fastest and where my time is least valuable. The parts that are novel — the FSM, the sync protocol, the reconstruction — I wrote myself or wrote with AI on a tight leash. Using AI for the boilerplate freed time for the parts that needed real thinking. That's the leverage I bought; pretending I built every line by hand would be a lie, and pretending the AI built the whole thing would be undervaluing the architecture work that *I* did.

**"Could you have built this without AI?"**

> Yes, slower. AI cut roughly 40% off the time-to-ship without changing what got shipped. The architecture, the trade-offs, the failure modes — those are mine. The AI wrote a lot of the ifs and elses; I wrote the design that decided which ifs and elses needed to exist.

**"What does this experience tell you about AI-assisted development?"**

> Two things. One: AI is leverage for engineers who already know what good looks like, and a hazard for engineers who don't. The same tool that lets me ship 40% faster will let an inexperienced engineer ship a structurally broken app 100% faster, because the AI happily generates working-but-wrong code with no instinct for tradeoffs. Two: spec-driven workflows are the missing layer. Without `.aipe/specs/`, every Claude session reinvents the design; with them, the AI gets a coherent context and behaves like a careful colleague. The process is what makes AI assistance reproducible.
