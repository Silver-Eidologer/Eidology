# Exclusion patterns (path filters)

Version Settings and Edit Settings each have a list of exclusion patterns, one regular expression per line. They apply to automatic tracking of notes ("Automatically track new notes"): a note whose path matches any pattern is not tracked automatically. Notes that are already tracked are not affected.

## Syntax

- One regular expression per line. Blank lines are ignored.
- Case-sensitive. The expression is tested against the vault-relative path, for example `Meta/Templates/Note.md`.
- Anchoring is the user's choice: `^Meta/` matches paths that start with `Meta/`; `Meta/` alone matches anywhere in the path.
- A line may have at most 500 characters.
- The list is saved with the Save button. The button is enabled only when every line is valid and the text differs from the saved list.

## Constructs that are not supported

The path filter never compiles a pattern that contains one of these, so such a pattern would never exclude anything. The settings form rejects them and names the line:

- lookahead `(?=...)`;
- negative lookahead that contains `*`, as in `(?!...*...)`;
- two or more consecutive `*` (this includes `\**`, an escaped asterisk followed by a quantifier);
- repeated non-capturing groups `(?:...){2,}`;
- Unicode property escapes `\p{...}`.

The form accepts a line exactly when the path filter compiles it (`findPatternProblem` calls the same `validatePattern` as the filter). Alternations with any number of `|` are accepted.

## No guard against catastrophic patterns at runtime

The list above is a short blacklist of text shapes. It is not a guard against patterns that take exponential time. A pattern with nested quantifiers, such as `^(a+)+$` or `(\w+)+/`, is accepted and runs on the main thread each time a path is checked. Against a path that does not match, such a pattern can freeze Obsidian for seconds. In a measurement on the development machine, `^(a+)+$` took about 1.9 s against a 27-character path and about 4.8 s against a 31-character path.

The plugin does not detect this case. Avoid nested quantifiers over the same characters, and prefer anchored literal prefixes such as `^Meta/`.

The settings form itself no longer runs any check that can backtrack. An earlier check of that kind made the form unresponsive while typing (see `CHANGELOG.md`).

## Behavior that is not changed

These rules belong to the path filter and apply before any pattern is tested. A note that fails them is not tracked automatically, with no message in the interface:

- A path longer than 260 characters is rejected.
- A folder or file name equal to `con`, `prn`, `aux`, `nul`, `com1` to `com9` or `lpt1` to `lpt9`, in any letter case, is rejected, as are `.`, `..` and `...`.
- A path containing `../`, `..\`, a null character or a similar traversal sequence is rejected. This includes a name that ends in `..` followed by a slash.
- If every pattern in the list is unusable (for example, a list edited by hand in `data.json`), the filter allows all notes. If an unexpected error occurs while testing, it blocks the note. The settings form prevents unusable patterns from being saved.
