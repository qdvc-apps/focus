# Maintenance guide

For whoever works on this codebase next, human or otherwise. It assumes you can
read JavaScript but know nothing about this project. Section 6 is the
checklist to run before you commit.

## 1. What this is

A single static HTML page that draws your working day as a vertical timeline
— past at the top, the present in the middle, the queue below — with work
handed to machines drawn as branches beside the main line, like a Git graph.
No runtime dependencies. Data lives in `localStorage` and moves in and out as
one YAML document. Roughly 3,500 lines of ES5-flavoured JavaScript and 2,000
of CSS in numbered fragments, concatenated by a short shell script.

## 2. Hard constraints

These are requirements from the person who commissioned it. Breaking one is a
defect even if everything still works.

1. **No frameworks or external dependencies**, at build time or at run time.
   Node is used only for the test harnesses.
2. **The build is `cat` and `echo`.** If a change needs a build step, the
   change is wrong.
3. **One concern per fragment**, numbered so concatenation order is filename
   order.
4. **The timeline is the centre of the page.** Past at the top, future at the
   bottom; it scrolls freely, and getting back to the present is always one
   click or key (`.`) away.
5. **Not busy.** Utilities and detail live in the pull-open drawers (overview
   left, inspector right) and in the settings window. Data tools — import,
   export, reset — are in settings, not the toolbar. Think twice before adding
   anything that is always visible.
6. **Not flat.** Surfaces are lit from above, wells are sunk, controls are
   bevelled — in both themes. Do not replace gradients and shadows with flat
   fills.
7. **No stock "AI" decoration**: no coloured accent stripe down the left edge
   of a box, no gradient text, no glassmorphism blur, no emoji in headings.
8. **Font stack**: `"Helvetica Neue", Helvetica, Arial, sans-serif`, set once
   as `--font` in `00-tokens.css`. Monospace only for the YAML view and import.
9. **Light, dark and auto themes.** Every colour is a token in `00-tokens.css`
   with a value for each theme. Fixed hues are allowed only where the meaning
   is the same in both (the green "done" button, the blue selection).
10. **Desktop first.** A phone layout is a separate, future piece of work.
11. **The state is viewable, exportable and importable as YAML**, per
    `paperwork/STATE-FORMAT.md`. **Reset app** removes every localStorage key
    starting with `qdvc-focus.` and nothing else.
12. **`docs/` is committed** and must match `src/`.

## 3. Architecture

Data flows one way:

```
user action ──▶ QDF.app ACTIONS ──▶ QDF.store.commit(label, fn)
                                        │  clones the state
                                        │  fn changes the clone via QDF.model
                                        │  pushes the old state on the undo stack
                                        │  stamps last_interaction, saves
                                        ▼
                                  onChange ──▶ QDF.app.render()
                                                  │  QDF.timeline.build(state, now)
                                                  │  QDF.view.* → HTML strings
                                                  ▼
                                               the DOM
```

- **`20-model.js`** is pure. A task's history is its list of stretches;
  operations open and close them (`begin`/`end`). Every operation takes the
  state and `now` in milliseconds and returns something truthy when anything
  changed, `null` when nothing did; the store relies on that `null` to avoid
  recording no-ops as undo steps.
- **`25-store.js`** never mutates a state in place. Undo is swapping an older
  object back, so nothing else may hold on to and mutate `store.get()`.
- **`35-timeline.js`** is the layout engine, and pure: state in, rows out. It
  decides row order, which lane each background stretch takes (the lowest
  free one), where branches fork and merge, where gaps go, the style of the
  main line in every row, and each row's height hint. `tools/test-timeline.mjs`
  pins its rules down; change them there first.
- **`60-timeline-view.js`** draws those rows. The graph is drawn per row:
  lines are bars anchored to the top or bottom of the row, forks and merges
  are fixed-height SVG curves between the row edge and the node, and the node
  sits `QDF.GEOM.nodeY` from the top (the CSS uses the same 24px as
  `--node-y`). So rows can be any height without the drawing stretching. Keep
  `QDF.GEOM` and the CSS in step.
- **Views** (`55-` to `70-`) are pure functions returning HTML strings. Every
  piece of user text goes through `QDF.util.esc`.
- **Ticking.** Anything that changes every second is a
  `<span data-tick="…" data-from="…" data-base="…">` from `QDF.view.tick`.
  `QDF.app.tick()` refreshes their text twice a second without re-rendering,
  so a drag or a scroll is never interrupted. Do not re-render on a timer.
- **Keeping now in place.** Before a render the controller notes where the
  present is in the viewport; after it, it scrolls by the difference, so
  finishing a task (which adds a row above) does not make the page jump. If
  the present was off screen — you were reading history — the scroll position
  is left alone. The jump pill appears whenever the present is out of view.
- **Actions.** Buttons declare `data-act` (and `data-id`); one delegated click
  handler looks the name up in `ACTIONS` in `90-app.js`. Cards declare
  `data-select`; clicking one selects it and opens the inspector.
  `test-views.mjs` fails if a button has no handler or a handler has no button.
- **Drag and drop** uses the native HTML5 API. Queued cards carry
  `data-drag-id`; drop zones carry `data-drop="future|now"`. The insertion
  marker takes no space, so placing it never moves the rows it is measured
  against. Ordering is `QDF.model.moveBefore`.
- **Preferences** (`40-prefs.js`) apply the theme as soon as the script runs,
  before first paint, and follow the system setting when the theme is auto.
- **Toasts** show one at a time, and any newer change clears them, because an
  Undo button must always refer to the most recent change.

## 4. Invariants

- `queue[0]` is up next. There is no separate field for it.
- Only the last stretch of a task can be open: a focus stretch on `current`,
  a background stretch on a `background` task. Queued and done tasks have
  none. The model maintains this; the importer enforces it.
- `finished` exists only on tasks in `done`.
- Export → import → export is byte-identical (apart from `saved`).
  `test-core.mjs` and `test-example.mjs` check it.
- The format marker and storage keys do not depend on the product name.

## 5. Common changes

- **A new field on a task**: write it in `itemToDoc` and read it in
  `itemFromDoc` (`30-serialize.js`), handle it in the model, document it in
  `STATE-FORMAT.md`, regenerate the example if it should appear there.
- **A new button**: give it `data-act`, add the handler to `ACTIONS`. If it
  changes state, go through `commit` with a short label; the label is what
  Undo shows.
- **A new shortcut**: `80-keys.js` and the table in `70-settings.js`.
- **A colour**: `00-tokens.css`, in both the light and the dark block.
- **A timeline rule** (ordering, lanes, outcomes): `35-timeline.js`, with a
  case in `test-timeline.mjs`.

## 6. Before you commit

```
sh tools/test-all.sh
```

Then open `docs/index.html` and, at minimum: add three tasks, drag one to the
top of the queue, start it, send it to the background, finish the next one,
bring the background task forward, undo, scroll up and jump back to now, open
both drawers, switch the theme, export the YAML and import it back.
