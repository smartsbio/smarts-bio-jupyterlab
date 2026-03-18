from ._version import __version__


def _jupyter_labextension_paths():
    return [{"src": "labextension", "dest": "@smartsbio/jupyterlab-extension"}]


def _jupyter_server_extension_points():
    return [{"module": "smarts_bio_jupyterlab"}]


def _load_jupyter_server_extension(server_app):
    """Load the optional server extension (secure token storage proxy)."""
    from .handlers import setup_handlers
    setup_handlers(server_app.web_app)
    server_app.log.info("[smarts.bio] Server extension loaded")
