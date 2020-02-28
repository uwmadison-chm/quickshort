# quickshort
A very(!) small Flask-based URL shortener. Biased towards making small-ish numbers of forgiving-to-type URLs, from flyers and handouts for human subjects studies.

Removes any non-alphanumeric characters from incoming URLs, and changes everything to lower case. Passes URL parameters on to the destination. Stores redirects and hit counts in the filesystem — does not rely on a SQL database.

Requires python 3.7.

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
1. Create a file in `$REDIRECTS_PATH` named with the redirection key you want. Only lowercase letters and numbers are allowed.
1. In that file, put the target URL
1. Start the flask server, it will create `$REDIRECTS_PATH/hits`
1. Any hits to that server will look in `$REDIRECTS_PATH/<normalized_path>` and redirect to the new destination
