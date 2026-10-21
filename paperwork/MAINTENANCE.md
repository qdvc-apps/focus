# Maintenance guide

For whoever works on this codebase next, human or otherwise. It assumes you can
read JavaScript but know nothing about this project. Section 6 is the
checklist to run before you commit.

## 1. What this is

A single static HTML page that tracks what you are working on now, what could
come next, and what is running in the background, with timers for each. No
runtime dependencies. Data lives in `localStorage` and moves in and out as one
YAML document. Roughly 2,700 lines of ES5-flavoured JavaScript and 1,650 of
CSS in numbered fragments, concatenated by a short shell script.

## 2. Hard constraints

These are requirements from the person who commissioned it. Breaking one is a
defect even if everything still works.

1. **No frameworks or external dependencies**, at build time or at run time.
   Node is used only for the test harnesses.
2. **The build is `cat` and `echo`.** If a change needs a build step, the
   change is wrong.
3. **One concern per fragment**, numbered so concatenation order is filename
   order.
4. **Not flat.** Surfaces are lit from above, wells are sunk, controls are
   bevelled. Do not replace gradients and shadows with flat fills.
5. **No stock "AI" decoration**: no coloured accent stripe down the left edge
   of a box, no gradient text, no glassmorphism blur, no emoji in headings.
6. **Font stack**: `"Helvetica Neue", Helvetica, Arial, sans-serif`, set once
   as `--font` in `00-tokens.css`. The monospace stack is used only for the
   YAML view and import box.
7. **Desktop first.** A phone layout is a separate, future piece of work.
8. **The state is viewable, exportable and importable as YAML**, per
   `paperwork/STATE-FORMAT.md`.
9. **`docs/` is committed** and must match `src/`.

## 3. Architecture

Data flows one way:

```
user action ──▶ QDF.app ACTIONS ──▶ QDF.store.commit(label, fn)
                                        │  clones the state
                                        │  fn mutates the clone via QDF.model
                                        │  pushes the old state on the undo stack
                                        │  stamps last_interaction, saves
                                        ▼
                                  onChange ──▶ QDF.app.render()
                                                  │  QDF.view.* → HTML strings
                                                  ▼
                                               the DOM
```

- **`20-model.js`** is pure: every operation takes the state and `now` in
  milliseconds, changes the state, and returns something truthy when anything
  changed or `null` when nothing did. The store relies on that `null` to avoid
  recording no-ops as undo steps. Keep it free of DOM and storage access.
- **`25-store.js`** never mutates a state in place. Undo is swapping an older
  object back, so nothing else may hold on to and mutate `store.get()`.
- **Views** (`55-` to `66-`) are pure functions returning HTML strings. Every
  piece of user text goes through `QDF.util.esc`. They are rendered by
  `90-app.js` and tested as strings by `tools/test-views.mjs`.
- **Ticking.** Anything that changes every second is a
  `<span data-tick="…" data-from="…" data-base="…">` produced by
  `QDF.view.tick`. `QDF.app.tick()` refreshes their text twice a second without
  re-rendering, so a drag in progress is never interrupted. Do not re-render
  on a timer.
- **Actions.** Buttons declare `data-act` (and `data-id`); one delegated click
  handler looks the name up in `ACTIONS` in `90-app.js`. `test-views.mjs`
  fails if a button has no handler or a handler has no button.
- **Drag and drop** uses the native HTML5 API. Cards carry `data-drag-id`;
  drop zones carry `data-drop="now|next|later"`. The insertion marker in the
  later list takes no space, so placing it never moves the items it is
  measured against. Ordering rules live in `QDF.model.moveToLater`.
- **Toasts** show one at a time, and any newer change clears them, because an
  Undo button must always refer to the most recent change.

## 4. Invariants

- `queue[0]` is up next. There is no separate field for it.
- A task has `focused_since` only while it is `current`, `background_since`
  only while in `background`, and `finished` only while in `done`. The model
  maintains this; the importer enforces it.
- `started` is set the first time a task comes into focus and never changes.
- Export → import → export is byte-identical (apart from `saved`).
  `test-core.mjs` and `test-example.mjs` check it.
- The format marker and storage keys do not depend on the product name.

## 5. Common changes

- **A new field on a task**: add it to `FIELDS` in `30-serialize.js` (order
  matters: it is the document order), handle it in the model, document it in
  `STATE-FORMAT.md`, and regenerate the example if it should appear there.
- **A new button**: give it `data-act`, add the handler to `ACTIONS`. If it
  changes state, go through `commit` with a short label; the label is what
  Undo shows.
- **A new shortcut**: `80-keys.js` and the table in `70-about.js`.
- **A colour**: `00-tokens.css`.

## 6. Before you commit

```
sh tools/test-all.sh
```

Then open `docs/index.html` and, at minimum: add three tasks, drag one into Up
next, start, send to background, finish, undo, view the YAML, export it and
import it back.
