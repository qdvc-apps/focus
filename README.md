# QDVC Focus

A small desk for your attention. One thing in focus, a queue of what could
come next, and a lane for work that carries on without you while you get on
with something else.

- **Now** shows the task in focus and a clock counting from when you first
  started it, with how long this stretch has run and how long you have spent
  on it in total.
- **Queue** holds what could come next. Drag any task into the **Up next** tray
  to make it the next thing; drag within **Later** to reorder; drag onto the
  Now card to start it straight away.
- **Done, start next** moves on: the current task goes to the done log and up
  next comes into focus.
- **Send to background** is for work a machine is doing — a build, a render,
  an upload. The task moves to the background lane with its own timer, and up
  next comes into focus. Any number can run at once; bring one forward or mark
  it done when it finishes.
- **Since last update** in the toolbar counts from the last time you changed
  anything. It turns amber after 20 minutes and red after an hour. Click it to
  check in without changing anything.
- **YAML** shows the entire state as YAML. **Export** downloads it; **Import**
  reads it back to resume between sessions or machines.

Every change can be undone (Ctrl+Z, ⌘Z, or the Undo button). Double-click any
task to edit its title and notes. Press `?` for the keyboard shortcuts.

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
├── 10-shell.html            the static markup: toolbar, columns, status bar
├── 90-foot.html             closing tags
├── css/
│   ├── 00-tokens.css        colours, type, metrics, shadows
│   ├── 10-base.css          reset, desk texture, keyframes
│   ├── 20-chrome.css        toolbar, "since last update", workspace grid, status bar
│   ├── 30-controls.css      buttons, fields, tools
│   ├── 40-panels.css        raised panels, header bars, badges
│   ├── 50-now.css           the Now card and its clock
│   ├── 55-queue.css         queue sidebar, task cards, drop marker
│   ├── 60-lanes.css         background lane, done log
│   └── 70-overlays.css      dialogs, menus, toasts, YAML view
└── js/
    ├── 00-ns.js             QDF namespace, product constants
    ├── 10-util.js           escaping, time arithmetic and formatting, downloads
    ├── 15-yaml.js           the YAML subset, emit and parse
    ├── 20-model.js          the domain: pure operations on the state
    ├── 25-store.js          the live state, localStorage, undo
    ├── 30-serialize.js      state ⇄ YAML, tolerant import
    ├── 45-icons.js          inline SVG
    ├── 50-ui.js             dialogs, menus, toasts
    ├── 55-chrome.js         toolbar indicator and status bar views
    ├── 60-now.js            the Now card view
    ├── 62-queue.js          the queue view
    ├── 64-background.js     the background lane view
    ├── 66-done.js           the done log view
    ├── 67-edit.js           the task editor
    ├── 68-transfer.js       YAML view, export, import
    ├── 70-about.js          About dialog, brand mark
    ├── 80-keys.js           keyboard shortcuts
    └── 90-app.js            controller: render, actions, drag and drop, ticking
examples/                    an importable sample state
paperwork/                   the state format, and a maintenance guide
tools/                       test harnesses
```

## The state file

```yaml
format: qdvc-focus/1
saved: 2026-10-21T10:30:00.000Z
created: 2026-10-21T07:55:00.000Z
last_interaction: 2026-10-21T10:12:00.000Z

current:
  id: t-mvhtl2yo-m95u
  title: Draft the Q4 migration plan
  started: 2026-10-21T09:00:00.000Z
  focused_since: 2026-10-21T10:12:00.000Z
  focus_seconds: 3900

queue:
  - id: t-mvhtq85c-q3ja
    title: Review the pull request on the export endpoint

background:
  - id: t-mvhtnnk0-cau0
    title: Run the nightly regression suite on staging
    background_since: 2026-10-21T10:12:00.000Z

done: []
```

The first entry in `queue` is up next. Times are ISO 8601 in UTC; the
`*_seconds` fields hold time banked from earlier stretches, and the live
stretch is counted from `focused_since` or `background_since`. Import is
forgiving about hand edits — a bare string in a list becomes a task with that
title, missing ids are generated, and fields that do not belong where a task
sits are dropped — and reports what it changed before you confirm.
`paperwork/STATE-FORMAT.md` is the full specification;
`examples/a-working-morning.yaml` is a complete example.

## Tests

```
sh tools/test-all.sh          everything, then builds and checks the output
```

Individually:

```
node tools/test-yaml.mjs      the YAML subset: round trips, hand edits, errors
node tools/test-core.mjs      model, serialiser and store on a controlled clock
node tools/test-views.mjs     renders every view in several states; wiring checks
node tools/test-example.mjs   examples import cleanly and round-trip
node tools/test-bundle.mjs    the built page is current and runs under strict mode
```

They run under plain Node against a thin DOM stub in `tools/harness.mjs` — no
test framework, no dependencies, no browser. Set `QDF_TRACE=1` for stack
traces.

## Limitations

- Local storage is per browser, per origin, and easily cleared. Export what you
  care about; the YAML file is the durable copy.
- Undo history is kept in memory and is lost on reload.
- Two tabs on the same page share one saved state; the most recent change wins
  and the other tab picks it up.
- The layout targets desktop screens (1024 px and wider). A phone layout is not
  designed yet.

## Renaming it

The product name lives in `QDF.APP.name` in `src/js/00-ns.js` (and in the
static markup's title and brand text). The format marker `qdvc-focus/1` and the
storage keys are deliberately independent of the name, so a rename does not
invalidate exports or orphan saved state.

## Licence

None chosen yet — add one before publishing.
