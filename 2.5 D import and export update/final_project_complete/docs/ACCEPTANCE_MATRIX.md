# Acceptance Matrix — Wave 1

Wave 1 introduces the Canonical Edit Graph (CEG) and the command
kernel.  The following gates must pass before Wave 2 work can begin.

## Contract gates

| Check | Required result |
| --- | --- |
| Contract files exist | `docs/CEG_CONTRACT.md`, `docs/COMMAND_CONTRACT.md`, `docs/EVENT_CONTRACT.md`, `docs/VALIDATION_CONTRACT.md`, `docs/MERGE_GOVERNANCE.md` present |
| Schema version exported | `CEG_SCHEMA_VERSION` equals `"CEG-1.0"` |
| Event names frozen | All events defined once with no duplicates |
| Command types frozen | All command types defined once with no duplicates |

## CEG kernel gates

| Test | Required result |
| --- | --- |
| Empty graph creation | Graph has all required top‑level keys |
| Deterministic hash | Hash of same graph equals across 10 runs |
| Add 10 components | `Object.keys(graph.components).length === 10` |
| Add 20 anchors | `Object.keys(graph.anchors).length === 20` |
| Component anchor resolution | Every component’s `anchorIds` resolve to an existing anchor |
| Missing anchor validation | Validation returns an error instead of crashing |
| Default capabilities | LINE can stretch/extend; MESH_OBJECT cannot |
| Loss contract present | `lossContract` object with four arrays exists |

## Command kernel gates

| Test | Required result |
| --- | --- |
| Move component | Both anchors shift exactly by delta |
| Move anchor only | Selected anchor moves; opposite anchor unchanged |
| Extend linear component | New length matches requested length ± 0.001 |
| Stretch anchors | Only selected anchors move |
| Delete component | Component removed; orphan anchors pruned if unused |
| Undo/redo | Hash before undo matches initial; hash after redo matches post‑delete |
| Locked anchor move | No change; diagnostic emitted |
| Unsupported extend | No change; diagnostic emitted |
| Command journal entries | One entry appended per successful command |

## Static boundary gates

| Pattern | Allowed occurrences |
| --- | --- |
| `mesh.position.` | 0 outside whitelisted preview files |
| `rawDxf.` | 0 outside adapter files |
| `rawGltf.` | 0 outside adapter files |
| `geometry.ep1 =` | 0 outside geometry modules |
| `geometry.ep2 =` | 0 outside geometry modules |
| `commandJournal.push` | 0 outside `core/commands` |

All gates must pass before Wave 2 begins.