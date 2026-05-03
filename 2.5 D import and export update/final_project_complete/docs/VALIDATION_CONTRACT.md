# Validation Contract

Validation routines ensure that edits produce a coherent and
reasonable Canonical Edit Graph.  The contract defines what
constitutes an error versus a warning and establishes the minimum
checks that must pass after each command.

## Validation levels

Validation functions return an object of the form:

```js
{
  errors: [ { code, message, componentId?, anchorId? } ],
  warnings: [ { code, message, componentId?, anchorId? } ]
}
```

- **Errors** stop the command from being committed.  The dispatcher
  must revert to the previous CEG and record the error diagnostics.
- **Warnings** allow the command to proceed but record a diagnostic.

## Model validation

At a minimum Wave 1 validators must check:

1. Every component’s `anchorIds` array references existing anchors.
2. Components of type `LINE` or `PIPE` with geometryRole
   `LINEAR` have exactly two anchors.
3. Anchors contain numeric `x`, `y`, `z` coordinates.
4. Deleting a component does not leave orphan anchors unless the
   anchors are still referenced by another component.
5. Attempting to move a locked anchor results in an error.
6. Extending a linear component requires a new length > 0.  A
   negative or zero length triggers an error.
7. Stretching anchors that have `connectedTo` entries generates a
   warning but is allowed in Wave 1.

Further validators will be added in Waves 2 and 3 to check
topology links, layer visibility and export readiness.