from flask.ext.sqlalchemy import SQLAlchemy
db = SQLAlchemy()

from flask.ext.mail import Mail
mail = Mail()

from flask.ext.login import LoginManager
login_manager = LoginManager()

from flask.ext.bcrypt import Bcrypt
bcrypt = Bcrypt()
