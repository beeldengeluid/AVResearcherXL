from avresearcher.app import _validate

from copy import deepcopy

from nose.tools import assert_raises


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
