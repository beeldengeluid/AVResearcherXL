from avresearcher.app import _check_es_config, _validate
from copy import deepcopy
from elasticsearch import Elasticsearch

from nose.tools import assert_equal, assert_in, assert_raises, assert_true


config = {
    "COLLECTIONS_CONFIG": {
        "index1": {
            "index_name": "hello?",
            "enabled_facets": ["cheap_facet"],
            "available_aggregations": {
                "cheap_facet": {}
            },
            "available_search_fields": {
                "field1": {"name": "1", "fields": ["1"]},
                "field2": {"name": "2", "fields": ["2"]},
            },
            "enabled_search_fields": ["field1", "field2"],
        },
    },
    "ENABLED_COLLECTIONS": ["index1"],
}


def test_check_es_config():
    assert_raises(ValueError, _check_es_config, config)

    c = deepcopy(config)
    c["ES_SEARCH_HOST"] = "localhost"
    c["ES_SEARCH_PORT"] = 9200
    c["ES_LOG_HOST"] = "loghost"
    c["ES_LOG_PORT"] = 9200
    es_search, es_log = _check_es_config(c)

    assert_in("ES_SEARCH_CONFIG", c)
    assert_equal(c["ES_SEARCH_CONFIG"], {"hosts": ["localhost"], "port": 9200})
    assert_in("ES_LOG_CONFIG", c)
    assert_equal(c["ES_LOG_CONFIG"], {"hosts": ["loghost"], "port": 9200})

    # Allow ES_LOG_CONFIG = None
    c["ES_LOG_CONFIG"] = None
    es_search, es_log = _check_es_config(c)
    assert_true(isinstance(es_search, Elasticsearch))
    assert_equal(es_log, None)


def test_validate():
    _validate(config)

    c = deepcopy(config)
    c["ENABLED_COLLECTIONS"] += "index2"
    assert_raises(ValueError, _validate, c)

    c = deepcopy(config)
    c["COLLECTIONS_CONFIG"]["index1"]["index_name"] = 123456
    assert_raises(TypeError, _validate, c)

    c = deepcopy(config)
    c["COLLECTIONS_CONFIG"]["index1"]["enabled_facets"] += "expensive_facet"
    assert_raises(ValueError, _validate, c)

    c = deepcopy(config)
    c["COLLECTIONS_CONFIG"]["index1"]["enabled_search_fields"] += "field3"
    assert_raises(ValueError, _validate, c)
