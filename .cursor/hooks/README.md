# its-magic hooks

This folder contains a minimal hook dispatcher for Cursor.

Events handled:

- beforeShellExecution: blocks clearly dangerous commands
- beforeReadFile: warns on secret-like files
- afterFileEdit: tracks code edits vs context refresh
- stop: optional reminder to refresh context

Behavior is controlled via `.cursor/scratchpad.md` with optional local overrides
from `.cursor/scratchpad.local.md`.

