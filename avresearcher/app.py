from flask import Flask
from elasticsearch import Elasticsearch

from .views import views
from .models import User
from .extensions import mail, db, bcrypt, login_manager


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

    db.init_app(app)
    bcrypt.init_app(app)
    mail.init_app(app)

    @login_manager.user_loader
    def load_user(user_id):
        """ Callback for reloading a user from the session. None is returned
        if the user does not exist."""

        return db.session.query(User).get(int(user_id))

    login_manager.setup_app(app)

    app.es_search = Elasticsearch([
        {'host': app.config['ES_SEARCH_HOST'], 'port': app.config['ES_SEARCH_PORT']}
    ])
    app.es_log = Elasticsearch([
        {'host': app.config['ES_LOG_HOST'], 'port':  app.config['ES_LOG_PORT']}
    ])

    for bp in DEFAULT_BLUEPRINTS:
        app.register_blueprint(bp)

    return app
