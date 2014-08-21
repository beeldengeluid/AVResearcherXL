DEBUG = False

SECRET_KEY = ''

# URL of the ElasticSearch instance that contains the AVResearcher
# broadcasts index
ES_SEARCH_HOST = 'localhost'
ES_SEARCH_PORT = 9200
ES_SEARCH_URL_PREFIX = ''

ES_SEARCH_INDEX = 'avresearcher'

# URL of the ElasticSearch instance used to store usage logs (clicks,
# queries, etc.)
ES_LOG_HOST = ES_SEARCH_HOST
ES_LOG_PORT = ES_SEARCH_PORT
ES_LOG_URL_PREFIX = ES_SEARCH_URL_PREFIX
ES_LOG_INDEX = 'avresearcher_logs'

# User database URI
SQLALCHEMY_DATABASE_URI = 'mysql://user:pass@host/db'

# Email settings (used for account activation and user approval)
MAIL_SERVER = 'localhost'
MAIL_PORT = 25
MAIL_USE_TLS = False
MAIL_USE_SSL = False
MAIL_USERNAME = None
MAIL_PASSWORD = None

MAIL_DEFAULT_SENDER = ('AVResearcher', 'no-reply@avresearcher.org')
MAIL_REGISTRATION_SUBJECT = 'Thanks for creating an AVResearcher account'
MAIL_ACCOUNT_APPROVAL_ADDRESS = ''


# Human-readable messages send by the API
MESSAGES = {
    'missing_name': 'Please enter your name',
    'missing_email': 'Please enter an email address',
    'invalid_email': 'The email address you entered seems te be invalid',
    'missing_password': 'Please enter your password',
    'account_already_exists': 'There already exists an account with this email'
                              ' address',
    'email_verification_subject': 'Thanks for creating an AVResearcher account',
    'email_verification_body': 'Dear %s,\n\nThank you for creating an '
                               'AVResearcher account.\n\nTo verify your email '
                               'address, please click the following link:'
                               ' %s. After verification, a member of the '
                               'AVResearcher team will grant you access to the'
                               ' AVResearcher application. You will be notified'
                               ' by email as soon as your account is approved.'
                               '\n\nRegards,\nThe AVResearcher team',
    'email_approval_subject': '[AVResearcher] New user registration',
    'email_approval_body': 'The following user registered a new AVResearcher '
                           'account:\n\nName: %s\nOrganization: %s\nEmail '
                           'address: %s\n\nClick the following link to approve '
                           'this registration and grant the user access to the '
                           'application: %s',
    'email_approved_subject': 'Your AVResearcher account is approved',
    'email_approved_body': 'Dear %s,\n\nYour AVResearcher account is approved '
                           'and activated.\n\nTo start using the AVResearcher '
                           'visit: %s\n\nRegards,\nThe AVResearcher team',
    'invalid_email_or_password': 'Incorrect email or password',
    'email_not_verified': 'You did not yet verifiy your email address. Please '
                          'click the link in the email you recieved.',
    'account_not_approved': 'Your account first needs to be approved by a '
                            'member of the AVResearcher team. You will recieve'
                            ' an email as soon as permission is granted to use '
                            'the application.',
    'email_verified_title': 'Hi %s, thanks for verifying your mail address',
    'email_verified_content': 'A member of the AVResearcher team will review '
                              'your application. You will be notified by '
                              'email as soon as your account is approved.',
    'user_approved_title': '%s can now login to the application',
    'login_failed': 'Incorrect email or password',
    'login_required': 'You must be logged in to use this function'
}

COLLECTIONS_CONFIG = {
    'immix': {
        'name': 'iMMix metadata',
        'index_name': 'quamerdes_immix',
        'enabled_facets': ['keywords', 'channels', 'persons', 'genres'],
        'required_fields': ['title', 'date'],
        'available_aggregations': {
            'dates_stats': {
                'stats': {'field': 'date'}
            },
            'dates': {
                'date_histogram': {
                    'field': 'date',
                    'interval': 'year',
                    'min_doc_count': 0
                }
            },
            'channels': {
                'name': 'Channels',
                'description': '',
                'terms': {
                    'field': 'meta.broadcasters',
                    'size': 15
                }
            },
            'genres': {
                'name': 'Genres',
                'description': '',
                'buckets_path': 'filtered.filtered_buckets.buckets',
                'nested': {
                    'path': 'meta.categories'
                },
                'aggs': {
                    'filtered': {
                        'filter': {
                            'term': {'key': 'genre'}
                        },
                        'aggs': {
                            'filtered_buckets': {
                                'terms': {
                                    'field': 'meta.categories.value.untouched',
                                    'size': 15
                                }
                            }
                        }
                    }
                }
            },
            'persons': {
                'name': 'Persons',
                'description': '',
                'buckets_path': 'filtered.filtered_buckets.buckets',
                'nested': {
                    'path': 'meta.categories'
                },
                'aggs': {
                    'filtered': {
                        'filter': {
                            'term': {'key': 'person'}
                        },
                        'aggs': {
                            'filtered_buckets': {
                                'terms': {
                                    'field': 'meta.categories.value.untouched',
                                    'size': 15
                                }
                            }
                        }
                    }
                }
            },
            'keywords': {
                'name': 'Keywords',
                'description': '',
                'buckets_path': 'filtered.filtered_buckets.buckets',
                'nested': {
                    'path': 'meta.categories'
                },
                'aggs': {
                    'filtered': {
                        'filter': {
                            'term': {'key': 'keyword'}
                        },
                        'aggs':{
                            'filtered_buckets': {
                                'terms': {
                                    'field': 'meta.categories.value.untouched',
                                    'size': 15
                                }
                            }
                        }
                    }
                }
            },
            'descriptive_terms': {
                'name': 'Descriptive terms',
                'description': '',
                'significant_terms': {
                    'field': 'text',
                    'size': 15
                }
            }
        },
        'available_search_fields': {
            'titles': {
                'name': 'iMMix program titles',
                'fields': ['titles', 'mainTitle']
            },
            'summaries': {
                'name': 'iMMix program descriptions',
                'fields': ['summaries', 'descriptions']
            },
            'subtitles': {
                'name': 'TT888 subtitles',
                'fields': ['subtitles']
            }
            # 'tweets': {
            #     'name': 'Tweets',
            #     'fields': ['tweetText'],
            #     'nested': 'tweets'
            # }
        }
    },
    'kb': {
        'name': 'KB kranten',
        'index_name': 'quamerdes_kb',
        'enabled_facets': ['publication', 'article_type'],
        'required_fields': ['title', 'data', 'meta.publication_name'],
        'available_aggregations': {
            'dates_stats': {
                'stats': {'field': 'date'}
            },
            'dates': {
                'date_histogram': {
                    'field': 'date',
                    'interval': 'year',
                    'min_doc_count': 0
                }
            },
            'descriptive_terms': {
                'name': 'Descriptive terms',
                'description': '',
                'significant_terms': {
                    'field': 'text',
                    'size': 15
                }
            },
            'article_type': {
                'name': 'Article type',
                'description': '',
                'terms': {
                    'field': 'meta.article_type',
                    'size': 15
                }
            },
            'publication': {
                'name': 'Publication',
                'description': '',
                'terms': {
                    'field': 'meta.publication_name',
                    'size': 15
                }
            }
        },
        'available_search_fields': {
            'title': {
                'name': 'Article title',
                'fields': ['title']
            },
            'text': {
                'name': 'Article text',
                'fields': ['text']
            }
        }
    }
}

ENABLED_COLLECTIONS = ['immix', 'kb']

HITS_PER_PAGE = 5
ALLOWED_INTERVALS = ['year', 'month', 'week', 'day']

# The facet that is used for the date range slider
DATE_AGGREGATION = 'dates'
DATE_STATS_AGGREGATION = 'dates_stats'

# The fields that should be returned for each hit when searching
# SEARCH_HIT_FIELDS = ['mainTitle', 'broadcastDates', 'summaries']

MINIMUM_CLOUD_FONTSIZE = 10
MAXIMUM_CLOUD_FONTSIZE = 30

BARCHART_BARS = 10
BARCHART_BAR_HEIGHT = 20

# The fields that should be considered when creating highlighted snippets for
# a search result.
# HIT_HIGHLIGHT_FIELDS = ['descriptions', 'summaries', 'subtitles', 'tweetText']
HIT_HIGHLIGHT_FIELDS = ['text', 'title']
# The max. length of a highlighted snippet (in chars)
HIT_HIGHLIGHT_FRAGMENT_SIZE = 200
# The max. number of highlighted snippets (per field) to return
HIT_HIGHLIGHT_FRAGMENTS = 1

# Enables or disables application usage logging
ENABLE_USAGE_LOGGING = True

# Determine which events will be logged
# clicks actions:
#  submit_query: User submits a new query. Log querystring and modelName.
#  change_search_field: User adds or removes one of the collections from the search. Log modelName, the collection, and whether it has been activated or not
#  daterange_facet: User uses timeslider. Log from date in ms, to date in ms, and the model name
#  change_facet_tab: User switches tabs in facetsview. Log source and target tab
#  view_document: User clicks on a single document in result list. Log document id and model name
#  page_switch: User switches between home, about and querysyntax page. Log source and target page.
# results actions:
#  results: A result list is rendered. Log the visible doc_ids and model name.
LOG_EVENTS = ['clicks', 'results']

# The URL to the JSON file that contains the (textual) information
# displayed on the 'about' page
ABOUT_PAGE_CONTENT_URL = 'static/about.json'

# URL to JSON file that contains text for 'help' page
HELP_PAGE_CONTENT_URL = 'static/help.json'

# Allow all settings to be overridden by a local file that is not in
# the VCS.
try:
    from local_settings import *
except ImportError:
    pass
