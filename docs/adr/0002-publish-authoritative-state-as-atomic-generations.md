# Publish authoritative state as atomic Generations

Profile intent, its Resolution Lock, and managed skill files publish as one immutable Generation behind an atomic current pointer. One writer owns a Scope and competing mutations fail immediately; incomplete staging is recoverable, interruption before commit preserves the previous Generation, and interruption after commit preserves the new one. The first release guarantees atomic visibility and interruption safety, retains the current and previous Generations, and defers fsync-grade power-loss guarantees.
