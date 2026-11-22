# Eidology

Per-note version control for [Obsidian](https://obsidian.md).

Each tracked note has its own history and its own branches, stored locally in the vault. I use it to keep named milestones of a document, to try a different direction without duplicating the file, to see what changed, and to recover earlier text, including the text of a note I have since deleted. It is not a Git client and it is not a backup. It sits beside both.

## Origin

Eidology is my continuation of [Version Control](https://github.com/Yuichi-Aragi/Version-Control) by Yuichi-Aragi (MIT), which its author archived in May 2026. The per-note model, the sidebar and the diff tooling come from that project. The storage, recovery and settings layers are maintained here under their own plugin id, `eidology`. Data written by the original plugin is not read.

## Design

- **Local only.** The plugin makes no network requests: no update check, no remote content, no telemetry.
- **The note is the unit.** History and branches belong to one note, not to the vault.
- **Recovery comes before convenience.** Where the original discarded data to stay tidy, Eidology keeps it or refuses to proceed.

## Histories

Two histories run side by side, each with its own retention, capture rules and settings, and each independent per branch.

- **Version History** holds milestones I choose: full copies of the note, optionally named and described, optionally GZIP-compressed.
- **Edit History** holds frequent recovery points: compressed states and deltas, kept in IndexedDB and mirrored to `.vctrl` files on disk.

Capture can be manual, triggered by saving, periodic (watch mode), or automatic for newly eligible notes. All automatic capture is off by default.

Around them are line, word, character and smart diffs in unified or side-by-side layout, a searchable timeline, optional word, character and line counts, a three-month activity heatmap, and export as `md`, `json`, `ndjson`, `txt`, `zip` or `gzip`.

## Branches

A branch is an independent line of work inside the same note file, with its own versions, edits and timeline. Switching branches rewrites the note with the state saved for that branch. There is no merge: I compare branches and copy text by hand.

Branch names are encoded into folder names so that two different names never share a folder. Names that would collide on Windows or macOS, because they differ only by letter case or Unicode form, are refused when the branch is created.

## Deleted notes

Deleting a tracked note, or a folder containing tracked notes, does not erase its history. The history moves to `<database>/.trash/<noteId>/`, after the edit history has been written to `.vctrl` files so that it survives in the moved folder.

**Restore deleted note history** lists the entries and can restore one, delete one, or empty the trash. A restored note returns to its original path, or to `Name (restored).md` if that path is taken, with the content of the latest version on its current branch and its edit history read back from disk. Retention is set in General Settings and defaults to 30 days; 0 keeps entries until deleted by hand. Expired entries are purged when the plugin loads.

Explicit deletions of history (all versions, all edits, a branch) are permanent and do not use the trash.

## Safeguards

- **Conflicting archives.** If a branch folder holds more than one `.vctrl` file, the newest is loaded and the others are moved to `conflicts/` in that folder. Nothing is deleted and nothing is merged.
- **Unreadable settings.** If `data.json` fails validation or cannot be read, it is copied to `data.json.corrupt.<timestamp>` before any default is written. The central manifest, which links notes to their history, is kept whenever it is valid on its own.
- **Note ids.** The id lives in the note's frontmatter under `eido-id` (configurable). The plugin edits only that key and leaves the rest of the YAML as it was. A central manifest in `data.json` follows renames and moves.
- **Exclusion patterns.** Each history has a list of regular expressions, one per line, that keeps matching notes from being registered automatically. The settings form accepts a line exactly when the path filter can use it, names the line and reason otherwise, and applies the list with a Save button. See [`docs/PATH_FILTERS.md`](docs/PATH_FILTERS.md).

## Interface

Settings are a single page with three categories: General Settings, Version Settings and Edit Settings. The sidebar can override them for one note or branch.

When naming or description is enabled for versions, saving a version opens a dialog for those fields, with the sidebar open or closed. Automatic saves never open it.

| Command | Action |
|---|---|
| Open view | Opens the history view (ribbon icon "Open Eidology") |
| Save a new version of the current note | Saves a version |
| Save a new edit of the current note | Saves an edit |
| Restore deleted note history | Opens the trash dialog |
| Clean up orphaned version data | Removes history that no longer belongs to a tracked note; the trash is skipped |

Supported notes are `.md` and `.base` files.

## Storage

```text
<database>/                      default: .eidologiesdb
├── <noteId>/
│   ├── manifest.json
│   ├── versions/
│   └── branches/<encoded branch name>/<timestamp>_<id>.vctrl
└── .trash/<noteId>/             same layout, plus trash.json
```

A `.vctrl` file is a ZIP archive of one branch's edit-history rows. Timeline data is kept in IndexedDB. Layout, limits and the exact behaviour of each safeguard are in [`docs/STORAGE.md`](docs/STORAGE.md).

## Installation

The plugin is not published. I build it and copy the files by hand.

```bash
pnpm install
pnpm build
```

This needs Node.js 20.19.6 or newer and pnpm 10.25.0 or newer, and the build fails on type errors. On a file system without symlinks, such as exFAT, use `pnpm install --node-linker=hoisted`.

Copy `main.js` and `styles.css` from `assets/`, and `manifest.json` from the repository root, into `<vault>/.obsidian/plugins/eidology/`, then enable the plugin under Settings, Community plugins.

The minimum Obsidian version is 1.10.0. The plugin is not declared desktop-only, but I have used it only on desktop (Windows); mobile behaviour is untested.

## Tests

`pnpm test` runs a Vitest suite in Node, without network access. It covers pure logic and services over an in-memory file system. It does not run Obsidian, the interface, the real edit-history worker or the vault adapter. Boundaries are listed in [`docs/TESTING.md`](docs/TESTING.md); the history of changes is in [`CHANGELOG.md`](CHANGELOG.md).

## Limits

- There is no branch merge.
- A note deleted while the plugin is disabled is not trashed, and a note sent to the operating system's trash cannot be recovered through Eidology.
- Whether the timeline of a restored note is rebuilt has not been verified.
- Exclusion patterns are not guarded against catastrophic backtracking at run time. A pattern with nested quantifiers, such as `^(a+)+$`, is accepted and can freeze Obsidian while paths are checked.
- Folders written under earlier branch-name encodings, and data written by the original plugin (`vc-id`, `.versiondb`), are not read.
- Local history is not a backup. Keep copies of the vault and of the database folder.

## License

MIT. Copyright (c) 2025 Yuichi and (c) 2026 Silver-Eidologer. See [`LICENSE`](LICENSE).