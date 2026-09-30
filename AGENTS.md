<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Project rules

- The prototype copy is written in Dominique's voice on purpose. Port it word for word. Any new copy must match that voice and must never use em dashes, only commas and periods.
- Design must match the prototype exactly. The CSS in `src/app/globals.css` is ported verbatim; add to it, do not restyle.
- Progress keys (`S.chk`, `S.txt` key names) must stay the same so saved progress carries over.
- Run `npm run lint` and `npx tsc --noEmit` before calling anything done.
