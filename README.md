# QDVC Focus

A timeline of your attention. The past runs down from the top of the page,
the present sits in the middle, and what could come next waits below it.

- **The timeline** is the whole page. Every stretch of work on a task is a
  card, and a card is taller when the stretch ran longer. Scroll up through
  your history at your leisure; the **Jump to now** pill (or `.`) brings you
  back to the present.
- **Tasks run in parallel.** Start one while another is still going — a build
  you are waiting on, say — and both simply run. The timeline lays them out
  side by side like branches in a Git graph: a new lane forks off when a task
  starts alongside another and joins back when it ends. Cards get narrower as
  more run at once.
- **One running task is in the foreground**: the one you are attending to. It
  gets the clock and the main controls (**Done, start next**, **Start next
  too**). Bring any other running task to the foreground with one click. This
  is only a pointer — the history just records that the tasks ran.
- **The queue** sits below the now line. Drag a task to the top to make it up
  next, anywhere else to reorder it, or onto a running card to start it
  alongside.
- **Since last update**, in the toolbar, counts from the last time you changed
  anything. It turns amber after 20 minutes and red after an hour. Click it to
  check in without changing anything.
- **Hide timers** (the stopwatch beside it, or `T`) hides every running clock
  and counter, for when they help less than they stress. Past durations stay.

Two drawers pull open from the edges of the timeline:

- **Overview** (left, `[`): today at a glance — time with anything running,
  tasks done, the longest stretch, the most tasks at once, a ribbon of the day
  — what is going on right now, and a list of days to jump to.
- **Inspector** (right, `]`): click any task to see and edit its title and
  notes, its times, every stretch of its history, and what you can do with it.

**Settings** (the gear, or `,`) holds the colour theme (light, dark, or auto,
following the system), the data tools — view the state as YAML, export it,
import it, clear finished tasks — and **Reset app**, which deletes everything
the app keeps in this browser.

Every change can be undone (Ctrl+Z, ⌘Z, or the Undo button). Press `?` for the
keyboard shortcuts.

It is a single static page with no build dependencies, no server and no
account. Data lives in the browser's local storage. The layout is designed for
desktop screens.

## Running it

Either:

- **Open `docs/index.html` by double-clicking it.** Works from the filesystem
  with no server. Local storage on a `file://` page is scoped per file path in
  most browsers, so if you move the file your saved state appears to vanish.
  Export before moving anything.
- **Serve it.** Any static host. For GitHub Pages, see below.

## Building

```
sh build.sh
```

Concatenates the fragments in `src/` into one self-contained page,
`docs/index.html`. The script is `cat` and `echo` and nothing else — no
bundler, no minifier, no `node_modules`. Fragments are concatenated in
filename order, which is why each starts with a two-digit number: insert `35-`
between `30-` and `40-` and it lands where you expect.

Requirements: a POSIX shell. Node is needed only for the tests.

`docs/` is committed, so the built page is part of the repository and the
deployed site matches whatever was last committed. **Rebuild and commit `docs/`
whenever you change anything under `src/`**; `tools/test-bundle.mjs` fails if
you forget.

## Deploying to GitHub Pages

Under **Settings → Pages → Build and deployment**, choose **Source: Deploy from
a branch**, branch `main`, folder `/docs`. `docs/.nojekyll` stops Jekyll from
touching the file.

## Layout

```
build.sh                     the whole build
src/
├── 00-head.html             doctype, meta, favicon
├── 10-shell.html            toolbar, drawers and their handles, the timeline frame
├── 90-foot.html             closing tags
├── css/
│   ├── 00-tokens.css        every colour, light and dark; type; metrics
│   ├── 10-base.css          reset, desk texture, labels, keyframes
│   ├── 20-chrome.css        toolbar, "since last update", drawers, handles, jump pill
│   ├── 30-controls.css      buttons, fields, tools, segmented controls
│   ├── 40-timeline.css      the grid, the graph (lines, curves, beads), cards
│   ├── 45-present.css       running cards, the clock, the now line, hiding timers
│   ├── 50-drawers.css       overview and inspector contents
│   └── 70-overlays.css      dialogs, settings window, menus, toasts, YAML view
└── js/
    ├── 00-ns.js             QDF namespace, product constants, timeline geometry
    ├── 10-util.js           escaping, time arithmetic and formatting, downloads
    ├── 15-yaml.js           the YAML subset, emit and parse
    ├── 20-model.js          the domain: parallel tasks and their stretches, pure operations
    ├── 25-store.js          the live state, localStorage, undo, reset
    ├── 30-serialize.js      state ⇄ YAML, tolerant import
    ├── 35-timeline.js       lays the state out as rows, lanes and spanning cards
    ├── 40-prefs.js          theme, timers and drawer preferences
    ├── 45-icons.js          inline SVG
    ├── 50-ui.js             dialogs, menus, toasts
    ├── 55-chrome.js         ticking values, the toolbar display, the brand mark
    ├── 60-timeline-view.js  draws the timeline grid, graph and queue
    ├── 62-present.js        running cards and the nothing-running panel
    ├── 64-overview.js       the left drawer
    ├── 66-inspector.js      the right drawer
    ├── 68-transfer.js       YAML view, export, import
    ├── 70-settings.js       the settings window
    ├── 80-keys.js           keyboard shortcuts
    └── 90-app.js            controller: render, selection, actions, drag and drop
examples/                    an importable sample state
paperwork/                   the state format, and a maintenance guide
tools/                       test harnesses
```

## The state file

```yaml
format: qdvc-focus/3
saved: 2026-10-21T10:50:00.000Z
created: 2026-10-20T15:50:00.000Z
last_interaction: 2026-10-21T10:34:00.000Z
foreground: t-plan

active:
  - id: t-regress
    title: Run the nightly regression suite on staging
    created: 2026-10-21T08:00:00.000Z
    stretches:
      - 2026-10-21T10:05:00.000Z/..
  - id: t-plan
    title: Draft the Q4 migration plan
    created: 2026-10-21T07:58:00.000Z
    stretches:
      - 2026-10-21T09:00:00.000Z/2026-10-21T10:20:00.000Z
      - 2026-10-21T10:34:00.000Z/..

queue:
  - id: t-review
    title: Review the pull request on the export endpoint
    created: 2026-10-21T08:02:00.000Z

done: []
```

`active` holds every task running now, in parallel. Each task keeps its
**stretches**: every period it was running, as an ISO 8601 interval in UTC,
with `..` for the one still running; the timeline is drawn entirely from them.
`foreground` names the running task you are attending to — state, not history.
The first entry in `queue` is up next; `done` is newest first. Import is
forgiving about hand edits and lists anything it had to repair before you
confirm. Earlier formats are not read: the app is pre-release.
`paperwork/STATE-FORMAT.md` is the full specification;
`examples/a-working-morning.yaml` is a complete example.

## Tests

```
sh tools/test-all.sh            everything, then builds and checks the output
```

Individually:

```
node tools/test-yaml.mjs        the YAML subset: round trips, hand edits, errors
node tools/test-core.mjs        model, serialiser and store on a controlled clock
node tools/test-timeline.mjs    the layout engine: lanes, spans, forks, merges, gaps
node tools/test-views.mjs       renders every view in several states; wiring checks
node tools/test-example.mjs     examples import cleanly and round-trip
node tools/test-bundle.mjs      the built page is current and runs under strict mode
```

They run under plain Node against a thin DOM stub in `tools/harness.mjs` — no
test framework, no dependencies, no browser. Set `QDF_TRACE=1` for stack
traces.

## Limitations

- Local storage is per browser, per origin, and easily cleared. Export what you
  care about; the YAML file is the durable copy.
- Undo history is kept in memory and is lost on reload. Reset app cannot be
  undone.
- Two tabs on the same page share one saved state; the most recent change wins
  and the other tab picks it up.
- The whole history is drawn at once. Thousands of stretches are fine; tens of
  thousands will make the page slow — clear finished tasks from Settings now
  and then.
- Card width is set by the most tasks that ever ran at once in the history on
  screen, so one busy afternoon narrows every card. Clearing finished tasks
  widens them again.
- The layout targets desktop screens (900 px and wider). A phone layout is not
  designed yet.

## Renaming it

The product name lives in `QDF.APP.name` in `src/js/00-ns.js` (and in the
static markup's title and brand text). The format marker and the storage keys
are deliberately independent of the name, so a rename does not invalidate
exports or orphan saved state.

## Licence

None chosen yet — add one before publishing.
