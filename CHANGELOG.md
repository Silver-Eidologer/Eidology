## 1.0.0 - Eidology

Fork of Version Control 1.9.44 (Yuichi-Aragi, MIT) under the identity Eidology. Legacy data compatibility is intentionally not provided.

### Changed
- Identity: id `eidology`, name `Eidology`, author `Silver-Eidologer`, version `1.0.0`.
- Version number: the version was not incremented during development. The state of the project at this point is declared 1.0.0. All changes listed in this section belong to it.
- `npm run build` / `pnpm build` now runs `tsc --noEmit` first and aborts on type errors.
- `esbuild.config.mjs` resolves its own directory with `fileURLToPath`, which fixes builds on Windows paths containing spaces or a drive letter. The non-fatal type-check that the script ran internally was removed, as the build script now performs a fatal one.

### Changed (settings)
- The plugin settings page is a single page with three categories: General Settings, Version Settings and Edit Settings. The previous dropdown that switched between three views was removed. Controls inside the Version and Edit categories are scoped to their own global defaults (`SettingsScope`, `updateGlobalDefaults`), independent of the note open in the sidebar. The per-note settings panel in the sidebar is unchanged.

- User-facing plugin name: ribbon tooltip "Open Eidology", command "Open view", view title "Eidology", and notices and error messages that referred to the plugin as Version Control. Generic uses of the phrase "version control" (for example "note under version control") are unchanged. Internal identifiers (view type, CSS class names, command ids) are unchanged.

- Exclusion pattern lists (Version Settings and Edit Settings) have a Save button and are no longer saved automatically while typing. The automatic save rewrote the textarea with the normalized list (blank lines and surrounding spaces removed) while the user was typing. The button is enabled only when the text is valid and differs from the saved list. Unsaved text is lost if the settings page is closed. Not run inside Obsidian.
- The settings form rejects exactly the patterns that the path filter discards, and names the line and the reason. Before, the form accepted patterns that the filter silently ignored (`(?=...)`, `(?!...*...)`, `\**`, `(?:...){2,}`, `\p{...}`). See `docs/PATH_FILTERS.md`.

### Changed (storage)
- The folder of an edit-history branch is an injective encoding of the branch name (`src/utils/branch-path.ts`). Letters and digits of any script, spaces, `_`, `.` and `-` are kept. Other characters and `%` become `%XX` escapes of their UTF-8 bytes; a trailing `.` or space and reserved Windows device names are escaped too. Branches `a/b`, `a_b` and `a..b` no longer share a folder. Folders created by earlier builds are not found by this scheme (no legacy compatibility, by decision).
- Creating a branch whose name differs from an existing one only by letter case, Unicode normalization form or surrounding whitespace is rejected, because such names share one folder on Windows and macOS. A name whose encoding exceeds 255 bytes is rejected.
- When a branch folder holds more than one `.vctrl` file, the file with the highest timestamp is read as before. The other files are moved to `conflicts/` inside the branch folder instead of being deleted, and a notice reports it. See `docs/STORAGE.md` for the scope of this change.

### Changed (names)
- Default frontmatter key of the note id: `vc-id` becomes `eido-id`. Default data folder: `.versiondb` becomes `.eidologiesdb`. Notices and thrown error messages that began with `VC:` now begin with `Eidology:`. These are defaults: a `data.json` written by an earlier build keeps its stored `noteIdFrontmatterKey` and `databasePath` values, and notes already carrying `vc-id` are not recognized under the new key. Console log prefixes (`VC:`, `Version Control:`) are unchanged.

### Changed (deleting notes)
- Deleting a note, or a folder with notes, no longer deletes its history. The history folder is moved to `<db root>/.trash/<noteId>`, the edit history of every branch is written to its `.vctrl` file first, and the notice says where to recover it. The commands that delete history on request still delete permanently. See `docs/STORAGE.md`, section "Trash".

### Changed (code quality)
- Empty `catch` blocks (25 sites) now either log a warning with the `Eidology:` prefix (failures that could hide a real problem: backup of a corrupt file, folder verification, worker and database teardown, manifest parsing on import, reconstruction from a base edit, retry validation hook) or carry a comment that states why the error is ignored (best-effort UI calls, expected fallbacks between patch formats). Behavior is unchanged: no error is now thrown or rethrown.
- `as any` reduced from 29 to 6. Obsidian's `moment` is wrapped once in `src/utils/moment.ts` and all 15 call sites use it without casts. The other casts were replaced by real types. In `DuplicateDetector.shouldSkipMinimalChanges` the cast hid that the settings object passed on a save is the plugin settings merged with the history settings; its type now says so.
- The 6 remaining `as any` are the `null as any` assignments that release references on unload (`plugin-unloader.ts`, `services-registry.ts`). The fields are declared non-nullable, and changing that would touch every use.

### Changed (edit history)
- The first edit of a note is created automatically. Before, auto-save saved edits only for notes that already had one, so edit history started only after a manual "Save a new edit". Now, when "Auto-register notes" is on in Edit Settings and the path passes its path filters, (1) auto-registering a note also saves its first edit, and (2) the first auto-save of a tracked note that has no edits creates it. Notes that are not tracked are still never initialized by an auto-save.

### Added
- Trash for deleted notes (upstream issue #49). The command "Restore deleted note history" lists the deleted notes and restores one (history folder, central manifest entry, note file and edit history), deletes one permanently, or empties the trash. New setting "Trash retention (days)" in General Settings, default 30; 0 keeps entries until deleted by hand. Expired entries are deleted when the plugin loads. The orphan cleanup skips the trash. Unit tests cover the rules and the service; the dialog and the wiring are not run by any test.
- Save dialog for versions (upstream issue #52). When a version is saved on request, by the button or the "Save a new version of the current note" command, and naming or description is enabled for versions, a dialog asks for those details before saving. It works with the sidebar closed. Enter in the name field saves; Ctrl/Cmd+Enter does in the description field; Cancel, Escape or a click outside saves nothing. No new setting was added: the existing "name" and "description" options of Version Settings control it, and with both off a version is saved at once, as before.
  - Automatic saves never open the dialog.
  - A version saved through the dialog is not opened for inline naming in the sidebar afterwards.
  - Edit history is unchanged: a saved edit is still opened for inline naming in the sidebar.
  - If the active note changes while the dialog is open, nothing is saved and a notice says so.
  - In the edits view, the command and button for versions follow the global defaults of Version Settings, not the settings of the open note.
- Tests for the frontmatter text functions (insertion and deletion of the note id key) and for settings loading, resolution and merging. The defects they found were fixed (see "Fixed").
- Test suite (`pnpm test`, Vitest and fake-indexeddb as development dependencies). It is not part of `pnpm build` and is not bundled into `main.js`. See `docs/TESTING.md`.

### Removed
- All network access. Removed the remote changelog fetch (`changelogApi`), the remote release badge in the settings panel, and the "Report issue" link.
- The changelog panel and its startup and menu triggers. The history of changes is kept in this file only.
- Unused code and packages: `src/utils/versions.ts` (version comparison, no longer called after the changelog panel was removed) and the dependencies `semver`, `@types/semver` and `radix-ui` (the umbrella package; the code imports `@radix-ui/react-dropdown-menu` directly).
- "Create new note from version" and "Create new note from edit" (the deviation function) in the version and edit menus, with the code behind them: `createDeviation`, `createDeviationFromContent`, the pending-deviation exclusion list and its checks, and the parameter types and validator. It created a note that received the original note's `eido-id` through a stale metadata cache, so two notes shared one history and the plugin switched the registered path between them. Branching is unchanged. A copy made with Obsidian's own file copy works. `generateUniqueFilePath` in `src/utils/file.ts` has no caller now and was left in place.
- Release tooling: `version-manager.mjs`, the `release` script in `package.json`, the GitHub Actions workflow `.github/workflows/main.yml` and `version-beta.json`. They only served to publish releases to GitHub. `versions.json` is kept.

### Fixed
- Deleting a folder that contains tracked notes. Obsidian reports each note inside the folder twice (as a file and as part of the folder), and the two runs moved the same history folder at once; the second run replaced the good trash entry with an incomplete folder that had no `manifest.json`, so the entry could not be restored, and the history of another note in the folder could be lost. Runs for the same note ID that overlap now share one run (in `handleFileDelete` and in `TrashService.moveToTrash`). `moveToTrash` no longer deletes a trash entry that holds `manifest.json`: it refuses, leaves the folder and the central manifest entry where they are, and the IndexedDB rows are kept. An incomplete leftover without `manifest.json` is still replaced. A note whose history folder is already gone is not written to disk again. Cause found by reading the code and from a test report, not reproduced inside Obsidian.
- Obsidian froze for over ten seconds while typing exclusion patterns. The validator of the settings form ran `/(?:.*){2,}\?/` on every line at every keystroke; on a line without a question mark this backtracks exponentially (about 0.8 s at 20 characters, 2.7 s at 24, 43 s at 28, measured on the development machine). The check was removed. Its companion `/\|.*\|/` also rejected every pattern with two or more `|`, such as `^(a|b|c)/`, and was removed too.
- Typed-array views are copied by `byteOffset` and `byteLength` (`src/utils/buffer.ts`) instead of exposing the whole backing `ArrayBuffer` through `.buffer`. Affected: edit-history import/export (zip output and unzipped entries), compression worker, diff worker, timeline serializer, diff manager, version content repository.
- `compression.worker.ts` transferred a different buffer copy than the one it listed as transferable; it now transfers the copy it returns.
- Settings loading no longer destroys stored data. If `data.json` fails validation or cannot be read, it is first copied to `data.json.corrupt.<timestamp>` next to it and a notice names the copy. When only some values are invalid, the central manifest is kept if it is valid on its own, so notes stay linked to their history; the other settings fall back to defaults. Before, the defaults were saved over the file, the central manifest was lost and no copy was made. Not run inside Obsidian.
- Frontmatter, surgical key insertion and deletion: blank lines are no longer collapsed when a key is deleted, and trailing blank lines are no longer trimmed when a key is added or the file is rebuilt (they belong to the value of a last `|+` block scalar). Keys with spaces, accented letters or a leading digit are now recognized as existing, so they are not added twice, and keys that need quoting are written quoted. Locating the frontmatter block still depends on Obsidian and is not covered by tests.
- `mergeVersionHistorySettings` and `mergeEditHistorySettings` ignore keys whose value is `undefined` instead of erasing the stored value. `mergeGlobalSettings` was not changed.
- Delayed `focus()` calls in `useDelayedFocus` and `useEntryHighlight` use `preventScroll: true`.
- Type error in `persistence-service.ts` (`parseInt` over a possibly undefined regex group).

### Not verified
- The Save button of the exclusion lists has been type-checked and built but not run inside Obsidian. The tests cover the validator and its agreement with the path filter, not the component. The regression test for the freeze detects a return of the old check as a hang, not as a failed assertion, because the backtracking is synchronous.
- The folder-deletion fix and the removal of the deviation function have been type-checked, built and tested against an in-memory file system, but not run inside Obsidian. The regression test fails without the fix. The sharing of runs in `handleFileDelete` is not covered by any test.
- The trash has been type-checked, built and tested against an in-memory file system, but not run inside Obsidian.
- The automatic first edit has been type-checked and built but not run inside Obsidian.
- The save dialog has been type-checked and built but not run inside Obsidian. Only the function that decides which fields it shows is covered by a test.
- The typed-array copies in edit-history import/export could not be shown to matter: with fflate 0.8.2 under Node, the outputs of `zip` and `unzip` already own exact-size buffers, and `tests/edit-history-export-import.test.ts` passes with and without the copy. The copies remain as a defensive measure. They are not a confirmed cause of any upstream issue.
- The buffer fixes are a plausible cause of upstream issues #43, #44 and #50; none of these issues was reproduced.
- `preventScroll` is the probable remedy for upstream issue #51; not reproduced.

***

**Version: 1.9.44 (January 16, 2026)**

#### 🎨 Improvements & UX

* **UI Bug Fix:** Resolved a UI issue affecting obsidian mobile version 1.11 and above.

***

**Version: 1.9.43**

#### 🎨 Improvements & UX

* **General Stability:** Implemented stability improvements for a more reliable experience.


***

**Version: 1.9.41**

#### 🎨 Improvements & UX

* **General Stability:** Implemented stability improvements for a more reliable experience.

***

**Version: 1.9.40**

#### ✨ New Features

* **Permanent Data Cleanup:** Triggering the "clean-up orphaned version data" command now permanently deletes all version control data associated with notes that have already been deleted.
* **Automatic Data Removal:** Deleting any note while the plugin is active will now result in the permanent deletion of all stored version control data for that specific note.

#### 🎨 Improvements & UX

* **General Stability:** Implemented stability improvements for a more reliable experience.

***

**Version: 1.9.39**

#### ✨ New Features

* **Disk Persistence Toggle:** Added a new setting that allows you to enable or disable the disk persistence of your edit history of any branch.

#### 🎨 Improvements & UX

* **Stability Improvements:** Implemented various fixes to enhance the overall stability of the plugin.

***

**Version: 1.9.37**

#### ✨ New Features

* **Side-by-Side Diff View:** Added support for a side-by-side diff layout.
    * All existing diff modes—Smart, Character, Word, and Line—now support both unified and side-by-side views.

#### 🎨 Improvements & UX

* **UI/UX Polish:** Implemented significant enhancements to the timeline and settings panel for a better user experience.

***

**Version: 1.9.36**

#### ✨ New Features

* **Automatic Data Persistence:** Edit history now supports automatic synchronization across devices.
    * Previously, data was restricted to `indexedDB`, but it is now stored in `.vctrl` extension files, allowing for seamless syncing.
    * The process runs automatically in the background without requiring user intervention.
    * Edit history data is located at `.versiondb` (or your custom location) `/vc-id/branches/*`.
    
#### 🔍 Technical Note: Inspecting `.vctrl` Files

If you wish to manually inspect the version control files, you can follow these steps:
1. Change the file extension from `.vctrl` to `.zip` and extract it.
2. Inside, you will find a `manifest.json`, `data.json`, and a `blobs` folder.
3. In the `blobs` folder, change the `.bin` extensions to `.zip` and extract them to reveal extension-less files.
4. Add the `.md` extension to these files to make them readable.    

***

**Version: 1.9.35**

#### ✨ New Features

* **Dashboard Heatmap:** Introducing the new **Dashboard**! It features a heatmap that visualizes the number of versions/edits you've made per day. Access it by clicking the top-left corner button to open the dropdown menu and selecting **Dashboard**.
* **Zip and Gzip Export:** Added support for **zip** and **gzip** formats when exporting versions and edits.

#### 🎨 Improvements & UX

* **Edit History Stability:** The edit history feature has been stabilized and is now as robust and reliable as the version history. (Previously, it was noted as being in an early stage.)

#### ⚠️ Important Notice

* **Potential Data Inconsistency Fix:** This release includes necessary changes for future stability, which might result in **SOME data loss** for a small number of users. We deeply apologize for this inconvenience. This is crucial for addressing and removing existing inconsistencies that could have led to more significant data loss in the future.
* **Ignorable Errors:** You may safely **ignore all file rename errors** you encounter. These are non-critical, false positives caused by concurrent operations and do not affect the functionality or integrity of your data.

***

**Version: 1.9.34**

#### 🎨 Improvements & UX

* **General Stability:** Squashed many bugs for a more reliable experience.

***

**Version: 1.9.33**

#### ✨ New Features

* **Compression Feature:** Added an optional compression feature. When enabled, it ensures all version history files are compressed before being written to disk, which helps limit file size.
* **Manual Decompression Note:** If you want to use the version file without the plugin, you can change the version file's `.md` extension to `.gz`, extract the file, rename the extracted file by adding the `.md` extension, and then open it.

***

**Version: 1.9.32**

#### ✨ New Features

* **Edit History (Per Branch):** Introducing passive, automatic snapshots of every change you make.
    * There are now two types of history: **Version History** (for intentional, milestone saves) and **Edit History** (for granular, automatic changes).
    * Edit History conserves resources by saving only highly compressed diffs (like Git) between changes, while Version History continues to save the full content.
    * Currently, Edit History data is stored solely in IndexedDB (request a feature for disk storage).
    * **Switching Views:** Simply click on the "Version History" header text (at the top left corner of the version control view in the right sidebar) to toggle between "Version History" and "Edit History."

* **Early Stable Release:** This is an early stable release of the Edit History feature. While major problems are unlikely (i hope), minor inconsistencies are possible, please open an issue if you encounter any inconsistencies. Your feedback is highly valued!

***

**Version: 1.9.31**

#### 🐞 Bug Fixes

* Fixed: Failure to save version due to "potential xss attempt" 

***

**Version: 1.9.30**

#### 🐞 Bug Fixes

* Fixed a bug where the plugin was not working because of a Dexie version conflict with another plugin. Make sure to restart obsidian after updating this plugin.

***

**Version: 1.9.29**

#### ✨ New Features

* **Timeline:** You can now view all of the diffs in one panel, allowing you to see and search all of the changes in one place. Forgot in which version you had changed any text? Just search in the timeline.

***

**Version: 1.9.27**

#### 🎨 Improvements & UX

* **UI/UX Polish:** Implemented various UI/UX enhancements for a more better experience.

***

**Version: 1.9.26**

#### ✨ New Features

* **Diff Popup Window:** You can now view or open the diff in a separate popup window.

***

**Version: 1.9.25**

#### ✨ New Features

* **Smart Diff Mode:** Added a new diff mode for users working with very long documents, eliminating unnecessary scrolling to find changes.

#### 🎨 Improvements & UX

* **UI/UX Polish:** Implemented various UI/UX enhancements for a more better experience.

***

**Version: 1.9.24**

#### ✨ New Features

*   **Version Statistics:** You can now see detailed statistics for each version of your note directly on the version card.
    *   Enable Word, Character, and Line counts from the settings panel.
    *   For each statistic, you can choose whether to include or exclude Markdown syntax in the calculation, giving you precise control over the data you see.
    
***

**Version: 1.9.23**

#### ✨ New Features

*   **Descriptions** You can now add descriptions along side names for any version.

***

**Version: 1.9.22**

#### 🎨 Improvements & UX

*   **General Stability:** Squashed many bugs and implemented various UI/UX enhancements for a more reliable experience.

***

**Version: 1.9.21**

#### ✨ New Features

*   **Bases Support:** Added support for bases.

#### 🎨 Improvements & UX

*   **UI/UX Polish:** Improved various UI/UX elements for a better user experience.

***

**Version: 1.9.20**

#### ✨ New Features

*   **Search in Panels:** You can now search preview and diff contents directly in the preview and diff panels.

#### 🎨 Improvements & UX

*   **General Stability:** Squashed some bugs and improved UI/UX for a more reliable experience.

***

**Version: 1.9.18**

#### 🎨 Improvements & UX

*   **General Stability:** Squashed many bugs and implemented various UI/UX enhancements for a more reliable experience.

***

**Version: 1.9.17**

#### 🎨 Improvements & UX

*   **UI Polish:** Implemented various UI/UX enhancements for a smoother, modern, and more reliable experience.

***

**Version: 1.9.16**
#### ✨ New Features

*   **Note Branching:** You can now explore different ideas and writing paths within a single note without creating duplicates.
    *   Create, manage, and switch between different "branches" of a note's history directly from the Version Control view in the right sidebar.
    *   Click the branch name (e.g., `main`) to open a menu where you can select an existing branch or create a new one.
    *   Each branch saves its own content, cursor position, and history, allowing you to experiment freely without fear of messing up your primary version.
    *   This is a power-user feature. For regular use, you can continue working on the default `main` branch with no changes to your workflow.

*   **Customizable Frontmatter Key:** You can now change the frontmatter key used to store the version control ID (previously hardcoded as `vc-id`) via the plugin settings. This provides greater flexibility and avoids conflicts with other plugins.

#### 🎨 Improvements & UX

*   **General Stability and UI Polish:** Squashed numerous bugs and implemented various UI/UX enhancements for a smoother and more reliable experience.

***

**Version: 1.9.15**
#### ✨ New Features

*   **Advanced Diffing Modes:** You can now choose how to visualize the differences between two versions of a note. In addition to the standard line-by-line comparison, you can now select:
    *   **Word Diff:** Highlights individual words that have been added or removed within a line.
    *   **Character Diff:** Provides the most granular view, showing individual character changes.
    *   **JSON Diff:** Intelligently compares changes within JSON-formatted text.

*   **Automatic Update Notifications:** Never miss an update again! When the plugin is updated, a changelog panel will now automatically appear, informing you of all the new features, improvements, and bug fixes.

#### 🎨 Improvements & UX

*   **On-the-Fly Diff Switching:** A new dropdown menu has been added to the header of the diff view (both in the side panel and in a new tab). Click the new icon (`git-commit-horizontal`) to instantly switch between Line, Word, Character, and JSON diff modes.
*   **Unified Diff View:** The new Word, Character, and JSON diff modes are displayed in a unified format, highlighting changes inline for a more intuitive and readable comparison, similar to the style used on platforms like GitHub.
*   **Quick Access to Changelog:** You can now view the latest changelog at any time directly from the plugin's settings panel by clicking the new "View Changelog" button.
*   **Easier Feedback & Bug Reporting:** A new "Report Issue" button has been added to the settings panel. This will take you directly to the plugin's GitHub page, making it faster and easier to report bugs or request new features.

***
