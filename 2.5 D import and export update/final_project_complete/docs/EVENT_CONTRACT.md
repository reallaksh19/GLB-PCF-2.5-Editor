# Event Contract

Editors and adapters communicate state changes through a small set of
events dispatched via the global event bus.  These event names are
frozen for Wave 1 and must not be changed without orchestrator
approval.  All events live in the `CegEvents` enumeration exported
by `docs/CEG_CONTRACT.md` and may be consumed by other modules.

## Event list

| Event | When fired | Payload |
| --- | --- | --- |
| `ceg:model-loaded` | After a format adapter has parsed a file and
  produced a CEG. | `{ model: CEG }` |
| `ceg:model-changed` | After a command dispatcher has applied a
  command and produced a new CEG. | `{ model: CEG, command }` |
| `ceg:selection-changed` | When the selection model changes (to be
  implemented in Wave 3). | `{ selection }` |
| `ceg:command-applied` | After a command has been appended to the
  journal. | `{ command }` |
| `ceg:validation-updated` | After model validation has run and
  diagnostics are updated. | `{ diagnostics }` |
| `ceg:export-completed` | After an export adapter has finished
  serializing the current CEG. | `{ format, data }` |

## Event rules

- Emitters must only fire events defined here.  UI code must not
  invent new event names for CEG mutations.
- Listeners must be prepared to handle additional fields in payload
  objects as Wave 2 and Wave 3 extend the protocol.