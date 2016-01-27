from flask import Flask
from elasticsearch import Elasticsearch

from .views import views
from .models import User
from .extensions import mail, db, bcrypt, sentry, login_manager


__all__ = ['create_app']


DEFAULT_BLUEPRINTS = (
    views,
)


def create_app(package_name='avresearcher', settings_override=None):
    """Returns a :class:`Flask` application instance configured with
    project-wide functionality.

    :param package_name: application package name.
    :param package_path: application package path.
    :param settings_override: a dictionary of settings to override.
    """
    app = Flask(package_name, instance_relative_config=True)

    app.config.from_object('avresearcher.settings')
    app.config.from_object(settings_override)
    _validate(app.config)

    if app.config['DEBUG'] and app.config['SENTRY_DSN']:
        sentry.init_app(app)

    db.init_app(app)
    bcrypt.init_app(app)
    mail.init_app(app)

    @login_manager.user_loader
    def load_user(user_id):
        """ Callback for reloading a user from the session. None is returned
        if the user does not exist."""

        return db.session.query(User).get(int(user_id))

    login_manager.setup_app(app)

    app.es_search, app.es_log = _check_es_config(app.config)

    for bp in DEFAULT_BLUEPRINTS:
        app.register_blueprint(bp)

    return app


def _check_es_config(config):
    # Check whether we have ES_SEARCH_CONFIG and ES_LOG_CONFIG;
    # if not, set them from the deprecated ES_{SEARCH,LOG}_{HOST,PORT}
    # settings;
    # if successful, return Elasticsearch instances.

    for estype in ["SEARCH", "LOG"]:
        es_config = "ES_%s_CONFIG" % estype
        if es_config not in config:
            host = "ES_%s_HOST" % estype
            port = "ES_%s_PORT" % estype
            if host not in config or port not in config:
                raise ValueError("need either %s setting or %s and %s"
                                 % (es_config, host, port))

            config[es_config] = {
                "hosts": [config[host]],
                "port": config[port],
            }

    es_log = None
    es_log_config = config["ES_LOG_CONFIG"]
    if es_log_config is not None:
        es_log = Elasticsearch(es_log_config)
    return Elasticsearch(**config["ES_SEARCH_CONFIG"]), es_log


def _validate(config):
    # Settings validation: should catch common settings.py/local_settings.py
    # mistakes. Add rules as needed.

    collections_config = config['COLLECTIONS_CONFIG']
    for coll in config['ENABLED_COLLECTIONS']:
        if coll not in collections_config:
            raise ValueError("collection %r enabled, but not configured"
                             " in COLLECTIONS_CONFIG" % (coll))

    for index, settings in collections_config.iteritems():
        index_name = settings.get('index_name')
        if not isinstance(index_name, basestring):
            raise TypeError("not a valid index_name for index %r: %r of %r"
                            % (index, index_name, type(index_name)))

        aggregations = settings.get('available_aggregations', [])
        for facet in settings.get('enabled_facets', []):
            if facet not in aggregations:
                raise ValueError("facet %r not among available_aggregations=%r"
                                 " for index %r"
                                 % (facet, list(aggregations.keys()), index))

        avail_fields = settings['available_search_fields']
        for field in settings['enabled_search_fields']:
            if field not in avail_fields:
                raise ValueError("search field %r not among"
                                 " available_search_fields=%r for index %r"
                                 % (field, list(avail_fields), index))
