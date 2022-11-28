# Copyright (c) 2022 Board of Regents of the University of Wisconsin System

import os
import re
import pathlib
from datetime import datetime
from urllib import parse

from flask import Flask, request, abort, redirect, Response

app = Flask(__name__)

REDIRECTS_PATH = pathlib.Path(os.environ['REDIRECTS_PATH'])
HITCOUNT_PATH = pathlib.Path(
    os.environ.get('HITCOUNT_PATH', REDIRECTS_PATH / '_hits'))
LOG_PATH = pathlib.Path(
    os.environ.get('LOG_PATH', REDIRECTS_PATH / '_log'))
MISS_NORMPATH = '_404'
IGNORE_PATHS = {
    'favicon.ico',
    'robots.txt'
}

os.makedirs(HITCOUNT_PATH, exist_ok=True)
os.makedirs(LOG_PATH, exist_ok=True)

NORMALIZER = re.compile(r'[^a-z0-9]', re.IGNORECASE)


if os.environ.get('GUNICORN_LOGGING'):
    import logging
    gunicorn_logger = logging.getLogger('gunicorn.error')
    app.logger.handlers = gunicorn_logger.handlers
    app.logger.setLevel(gunicorn_logger.level)


# app.logger.debug("Starting up")
# app.logger.debug(f"redirects: {REDIRECTS_PATH}")
# app.logger.debug(f"hits: {HITCOUNT_PATH}")
# app.logger.debug(f"logs: {LOG_PATH}")

@app.route("/<path:path>")
def normalize_and_redirect(path):
    """
    This is the only route for the whole app -- all we do is redirect.
    Takes an incoming URL,
    """
    app.logger.info(f'Redirecting for {path}')
    normed = normalize_path(path)
    if path in IGNORE_PATHS:
        app.logger.debug(f'Ignoring {path} without logging')
        abort(404)
    try:
        dest_url = hit_redirect(normed)
    except IOError as e:
        log_404(e)
        abort(404)
    return redirect(dest_url, code=302)


@app.route("/<path:path>/hits")
def serve_hits(path):
    app.logger.debug(f'Getting hits for {path}')
    normed = normalize_path(path)
    hits_file = hits_file_for(normed)
    if (hits_file.exists() and hits_file.is_file()):
        return Response(hits_file.read_text(), mimetype='text/plain')
    abort(404) 


@app.route("/<path:path>/log")
def serve_log(path):
    app.logger.debug(f'Getting log for {path}')
    normed = normalize_path(path)
    log_file = log_file_for(normed)
    if (log_file.exists() and log_file.is_file()):
        return Response(log_file.read_text(), mimetype='text/plain')
    abort(404) 
    
    
def normalize_path(path):
    """
    Strip non-alphanumeric characters from path and downcase it.
    """
    stripped = NORMALIZER.sub('', path)
    downed = stripped.lower()
    return downed


def merge_url_params(redir_url):
    """
    Merge the URL params of our incoming URL with the ones in our saved URL
    If there is a conflict, the ones in our saved URL always win.
    """
    redir_parsed = parse.urlsplit(redir_url)
    file_redir_params = parse.parse_qs(redir_parsed.query)
    file_redir_params = {k: ' '.join(v) for k, v in file_redir_params.items()}
    merged_params = {**request.args, **file_redir_params}
    query_string = parse.urlencode(merged_params)
    dest_split = parse.SplitResult(*redir_parsed[0:3], query_string, '')
    return dest_split.geturl()


def update_hit_count(normalized_path):
    """
    Increments the count in HITCOUNT_PATH/normalized_path
    Creates a file and initializes it to 0 if none exists
    """
    hits_file = hits_file_for(normalized_path)
    hit_count = 0
    try:
        with open(hits_file, 'r') as hf:
            hit_count = int(hf.read().strip())
    except (IOError, ValueError):
        app.logger.debug(f'Could not read {hits_file}, hit_count = 0')
    hit_count += 1
    app.logger.debug(f'Hit count is now {hit_count}')
    try:
        with open(hits_file, 'w') as hf:
            hf.write(str(hit_count)+'\n')
    except IOError as e:
        app.logger.error(f'Could not write {hits_file}: {e}')


def hits_file_for(normed_path):
    return HITCOUNT_PATH / normed_path


def log_file_for(normed_path):
    return LOG_PATH / f'{normed_path}.log'


def log_404(exception):
    """
    Log a hit to LOG_PATH/_404.log
    """
    app.logger.debug(f'Cannot find redirect: {exception}, returning 404')
    log_redirection(MISS_NORMPATH)


def log_redirection(normalized_path):
    """
    Log a hit to LOG_PATH/normalized_path.log
    Log entries are one hit per line, with isotime and incoming path
    separated by \t
    """
    log_file = log_file_for(normalized_path)
    hit_time = datetime.utcnow().isoformat()
    try:
        with open(log_file, 'a') as f:
            f.write(
                '\t'.join([
                    hit_time,
                    request.url,
                    request.headers.get('HTTP_REFERER', '')]) + '\n'
            )
    except IOError as e:
        app.logger.error(f'Could not write {log_file}: {e}')
    update_hit_count(normalized_path)


def hit_redirect(normalized_path):
    """
    Find the target of our redirection, log it, and return it.
    """
    redir_file = REDIRECTS_PATH / normalized_path
    redir_url = ''
    app.logger.debug(f'Trying to read {redir_file}')
    with open(redir_file, 'r') as rf:
        redir_url = rf.read().strip()
    app.logger.debug(f'Read redirect URL: {repr(redir_url)}')
    log_redirection(normalized_path)
    return merge_url_params(redir_url)
