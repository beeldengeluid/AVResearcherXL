AVResearcherXL
==============

AVResearcherXL is a tool based on `AVResearcher <https://github.com/beeldengeluid/audiovisual-researcher>`_, a prototype aimed at allowing media researchers to explore metadata associated with large numbers of audiovisual broadcasts. AVResearcher allows them to compare and contrast the characteristics of search results for two topics, across time and in terms of content. Broadcasts can be searched and compared not only on the basis of traditional catalog descriptions, but also in terms of spoken content (subtitles), and social chatter (tweets associated with broadcasts). AVResearcher is a new and ongoing valorisation project at the Netherlands Institute for Sound and Vision. `more details <http://ceur-ws.org/Vol-986/paper_27.pdf>`_

 In addition to the exploration of audiovisual broadcasts, AVResearcherXL allows users to search and compare different document collections. AVResearcherXL also implements a new design, the option to show relative counts on its timeline visualisation and multiple views on result sets.

AVResearcherXL is developed by `Dispectu B.V. <http://dispectu.com>`_.

Requirements
------------

- Python 2.7

  - pip
  - virtualenv

- Elasticsearch > 1.1

- Relational database (e.g. SQLite, MySQL or PostgreSQL)
- A webserver with WSGI or proxy capabilities

Installing AVResearcherXL
-------------------------

1. Clone the repository:

.. code-block:: bash

  $ git clone git@github.com:beeldengeluid/AVResearcherXL.git
  $ cd AVResearcherXL

2. Create a virtualenv, activate it and install the required Python packages:

.. code-block:: bash

  $ virtualenv ~/my_pyenvs/avresearcherxl
  $ source ~/my_pyenvs/avresearcherxl/bin/activate
  $ pip install -r requirements.txt

3. Create a local settings file to override the default settings specified in ``settings.py``. In the next steps we describe to minimal settings that should be changed to get the application up-and-running. Please have a look at the comments in ``settings.py`` to get an overview of all possible settings.

.. code-block:: bash

  $ vim local_settings.py

4. When running the application in a production environment, set ``DEBUG`` to ``False``

5. Set the ``SECRET_KEY`` for the installation (this key is used to sign cookies). A good random key can be generated as follows:

.. code-block:: pycon

  >>> import os
  >>> os.urandom(24)
  '\x86\xb8f\xcc\xbf\xd6f\x96\xf0\x08v\x90\xed\xad\x07\xfa\x01\xd0\\L#\x95\xf6\xdd'

6. Set the URLs and names of the ElasticSearch indexes:

.. code-block:: pycon

  ES_SEARCH_HOST = 'localhost'
  ES_SEARCH_PORT = 9200
  ES_LOG_HOST = ES_SEARCH_HOST
  ES_LOG_PORT = ES_SEARCH_PORT
  ES_LOG_INDEX = 'avresearcher_logs'

7. Set the options of the indexed collections (``COLLECTIONS_CONFIGzz).

8. Provide the settings of the SMTP server that should be used to send notification emails during registration:

.. code-block:: pycon

  MAIL_SERVER = 'localhost'
  MAIL_PORT = 25
  MAIL_USE_TLS = False
  MAIL_USE_SSL = False
  MAIL_USERNAME = None
  MAIL_PASSWORD = None

9. Provide the URI of the database. The SQLAlchemy documentation provides information on how to `structure the URI <http://docs.sqlalchemy.org/en/rel_0_8/core/engines.html#database-urls>`_ for different databases. To use an SQLite database named ``avresearcher.db`` set ``DATABASE_URI`` to ``sqlite:///avresearcher.db``.

10. Load the schema in the database configured in the previous step.

.. code-block:: bash

  ./manage.py init_db

11. Use a built-in WSGI server (like uWSGI) or a standalone WSGI container (like Gunicorn) to run the Flask application. Make sure to serve static assets directly through the webserver.

.. code-block:: bash

   $ pip install gunicorn
   $ gunicorn --bind 0.0.0.0 -w 4 wsgi:app


Running the text analysis tasks
-------------------------------

The package contains several text analysis tasks to generate the terms used in the 'descriptive terms' facet. Make sure that the collection you wish to use  is fully indexed in Elasticsearch before running the analysis tasks.

1. Install the required packages:

.. code-block:: bash

  $ pip install -r requirements-text-analysis.txt

2. Tokenize the source text by starting a producer that grabs the text and one or more consumers that perform the actual tokenization and lemmatization:

.. code-block:: bash

  $ ./manage.py analyze_text tokenize producer "immix_source/*.json" immix_summaries
  $ ./manage.py analyze_text tokenize consumer "immix_analyzed/summaries" immix_summaries

3. Create a (Gensim) dictionary of the tokenized text:

.. code-block:: bash

  $ ./manage.py analyze_text create_dictionary "immix_analyzed/summaries/*/*.txt" "gensim_data/immix_summaries.dict"

4. Optionally prune the dictionary

.. code-block:: bash

  $ ./manage.py analyze_text prune_dictionary gensim_data/immix_summaries.dict gensim_data/immix_summaries_pruned.dict --no_below 10 --no_above .10

5. Construct the corpus in the Matrix Market format:

.. code-block:: bash

  $ ./manage.py analyze_text construct_corpus "immix_analyzed/summaries/*.tar.gz" gensim_data/immix_summaries_pruned.dict gensim_data/immix_summaries.mm

6. Construct the TF-IDF model

.. code-block:: bash

  $ ./manage.py construct_tfidf_model gensim_data/immix_summaries.mm gensim_data/immix_summaries.tfidf_model

7. Add the topN 'most descriptive' terms to each indexed document:

.. code-block:: bash

  $ ./manage.py analyze_text index_descriptive_terms "immix_analyzed/summaries/*.tar.gz"  gensim_data/immix_summaries_pruned.dict gensim_data/immix_summaries.tfidf_model gensim_data/immix_summaries.tfidf_model 'quamerdes_immix_20140920' 'text_descriptive_terms' 10

License
-------

Copyright 2014 Dispectu B.V.
Parts copyright 2015 Netherlands eScience Center.

AVResearcherXL is distributed under the terms of the Apache 2.0 License
(see the file ``LICENSE``).
