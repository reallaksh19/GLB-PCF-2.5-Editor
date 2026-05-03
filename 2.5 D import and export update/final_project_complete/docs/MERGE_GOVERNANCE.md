# Merge Governance

To avoid the kinds of regressions and merge collisions observed in
previous iterations of this project, a strict merge governance
process is mandatory.

## Ownership windows

Each file or directory has a single owning agent.  Only the owner
may modify that file; all others must propose changes through a pull
request that the owner reviews.  Ownership tables are maintained
within each Wave’s work instructions.

## Frozen interfaces

Once a contract file is committed to `docs/` the exported symbols
(`CEG_SCHEMA_VERSION`, `CegEvents`, command types) must not change
without orchestrator approval.  Schema changes require a bump to
`CEG_SCHEMA_VERSION` and corresponding migrations.

## Protected files

High‑conflict files (renderers, UI shells, command dispatchers,
geometry operations, adapter converters) are protected.  Blanket
merge strategies (e.g. `git merge -X ours`) are not permitted on
these files.  Semantic merges must be performed and reviewed by the
owner.

## Merge waves

Work proceeds in numbered waves.  Wave 1 must be complete and
accepted before Wave 2 branches can merge.  Similarly Wave 3 cannot
begin until Waves 1 and 2 have passed all acceptance gates.  Each
wave has its own acceptance matrix describing quantitative pass
tests.

## Behavior gates

Continuous integration must run scenario checks in addition to
compiling the project.  For example, after Wave 3, CI must verify
that selection, move, extend, stretch and delete operations still
work.  A successful compile is not sufficient if editing behavior
regresses.

## Contract violation scan

A static analysis script scans the repository for forbidden patterns
outside whitelisted locations.  Any occurrence of the following
patterns triggers a CI failure:

```
mesh.position.
rawDxf.
rawGltf.
geometry.ep1 =
geometry.ep2 =
commandJournal.push outside core/commands
```

Allowed exceptions are documented in the acceptance matrix.