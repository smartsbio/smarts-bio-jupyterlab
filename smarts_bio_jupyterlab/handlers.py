"""Optional server-side token storage for secure JupyterHub deployments.

In personal/local JupyterLab, tokens are stored in localStorage (fine for
single-user use). In shared JupyterHub environments, this server extension
provides /smarts-bio/token endpoints backed by the JupyterHub user's server
session, keeping tokens off the browser entirely.
"""
import json
from jupyter_server.base.handlers import APIHandler
from jupyter_server.utils import url_path_join
import tornado

# In-memory store per server session (process-scoped, single user).
# For JupyterHub, replace with a persistent store keyed by the hub user.
_token_store: dict[str, str] = {}


class TokenHandler(APIHandler):
    """GET /smarts-bio/token?key=<key>  →  {"value": "..."}
    PUT /smarts-bio/token              ←  {"key": "...", "value": "..."}
    DELETE /smarts-bio/token?key=<key>
    """

    @tornado.web.authenticated
    def get(self):
        key = self.get_argument("key")
        value = _token_store.get(key, "")
        self.finish(json.dumps({"value": value}))

    @tornado.web.authenticated
    def put(self):
        body = json.loads(self.request.body)
        key = body.get("key", "")
        value = body.get("value", "")
        if key:
            _token_store[key] = value
        self.finish(json.dumps({"ok": True}))

    @tornado.web.authenticated
    def delete(self):
        key = self.get_argument("key")
        _token_store.pop(key, None)
        self.finish(json.dumps({"ok": True}))


def setup_handlers(web_app):
    host_pattern = ".*$"
    base_url = web_app.settings["base_url"]
    route_pattern = url_path_join(base_url, "smarts-bio", "token")
    web_app.add_handlers(host_pattern, [(route_pattern, TokenHandler)])
