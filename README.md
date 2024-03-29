# quickshort
A shortener made for hand-typed URLs, from flyers and handouts for human subjects studies. Small, simple, does not require a database — shortened URLs and logs are stored in text files. Requires python 3.7 or higher.

Removes any non-alphanumeric characters from incoming URLs, and changes everything to lower case. Merges URL parameters — see Examples below.

For logging, quickshort stores hit counts both as a single number and individual entries. Hit counts and logs can optionally be given HTTP endpoints.

A demo of this project is [available on Glitch](https://glitch.com/edit/#!/quickshort-demo).

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
1. Optionally export `HITCOUNT_PATH` and `LOG_PATH`
1. If you want to serve hit counts and logs over HTTP, export SERVE_LOGS
1. Create a file in `$REDIRECTS_PATH` named with the redirection key you want. Only lowercase letters and numbers are allowed.
1. In that file, put the target URL
1. Start the flask server, it will create `$REDIRECTS_PATH/hits`
1. Any hits to that server will look in `$REDIRECTS_PATH/<normalized_path>` and redirect to the new destination
1. In production, do whatever you need to to get it running all nice
1. Set the GUNICORN_LOGGING environment variable to use gunicorn's logging settings
