# Understanding & Navigation Template

When asked to explain or help navigate part of 
the codebase:

1. **Orient first** — which package, which layer, 
   how it fits in the call flow
2. **Explain purpose before implementation** — what 
   this code does and why before how it does it
3. **Trace the flow** — follow the execution path 
   from entry point to output
4. **Highlight non-obvious things** — gotchas, 
   implicit dependencies, things that look one way 
   but behave another
5. **Relate to adjacent components** — what calls 
   this, what does this call, what would break if 
   this changed

## Format
Prose explanation first, then code references.
Never just point at files — explain what to look 
for and why it matters.