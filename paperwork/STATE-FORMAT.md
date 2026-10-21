# State format — `qdvc-focus/1`

The whole state of QDVC Focus is one YAML document. The **YAML** button shows
it, **Export** downloads it, **Import** reads it back. The same document, as
JSON, is what the page keeps in `localStorage` under `qdvc-focus.v1`, so a
saved session and an imported file go through the same validation.

## Top level

| Key                | Type             | Meaning |
| ------------------ | ---------------- | ------- |
| `format`           | string           | Always `qdvc-focus/1`. Import refuses other formats and newer versions. |
| `saved`            | time             | When this document was written. Informational. |
| `created`          | time             | When this state was first created. |
| `last_interaction` | time             | The last time anything was changed (or checked in). Drives "Since last update". Import resets it to the moment of import. |
| `current`          | task or `null`   | The task in focus. |
| `queue`            | list of tasks    | Waiting tasks, in order. **The first entry is up next.** |
| `background`       | list of tasks    | Tasks something else is working on, oldest first. |
| `done`             | list of tasks    | Finished tasks, **newest first**. |

## Task

| Key                  | Type    | Present when | Meaning |
| -------------------- | ------- | ------------ | ------- |
| `id`                 | string  | always       | Letters, digits, `_ . : -`; at most 80 characters. Unique within the document. |
| `title`              | string  | always       | One line. |
| `notes`              | string  | optional     | Free text, any number of lines. Written as a `\|` or `\|-` block. |
| `created`            | time    | always       | When the task was added. |
| `started`            | time    | once it has been in focus | The first time it came into focus. The big clock counts from here. |
| `focused_since`      | time    | `current` only | Start of the live focus stretch. |
| `background_since`   | time    | `background` only | Start of the live background stretch. |
| `finished`           | time    | `done` only  | When it was marked done. |
| `focus_seconds`      | integer | when non-zero | Focus time banked from earlier stretches. |
| `background_seconds` | integer | when non-zero | Background time banked from earlier stretches. |

Total focus time is `focus_seconds` plus the live stretch since
`focused_since`; likewise for background time. When a task leaves focus or the
background lane, the live stretch is added to the banked total and the
`*_since` field is removed.

Times are ISO 8601. The app always writes UTC with milliseconds
(`2026-10-21T10:12:00.000Z`) and accepts any form `Date.parse` understands.

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
refused. Each repair is listed in the import dialog before you confirm.

- A bare string or number in a list becomes a task with that title.
- A missing or unusable `id` is generated; a duplicate `id` is renamed.
- An empty `title` becomes "Untitled task".
- An unreadable time is dropped; a negative or non-numeric `*_seconds` is
  treated as zero.
- Fields that do not belong where a task sits are dropped: a `finished` time on
  a queued task, a `focused_since` in the background lane, and so on.
- A task in a position that needs a live stretch (`current`, `background`)
  without one gets one starting now; a done task without `finished` is
  finished now.
- `current` given as a list: the first entry is in focus, the rest are queued.

Refused outright, with a message: anything that is not a mapping at the top
level, a mapping with none of `current`, `queue`, `background` or `done`, an
unrecognised `format`, and YAML the reader cannot parse.

## Example

`examples/a-working-morning.yaml` is a complete, canonical document: a task in
focus with notes, three queued, one running in the background, and two done
(one of which spent time in the background).
