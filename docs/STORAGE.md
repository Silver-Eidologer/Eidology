# Storage notes

## Layout of a note's data

```
<db root>/<noteId>/
    versions/                     Version History: one file per version
    branches/<branch folder>/     Edit History: one .vctrl file per branch
        <timestamp>_<id>.vctrl
        conflicts/                superseded .vctrl files (see below)
<db root>/.trash/<noteId>/        history of a deleted note (see "Trash")
    trash.json                    noteId, notePath and deletedAt of the deletion
    ...                           the rest is the folder above, unchanged
```

A `.vctrl` file is a zip archive of the edit-history database rows of one branch.

## Branch folder names

The folder name is derived from the branch name by `encodeBranchPathComponent` (`src/utils/branch-path.ts`).

| Rule | Example |
| --- | --- |
| Letters and digits of any script, space, `_`, `.`, `-` are kept | `rascunho-草稿` stays `rascunho-草稿` |
| Any other character, and `%`, becomes `%XX` for each UTF-8 byte | `a/b` becomes `a%2Fb`; `100%` becomes `100%25` |
| A trailing `.` or space is escaped (Windows drops them) | `draft.` becomes `draft%2E` |
| A reserved Windows device name has its first character escaped | `CON` becomes `%43ON` |
| Surrounding whitespace is ignored | `" main "` becomes `main` |

Different names always give different folder names. The previous scheme replaced `/` and `\` with `_` and collapsed `..`, so `a/b` and `a_b` shared one folder.

### Case and Unicode form

Windows and macOS treat `Main` and `main` as one folder, and macOS also treats the NFC and NFD forms of the same text as one. The encoding does not change that. Instead, creating a branch is refused when its name matches an existing branch of the note after trimming, NFC normalization and lowercasing (`findBranchNameProblem`). Names that were already stored by earlier builds are not checked against each other.

### Limits

- A folder name may not exceed 255 bytes once encoded. Characters that are escaped cost 3 bytes per UTF-8 byte (an emoji costs 12). Such names are refused when the branch is created.
- Folders created by earlier builds use the old scheme and are not found. Legacy compatibility is intentionally not provided.

## Conflicting `.vctrl` files

When a branch folder holds more than one `.vctrl` file, the plugin reads all of them to get their timestamps (the `exportedAt` value inside the archive, or the file modification time if that is missing). The file with the highest timestamp is the one loaded. Ties are resolved by the highest path.

Every other file is moved to `<branch folder>/conflicts/` under its own name (`<name> (2).vctrl` if that name is taken there), and a notice reports how many were moved. The `conflicts/` folder is not read again. If a file cannot be moved it stays where it is and a warning is logged.

No contents are merged. The edits held only by a superseded file are not loaded; they remain in `conflicts/` for manual recovery.

### What this does not cover

Only reading is covered. When the plugin writes a branch, it creates the new `.vctrl` file and then deletes every other `.vctrl` file directly inside the branch folder. A file that another process places in the branch folder between two reads, and that is still there at the next write, is deleted by that write without passing through `conflicts/`. The plugin does not distinguish its own files from foreign ones when it writes.

Deleting a branch removes its whole folder, `conflicts/` included.

`conflicts/` has no retention limit. Files stay until the user deletes them or the branch is deleted.

## Trash

Deleting a note, or a folder that contains notes, moves the history of each affected note to the trash instead of deleting it. This applies only to the deletion of the note itself. The commands that delete a note's history on request ("Delete all versions", "Delete all edits") still delete permanently.

### What is kept

On deletion, in this order:

1. The edit history of every branch is written to its `.vctrl` file, even where disk persistence is turned off for the note. If this fails, a warning is logged and only the versions are kept.
2. The note is removed from the central manifest.
3. The folder `<db root>/<noteId>` is moved to `<db root>/.trash/<noteId>`, and `trash.json` is written in it. If `trash.json` cannot be written, the folder is moved back. If the trash already holds an entry for the same note ID that has a `manifest.json`, nothing is moved: the operation fails with a message, the folder and the central manifest entry stay, and the edit-history rows in IndexedDB are kept. An entry without `manifest.json` is an incomplete leftover and is replaced.
4. The edit-history rows in IndexedDB are deleted. They are not kept: they are rebuilt from the `.vctrl` files on restore.

The trash has no index file. Its list of entries is the list of its folders. A folder without a valid `trash.json`, or whose name differs from the `noteId` inside it, is not listed and is never deleted automatically.

Deleting a folder makes Obsidian report each note inside it twice, as a file and as part of the folder. Runs for the same note ID that overlap share one run, so the history folder is moved once.

### Restoring

The command "Restore deleted note history" opens a list of the entries. Restoring an entry:

1. Moves the folder back to `<db root>/<noteId>`. It is refused if a folder with that name already exists.
2. Registers the note in the central manifest.
3. Creates the note at its original path, or at `<name> (restored).md` (then `(restored 2)` and so on) if that path is in use. The comparison ignores letter case.
4. Writes the content of the latest version of the current branch into the note and makes sure the note id is in its frontmatter.
5. Reads the `.vctrl` file of every branch folder back into the edit history. Branch names are recovered from the folder names.

If any step from 2 to 4 fails, the note is unregistered and the folder returns to the trash.

A note whose history holds no version is created empty, and the dialog says so. Its edit history, if any, is still read back, but it is not used to fill the note.

### Retention

`trashRetentionDays` in General Settings sets how many days an entry stays. The default is 30. 0 keeps entries until they are deleted by hand. Expired entries are deleted when the plugin loads; nothing runs while the plugin stays open. The dialog also deletes one entry or empties the trash, and emptying asks for a second click to confirm.

### Limits

- Only the deletion seen by the plugin is covered. A note deleted while the plugin is disabled is not trashed.
- The orphan cleanup skips `.trash`.
- The timeline of a restored note is not rebuilt by the restore. Whether it is regenerated when the note is opened was not checked.
- The creation date in the central manifest is the date of the restore, not the original one.
- Changing `databasePath` renames the database folder, so the trash moves with it.
