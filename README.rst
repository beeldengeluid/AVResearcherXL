QuaMERDES
============

QuaMERDES is a tool based on `AVResearcher <https://github.com/beeldengeluid/audiovisual-researcher>`_.

QuaMERDES is developed by `Dispectu <http://dispectu.com>`_.

Requirements
------------

- Python 2.7

  - pip
  - virtualenv

- Elasticsearch 1.1

- Relational database (e.g. SQLite, MySQL or PostgreSQL)
- A webserver with WSGI or proxy capabilities

Installation
------------

1. Clone the repository:

.. code-block:: bash

  $ git clone git@git.dispectu.com/dispectu/quamerdes.git
  $ cd quamerdes

2. Create a virtualenv, activate it and install the required Python packages:

.. code-block:: bash

  $ virtualenv ~/my_pyenvs/quamerdes
  $ source ~/my_pyenvs/quamerdes/bin/activate
  $ pip install -r requirements.txt

3. Create a local settings file to override the default settings specified in ``settings.py``. In the next steps we describe to miminal number of settings that should be changed to get the application up-and-running. Please have a look at the comments in ``settings.py`` to get an overview of all possible settings.

.. code-block:: bash

  $ vim local_settings.py

4. When running the appliction in a production enviroment, set ``DEBUG`` to ``False``

5. Set the ``SECRET_KEY`` for the installation (this key is used to sign cookies). A good random key can be generated as follows:

.. code-block:: pycon

  >>> import os
  >>> os.urandom(24)
  '\x86\xb8f\xcc\xbf\xd6f\x96\xf0\x08v\x90\xed\xad\x07\xfa\x01\xd0\\L#\x95\xf6\xdd'

6. Set the URLs and names of the ElasticSearch indexes:

.. code-block:: pycon


  ES_SEARCH_HOST = 'localhost'
  ES_SEARCH_PORT = 9200
  ES_SEARCH_URL_PREFIX = ''
  ES_SEARCH_INDEX = 'avresearcher'
  ES_LOG_HOST = ES_SEARCH_HOST
  ES_LOG_PORT = ES_SEARCH_PORT
  ES_LOG_URL_PREFIX = ES_SEARCH_URL_PREFIX
  ES_LOG_INDEX = 'avresearcher_logs'

7. Provide the settings of the SMTP that should be used to send notification emails during registration:

.. code-block:: pycon

  MAIL_SERVER = 'localhost'
  MAIL_PORT = 25
  MAIL_USE_TLS = False
  MAIL_USE_SSL = False
  MAIL_USERNAME = None
  MAIL_PASSWORD = None

8. Provide the URI of the database. The SQLAlchemy documentation provides information on how to `structure the URI <http://docs.sqlalchemy.org/en/rel_0_8/core/engines.html#database-urls>`_ for different databases. To use an SQLite database named ``avresearcher.db`` set ``DATABASE_URI`` to ``sqlite:///avresearcher.db``.

9. Load the schema in the database configured in the previous step.

.. code-block:: pycon

  >>> from app import models
  >>> models.db.create_all()

10. Use a build-in WSGI server (like uWSGI) or a standalone WSGI container (like Gunicorn) to run the Flask application. Make sure to serve static assets directly through the webserver.

.. code-block:: bash

   $ pip install gunicorn
   $ gunicorn --bind 0.0.0.0 -w 4 quamerdes:app


License
=======

Copyright 2014 Dispectu
