import os
import re
import pathlib
from urllib import parse

from flask import Flask, request, abort, redirect

app = Flask(__name__)

NORMALIZER = re.compile(r'[^a-z0-9]')
REDIR_PATH = pathlib.Path(os.environ['REDIRECTS_PATH'])
HITS_PATH = REDIR_PATH / 'hits'
os.makedirs(HITS_PATH, exist_ok=True)

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
    redir_file = REDIR_PATH / normalized_path
    hits_file = HITS_PATH / normalized_path
    with open(redir_file, 'r') as rf:
        lines = [l.strip() for l in rf.readlines()]
    redir_url = lines[0]
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
        app.logger.error(f'Could not write {hits_file}: {e.message}')
    return merge_url_params(redir_url)


@app.route("/<path:path>")
def normalize_and_redirect(path):
    normed = normalize_path(path)
    try:
        dest_url = hit_redirect(normed)
    except IOError:
        abort(404)
    return redirect(dest_url, code=301)
