One file per redirect, same format as the Flask app's `REDIRECTS_PATH`: the file name is the key (lowercase letters and digits only) and the contents are the target URL. `npm run redirects` compiles this directory into `src/redirects.generated.ts` and fails on invalid keys or URLs. Files starting with `.` or `_` and `*.md` files are ignored.

`example` is a placeholder; replace it with real redirects, or point the build at another directory with `REDIRECTS_DIR`.
