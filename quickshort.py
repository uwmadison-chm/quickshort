# Copyright (c) 2020 Board of Regents of the University of Wisconsin System

import os
import re
import pathlib
from urllib import parse

from flask import Flask, request, abort, redirect

app = Flask(__name__)

REDIRECTS_PATH = pathlib.Path(os.environ['REDIRECTS_PATH'])
HITS_PATH = REDIRECTS_PATH / '_hits'
os.makedirs(HITS_PATH, exist_ok=True)

NORMALIZER = re.compile(r'[^a-z0-9]')


if os.environ.get('GUNICORN_LOGGING'):
    gunicorn_logger = logging.getLogger('gunicorn.error')
    app.logger.handlers = gunicorn_logger.handlers
    app.logger.setLevel(gunicorn_logger.level)


def normalize_path(path):
    stripped = NORMALIZER.sub('', path)
    downed = stripped.lower()
    return downed


def merge_url_params(redir_url):
    redir_parsed = parse.urlsplit(redir_url)
    file_redir_params = parse.parse_qs(redir_parsed.query)
    file_redir_params = {k: ' '.join(v) for k, v in file_redir_params.items()}
    merged_params = {**request.args, **file_redir_params}
    query_string = parse.urlencode(merged_params)
    dest_split = parse.SplitResult(*redir_parsed[0:3], query_string, '')
    return dest_split.geturl()


def hit_redirect(normalized_path):
    redir_file = REDIRECTS_PATH / normalized_path
    hits_file = HITS_PATH / normalized_path
    redir_url = ''
    app.logger.debug(f'Trying to read {redir_file}')
    with open(redir_file, 'r') as rf:
        redir_url = rf.read().strip()
    app.logger.debug(f'Read redirect URL: {repr(redir_url)}')
    hit_count = 0
    try:
        with open(hits_file, 'r') as hf:
            hit_count = int(hf.read().strip())
    except (IOError, ValueError):
        app.logger.info(f'Could not read {hits_file}, hit_count = 0')
    hit_count += 1
    try:
        with open(hits_file, 'w') as hf:
            hf.write(str(hit_count))
    except IOError as e:
        app.logger.error(f'Could not write {hits_file}: {e}')
    return merge_url_params(redir_url)


@app.route("/<path:path>")
def normalize_and_redirect(path):
    app.logger.debug(f'Redirecting for {path}')
    normed = normalize_path(path)
    try:
        dest_url = hit_redirect(normed)
    except IOError as e:
        app.logger.info(f'Reading redirect failed: {e}; returning 404')
        abort(404)
    app.logger.info(f'{request.url} -> {dest_url}')
    return redirect(dest_url.strip(), code=301)
