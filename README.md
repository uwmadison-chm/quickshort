# quickshort
A very(!) small Flask-based URL shortener. Biased towards making small-ish numbers of forgiving-to-type URLs.

Strongly normalizes incoming requests. Passes URL parameters on to the destination. Stores redirects and hit counts in the filesystem — does not rely on a SQL database.

Requires python 3.7.

The idea here: For incoming requests:
1. Separate the request path and query.
1. Put the query in its own dictionary
1. Normalize the path by downcasing and stripping all non-alphanumeric characters
1. Look in `rewrites` for a file matching the normalized path
1. Read that file. The first line is the redirect path. The second line is the hit count.
1. Increment hit count, write the file.
1. Merge query params with the redirect path's redirect params (redirect's params win every time), generate destination URL
1. Send a 301 to the redirect

## Examples

/foo-bar
/Foo_Bar
/FOOBAR

will all look for a redirection file called `foobar`. If `foobar` contains https://example.com?a=b, then:

/foo-bar?a=c&d=e

will redirect to
https://example.com?a=b&d=e

## Running

1. Clone this
1. `pip install -r requirements.txt`
1. `export REDIRECTS_PATH=<somewhere you control>`
1. Create a file in `$REDIRECTS_PATH` with the redirection key you want. Only lowercase letters and numbers are allowed.
1. In that file, put the location you want to redirect to
1. Start the flask server, it will create `$REDIRECTS_PATH/hits`
1. Any hits to that server will look in `$REDIRECTS_PATH/<normalized_path>` and redirect to the new destination
