# Tests

```
pnpm test
```

Runs Vitest on `tests/**/*.test.ts` in Node. No network access is needed, and the tests are not part of `pnpm build` or of `main.js`. `vitest` and `fake-indexeddb` are development dependencies.

`fake-indexeddb` replaces IndexedDB in Node so that the Dexie database used by the edit-history worker can run in a test.

## What is covered

| File | Covers |
| --- | --- |
| `tests/buffer.test.ts` | `toExactArrayBuffer`: copies only the window of a view, independent copy, empty view |
| `tests/branch-path.test.ts` | Branch folder encoding, previously colliding names, reserved names, length limit, case and Unicode-form uniqueness |
| `tests/branch-files.test.ts` | Choice of the winning `.vctrl` file, determinism on ties, names inside `conflicts/` |
| `tests/frontmatter-surgical.test.ts` | Insertion and deletion of a key in the YAML text (`src/utils/frontmatter/surgical.ts`): existing text kept, round trip of ids that resemble numbers, booleans or YAML syntax, nested keys, CRLF |
| `tests/settings.test.ts` | Loading `data.json` (`SettingsInitializer.loadSettings`), `SettingsResolver`, and the history settings merge |
| `tests/trash.test.ts` | Trash rules: description file parsing, expiry by retention, choice of the restore path, decoding of branch folder names |
| `tests/trash-service.test.ts` | `TrashService` over an in-memory file system: order of the steps when trashing, two overlapping moves of the same note, refusal to replace an entry that has a manifest, listing, restore (path conflict, branch names, empty history, rollback on failure), purge, empty, expiry |
| `tests/startup-timing.test.ts` | Formatting of the start-up timing report (`formatStartupReport`) |
| `tests/form-validator.test.ts` | Exclusion pattern list (`RegexListSchema`): accepted and rejected lines, line numbers in messages, speed on long lines and many lines, agreement with the path filter (`compileRegex`), exclusion with several alternatives |
| `tests/auto-save-target.test.ts` | Pure rules of automatic saves without the view: whether the view shows the saved file, branch choice, once-per-episode warning |
| `tests/detail-prompts.test.ts` | Which fields the save dialog asks for, by view mode and settings |
| `tests/edit-history-export-import.test.ts` | Export of a branch to a zip and import back: every edit returns with its own content; the archive starts with the zip signature; an empty archive is rejected |

## What is not covered

- Everything that needs Obsidian (`App`, `Vault`, `Notice`, `Modal`). The save dialog (`src/ui/modals/VersionDetailsModal.ts`) and the thunk that opens it are not run by any test. In particular, the code that moves files to `conflicts/` (`PersistenceService.quarantineSupersededFiles`) is not run by any test; only the pure functions it uses are.
- The user interface and the Redux state.
- Locating the frontmatter block in a note. `extractFrontmatter` calls Obsidian's `getFrontMatterInfo`, which does not exist outside Obsidian, so the read-modify-write cycle of `updateFrontmatter` (BOM, CRLF, `---` and `...` delimiters) is not run by any test. Only the pure YAML-text functions are.
- The settings tab and the Redux state, including the Save button of the exclusion lists (`AutoRegisterSettings.tsx`).
- The trash dialog (`src/ui/modals/TrashModal.ts`), the command, and the wiring in `handleFileDelete`, including the sharing of overlapping runs there. The trash tests use an in-memory stand-in for the vault adapter, so they do not show how Obsidian's adapter behaves with hidden folders or with `rename` on folders.
- The real edit-history worker: the tests replace `persistAllBranchesToDisk` and `loadBranchFromDisk` with stubs, so that a restored branch is actually rebuilt in IndexedDB is not tested.

## Known limit of the export and import test

The test cannot tell whether the typed-array copies in the import/export service are needed. With fflate 0.8.2 under Node, the archives and entries it produces already own buffers of exact size, so the test passes with and without those copies.

## Adding a test

Put a `*.test.ts` file in `tests/`. The `@/` alias points to `src/`. Test pure functions where possible; keep Obsidian types out of the module under test so it can be imported in Node.

## Known defects recorded by tests

No test is currently marked `it.fails`. The defects found by the first frontmatter and settings tests were fixed; see `CHANGELOG.md`, section "Fixed". A test marked `it.fails` asserts the correct behavior of a defect that is known and not yet fixed; Vitest reports it as passing, and it starts failing once the defect is fixed, which signals that the marker must be removed.
