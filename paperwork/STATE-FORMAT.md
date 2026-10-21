# State format — `qdvc-focus/2`

The whole state of QDVC Focus is one YAML document. Settings → Data shows it,
exports it and imports it. The same document, as JSON, is what the page keeps
in `localStorage` under `qdvc-focus.v1`, so a saved session and an imported
file go through the same validation.

Interface preferences (theme, which drawers are open) are not part of the
state; they live under `qdvc-focus.prefs.v1` and are never exported.

## Top level

| Key                | Type           | Meaning |
| ------------------ | -------------- | ------- |
| `format`           | string         | `qdvc-focus/2`. Version 1 is read and converted; anything else is refused. |
| `saved`            | time           | When this document was written. Informational. |
| `created`          | time           | When this state was first created. |
| `last_interaction` | time           | The last time anything was changed (or checked in). Drives "Since last update". Import resets it to the moment of import. |
| `current`          | task or `null` | The task in focus. |
| `queue`            | list of tasks  | Waiting tasks, in order. **The first entry is up next.** |
| `background`       | list of tasks  | Tasks something else is working on, oldest first. |
| `done`             | list of tasks  | Finished tasks, **newest first**. |

## Task

| Key         | Type    | Present when | Meaning |
| ----------- | ------- | ------------ | ------- |
| `id`        | string  | always       | Letters, digits, `_ . : -`; at most 80 characters. Unique within the document. |
| `title`     | string  | always       | One line. |
| `notes`     | string  | optional     | Free text, any number of lines. Written as a `\|` or `\|-` block. |
| `created`   | time    | always       | When the task was added. |
| `finished`  | time    | `done` only  | When it was marked done. |
| `stretches` | list    | once it has been in focus | Every period the task spent in focus or in the background, oldest first. |

Everything else — when the task first started, how long it has been focused
in all, how long it ran in the background, the live stretch — is derived from
the stretches, and so is the timeline.

## Stretches

Each stretch is a one-key mapping: the kind, then an ISO 8601 interval.

```yaml
stretches:
  - focus: 2026-10-21T08:45:00.000Z/2026-10-21T09:00:00.000Z
  - background: 2026-10-21T09:00:00.000Z/2026-10-21T09:40:00.000Z
  - focus: 2026-10-21T10:34:00.000Z/..
```

- `focus` — the task was the one in focus.
- `background` — something else was working on it.
- An end of `..` means the stretch is still running. Only the last stretch can
  be open, and only on the task in focus (an open `focus` stretch) or on a task
  in `background` (an open `background` stretch). Queued and done tasks have no
  open stretch.
- Stretches of one task do not overlap. Focus stretches of different tasks do
  not overlap either: only one thing is in focus at a time.

The app writes UTC with milliseconds and reads any time `Date.parse`
understands. `{ kind: focus, from: …, to: … }` is accepted as a long-hand
spelling when typing by hand.

### How the timeline reads them

- Focus stretches, in time order, make up the main line.
- A background stretch is a branch. It forks off at its start, and when it
  ends it merges back: into the same task's next focus stretch if that starts
  at the same moment (the task was brought forward), otherwise through an end
  marker ("finished in the background", "went back to the queue").
- A minute or more with no focus stretch is drawn as a gap.

## The YAML subset

The writer uses block mappings and sequences, plain or double-quoted scalars,
and literal blocks for multi-line notes. Output is deterministic: the same
state always produces the same bytes, apart from `saved`.

The reader accepts everything the writer produces and the edits people
usually make by hand: comments, blank lines, a leading `---` or trailing
`...`, CRLF line endings, single-quoted strings, `~` or `null`, `[]`, `{}` and
one-line `[a, b]` lists, sequences written at the same indentation as their
key, and `>` folded blocks. It rejects anchors, aliases, tags, inline `{…}`
mappings and multiple documents, and reports the line number.

## Forgiving import

So that a hand-edited file still imports, these are repaired rather than
refused. The import dialog lists the repairs before you confirm.

- A bare string or number in a list becomes a task with that title.
- A missing or unusable `id` is generated; a duplicate `id` is renamed.
- An empty `title` becomes "Untitled task".
- A stretch with an unreadable time or an unknown kind is dropped.
- Stretches are sorted; an overlap is trimmed so the earlier one ends where the
  later one starts; an end before its start is moved to the start.
- The task in focus without an open focus stretch gets one starting now; the
  same for a background task and an open background stretch.
- An open stretch on a queued task closes now; on a done task, at `finished`.
- A done task without `finished` is finished at the end of its last stretch.
- A `finished` time on a task that is not in `done` is dropped.
- `current` given as a list: the first entry is in focus, the rest are queued.

Refused outright, with a message: anything that is not a mapping at the top
level, a mapping with none of `current`, `queue`, `background` or `done`, an
unrecognised or newer `format`, and YAML the reader cannot parse.

## Version 1

Files written by version 1.0 of the app (`format: qdvc-focus/1`) kept totals
(`started`, `focus_seconds`, `background_seconds`, `focused_since`,
`background_since`) rather than stretches. They are converted on import, and
on load if they are what is saved in the browser: banked time becomes
stretches laid end to end from `started`, and the live stretch starts where
it really did. Earlier stretches are therefore approximate, and the import
dialog says so.

## Example

`examples/a-working-morning.yaml` is a complete, canonical document: a day
before and a morning of work, with a task brought back from the background,
an interruption, one task still running in the background, and three queued.
