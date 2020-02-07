# quickshort
A very(!) small Flask-based URL shortener. Biased towards making small-ish numbers of forgiving-to-type URLs.

Strongly normalizes incoming requests. Passes URL parameters on to the destination. Stores redirects and hit counts in the filesystem — does not rely on a SQL database.

The idea here: For incoming requests:
1. Separate the request path and query.
1. Put the query in its own dictionary
1. Normalize the path by downcasing and stripping all non-alphanumeric characters
1. Look in `rewrites` for a file matching the normalized path
1. Read that file. The first line is the redirect path. The second line is the hit count.
1. Increment hit count, write the file.
1. Merge query params with the redirect path's redirect params (redirect's params win every time), generate destination URL
1. Send a 301
