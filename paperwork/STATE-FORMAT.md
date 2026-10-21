# State format — `qdvc-focus/3`

The whole state of QDVC Focus is one YAML document. Settings → Data shows it,
exports it and imports it. The same document, as JSON, is what the page keeps
in `localStorage` under `qdvc-focus.v1`, so a saved session and an imported
file go through the same validation.

Interface preferences (theme, timers shown or hidden, which drawers are open)
are not part of the state; they live under `qdvc-focus.prefs.v1` and are
never exported.

Only this format is read. The app is pre-release, so files in earlier formats
(`qdvc-focus/1`, `qdvc-focus/2`) are refused with a message rather than
migrated; an earlier save found in the browser is set aside under
`qdvc-focus.v1.unreadable` and a fresh state is started.

## Top level

| Key                | Type             | Meaning |
| ------------------ | ---------------- | ------- |
| `format`           | string           | `qdvc-focus/3`. |
| `saved`            | time             | When this document was written. Informational. |
| `created`          | time             | When this state was first created. |
| `last_interaction` | time             | The last time anything was changed (or checked in). Drives "Since last update". Import resets it to the moment of import. |
| `foreground`       | id or `null`     | The running task you are attending to. A pointer, not history: changing it alters no stretch. |
| `active`           | list of tasks    | Tasks running now, in parallel, in the order they were started. |
| `queue`            | list of tasks    | Waiting tasks, in order. **The first entry is up next.** |
| `done`             | list of tasks    | Finished tasks, **newest first**. |

## Task

| Key         | Type    | Present when | Meaning |
| ----------- | ------- | ------------ | ------- |
| `id`        | string  | always       | Letters, digits, `_ . : -`; at most 80 characters. Unique within the document. |
| `title`     | string  | always       | One line. |
| `notes`     | string  | optional     | Free text, any number of lines. Written as a `\|` or `\|-` block. |
| `created`   | time    | always       | When the task was added. |
| `finished`  | time    | `done` only  | When it was marked done. |
| `stretches` | list    | once it has run | Every period the task was running, oldest first. |

Everything else — when the task first started, how long it has run in all,
the live stretch — is derived from the stretches, and so is the timeline.

## Stretches

Each stretch is an ISO 8601 interval:

```yaml
stretches:
  - 2026-10-21T09:00:00.000Z/2026-10-21T10:20:00.000Z
  - 2026-10-21T10:34:00.000Z/..
```

- An end of `..` means the stretch is still running. Only the last stretch can
  be open, and only on a task in `active`. Queued and done tasks have no open
  stretch.
- Stretches of one task do not overlap. Stretches of different tasks may
  overlap freely: that is what running in parallel means.
- There is no kind of stretch. Which running task was in the foreground is
  deliberately not recorded.

The app writes UTC with milliseconds and reads any time `Date.parse`
understands. `{ from: …, to: … }` is accepted as a long-hand spelling when
typing by hand.

### How the timeline reads them

- Every stretch is a card, in a lane (a column). A stretch takes the lowest
  lane free when it starts and keeps it until it ends; the card spans
  everything that happened meanwhile, so overlapping stretches sit side by
  side.
- Starting while something else runs forks a new lane off the leftmost running
  one; ending while something else runs joins that lane back into it.
- A minute or more with nothing running is drawn as a gap.

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
- A stretch that is not `start/end`, or has an unreadable time, is dropped.
- Stretches are sorted; an overlap within one task is trimmed so the earlier
  stretch ends where the later one starts; an end before its start is moved to
  the start.
- A task in `active` without a running stretch gets one starting now.
- A running stretch on a queued task closes now; on a done task, at
  `finished`.
- A done task without `finished` is finished at the end of its last stretch.
- A `finished` time on a task that is not in `done` is dropped.
- A `foreground` that is not a running task's id is replaced by the most
  recently started running task.

Refused outright, with a message: anything that is not a mapping at the top
level, a mapping with none of `active`, `queue` or `done`, an unrecognised,
earlier or newer `format`, and YAML the reader cannot parse.

## Example

`examples/a-working-morning.yaml` is a complete, canonical document: a day
before and a morning of work with a build running alongside a plan, a
regression suite still running, an interruption, and three tasks queued.
