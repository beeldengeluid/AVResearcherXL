define([
    'jquery',
    'underscore',
    'backbone',
    'app'
],
function($, _, Backbone, app){
    AvrApiModel1 = Backbone.Model.extend({
        defaults: function(){
            return {
                enabledFacets: [],
                enabledSearchFields: [],
                enabledSearchHitFields: [],
                requiredFields: REQUIRED_FIELDS,
                hitsPerPage: HITS_PER_PAGE,
                startAtHit: 0,
                currentPage: 1,
                highlightFragments: HIT_HIGHLIGHT_FRAGMENTS,
                highlightFragmentSize: HIT_HIGHLIGHT_FRAGMENT_SIZE,
                highlightFields: HIT_HIGHLIGHT_FIELDS,
                collection: null,
                ftQuery: null,
                filters: {},
                sort: ['_score'],
                currentPayload: {},

                hits: {},
                totalHits: 0,
                queryTime: 0,
                queryTimeMs: null,

                interval: null,
                dateHistogram: null,
                globalDateHistogram: null,

                user: USER
            };
        },

        initialize: function(){
            this.api_url = 'api/';

            var self = this;
            app.vent.on('QueryInput:input:' + this.get('name'), function(){
                self.set('minDate', Infinity);
                self.set('maxDate', -Infinity);
            });

            // app.vent.on('interval:set', function(){
            //     self.setHistogram();
            // });

            app.vent.on('QueryInput:input:' + this.get('name'), function(){
                self.set('interval', null);
            });
        },

        http: {
            get: function(url, data, callback){
                url = ['api', url].join('/');

                //if (DEBUG) console.log('AvrApiModel:http:post', url, payload);
                $.ajax({
                    url: url,
                    type: 'GET',
                    data: data,
                    dataType: 'json',
                    cache: true,
                    success: callback,
                    error: function(xhr, status, error){
                        console.log(xhr);
                        console.log(status);
                        console.log(error);
                    }
                });
            },
            post: function(url, data, callback){
                if($.inArray(url, ['search', 'count']) !== -1){
                    data = {'payload': JSON.stringify(data)};
                }
                else if(url === 'log_usage'){
                    data = {'events': JSON.stringify(data)};
                }

                url = ['api', url].join('/');

                if (DEBUG) console.log('AvrApiModel:http:post', url, data);
                $.ajax({
                    url: url,
                    type: 'POST',
                    data: data,
                    dataType: 'json',
                    cache: true,
                    success: callback,
                    error: function(xhr, status, error){
                        console.log(xhr);
                        console.log(status);
                        console.log(error);
                    }
                });
            }
        },

        register: function(email, name, organization, password){
            var post_data = {
                email: email,
                name: name,
                organization: organization,
                password: password
            };

            var self = this;

            // On successful login, set the user details and trigger 'login_successful' event
            this.http.post('register', post_data, function(data){
                if(data.success){
                    app.vent.trigger('AvrApiModel:registration_successful');
                }
                // Trigger 'login_failed' with the error
                else {
                    app.vent.trigger('AvrApiModel:registration_failed', data.errors);
                }
            });
        },

        login: function(email, password){
            var post_data = {
                email: email,
                password: password
            };

            var self = this;
            this.http.post('login', post_data, function(data){
                // On successful login, set the user details and trigger 'login_successful' event
                if(data.success){
                    self.set('user', data.user);
                    app.vent.trigger('AvrApiModel:login_successful');
                }
                // Trigger 'login_failed' with the error
                else {
                    app.vent.trigger('AvrApiModel:login_failed', data.errors);
                }
            });
        },

        logout: function(){
            var self = this;
            this.set('user', null);
            this.http.get('logout', function(data){
                console.log(data);
            });
        },

        logUsage: function(events){
            this.http.post('log_usage', events, function(data){
                console.log(data);
            });
        },

        changeCollection: function(collection) {
            if (DEBUG) console.log('AvrApiModel:changeCollection', collection);

            var collection_config = COLLECTIONS_CONFIG[collection];

            // Set the collection, search fields and enabled aggregations,
            // clear the current hits
            this.set({
                collection: collection,
                enabledSearchFields: _.keys(collection_config.available_search_fields),
                enabledAggregations: this.getAggregationsConfig(collection),
                hits: {}
            });

            // Execute a new ft query to load results within the collection
            // that was just selected
            var qs = this.get('ftQuery');
            if (qs) {
                this.freeTextQuery(qs);
            }
        },

        changeResultOrder: function(order) {
            this.set({sort: [order]});

            var payload = this.constructQueryPayload();

            // Don't request aggregations, since we only have to display
            // results in their new order
            delete payload.aggs;

            var self = this;
            this.http.post('search', payload, function(data){
                self.set({ hits: data.hits.hits });
            });
        },

        changeEnabledSearchFields: function(field, add) {
            var enabled_fields = this.get('enabledSearchFields');

            var field_index = enabled_fields.indexOf(field);
            if (add) {
                // only add the field if it is not yet enabled
                if (field_index == -1) {
                    enabled_fields.push(field);
                }
            }
            else {
                // Only remove the field if it is in the list of enabled fields
                if (field_index != -1) {
                    enabled_fields.splice(field_index, 1);
                }
            }

            this.set({ enabledSearchFields: enabled_fields });
            this.set('currentPayload', this.constructQueryPayload());
            
            var self = this;
            this.http.post('search', this.get('currentPayload'), function(data){
                self.set({
                    hits: data.hits.hits,
                    aggregations: data.aggregations,
                    totalHits: data.hits.total,
                    queryTime: data.took,
                    queryTimeMs: (data.took / 1000).toFixed(2)
                });
            });
        },

        getAggregationsConfig: function(collection) {
            var collection_config = COLLECTIONS_CONFIG[collection];

            var aggregations = {};
            _.each(collection_config.enabled_facets, function(facet_name) {
                aggregations[facet_name] = _.omit(collection_config.available_aggregations[facet_name], 'name', 'description', 'buckets_path');
            });

            aggregations[DATE_STATS_AGGREGATION] = collection_config.available_aggregations[DATE_STATS_AGGREGATION];

            return aggregations;
        },

        getDateHistogram: function(interval) {
            if (DEBUG) console.log('AvrApiModel:getDateHistogram', interval);
            var self = this;

            var date_stats = this.get('aggregations')[DATE_STATS_AGGREGATION];
            if (date_stats.min === null && date_stats.max === null) {
                self.set({
                    dateHistogram: null,
                    globalDateHistogram: null
                });
                return;
            }

            var collection_config = COLLECTIONS_CONFIG[this.get('collection')];
            
            // Query that returns the date histogram while respecting the
            // current query  
            var date_agg_query = _.clone(this.get('currentPayload'));
            date_agg_query.size = 0;
            date_agg_query.aggs = {};
            date_agg_query.aggs[DATE_AGGREGATION] = _.clone(collection_config.available_aggregations[DATE_AGGREGATION]);
            date_agg_query.aggs[DATE_AGGREGATION].date_histogram.interval = interval;

            var date_field = collection_config.available_aggregations[DATE_AGGREGATION].date_histogram.field;
            var global_date_agg_query = {
                'index': date_agg_query.index,
                'query': {
                    'constant_score': {
                        'filter': {
                            'range': {
                                'execution': 'fielddata',
                                '_cache': true
                            }
                        }
                    }
                },
                'aggs': {},
                'size': 0
            };
            global_date_agg_query.query.constant_score.filter.range[date_field] =  {
                'gte': date_stats.min,
                'lte': date_stats.max
            };
            global_date_agg_query.aggs[DATE_AGGREGATION] = _.clone(collection_config.available_aggregations[DATE_AGGREGATION]);
            global_date_agg_query.aggs[DATE_AGGREGATION].date_histogram.interval = interval;

            this.http.post('search', [date_agg_query, global_date_agg_query], function(data){
                self.set({
                    dateHistogram: data.responses[0].aggregations[DATE_AGGREGATION],
                    globalDateHistogram: data.responses[1].aggregations[DATE_AGGREGATION],
                    interval: interval
                });
            });
        },

        // Execute a new query based on an ft query string and the default
        // query properties defined in the config
        freeTextQuery: function(querystring){
            if (DEBUG) console.log('AvrApiModel:freeTextQuery', querystring);

            var self = this;

            // Reset query properties
            this.set({
                //enabledFacets: AVAILABLE_FACETS,
                //enabledSearchHitFields: SEARCH_HIT_FIELDS,
                hitsPerPage: HITS_PER_PAGE,
                startAtHit: 0,
                currentPage: 1,
                ftQuery: querystring,
                filters: {}
            });

            this.set('currentPayload', this.constructQueryPayload());
            this.http.post('search', this.get('currentPayload'), function(data){
                self.set({
                    hits: data.hits.hits,
                    aggregations: data.aggregations,
                    totalHits: data.hits.total,
                    queryTime: data.took,
                    queryTimeMs: (data.took / 1000).toFixed(2),
                    queryString: querystring
                });
            });
        },

        modifyQueryFilter: function(aggregation, value, add) {
            var self = this;

            var aggregation_config = COLLECTIONS_CONFIG[this.get('collection')].available_aggregations[aggregation];

            // Get the currently active filters (we clone the contents of the filter
            // attribute to force Backbone to trigger a change event when we call `this.set`),
            // see http://stackoverflow.com/a/12390273/961381 for more info
            var filters = _.clone(this.get('filters'));
            
            // Add filter defenitions to the filters object, if the filter
            // defentions does not yet exist
            if (!(aggregation in filters)) {
                // Aggregation of terms
                if ('terms' in aggregation_config) {
                    filters[aggregation] = {
                        filter_type: 'terms',
                        field: aggregation_config.terms.field,
                        values: []
                    };
                }
                // Aggregation of dates
                else if ('date_histogram' in aggregation_config) {
                    filters[aggregation] = {
                        filter_type: 'range',
                        field: aggregation_config.date_histogram.field,
                        values: {}
                    };
                }

                // Aggregation of nested documents
                else if ('nested' in aggregation_config){
                    filters[aggregation] = {
                        nested: true,
                        path: aggregation_config.nested.path
                    };

                    // Additional filters that indicate which nested documents of 'path'
                    // should be taken into consideration
                    if ('filtered' in aggregation_config.aggs) {
                        filters[aggregation].filters = aggregation_config.aggs.filtered.filter;
        
                        // Nested terms aggregation
                        if ('terms' in aggregation_config.aggs.filtered.aggs.filtered_buckets) {
                            filters[aggregation].filter_type = 'terms';
                            filters[aggregation].field = aggregation_config.aggs.filtered.aggs.filtered_buckets.terms.field;
                            filters[aggregation].values = [];
                        }
                        else if ('date_histogram' in aggregation_config.aggs.filtered.aggs.filtered_buckets) {
                            filters[aggregation].filter_type = 'range';
                            filters[aggregation].field = aggregation_config.date_histogram.field;
                            filters[aggregation].values = {};
                        }
                    }
                }
            }

            // Add or delete a facet value from the filter's values array
            if (filters[aggregation].filter_type === 'terms') {
                if (add) {
                    filters[aggregation].values.push(value);
                }
                else {
                    var index = filters[aggregation].values.indexOf(value);
                    filters[aggregation].values.splice(index, 1);
                    
                    // Delete the complete filter if there are no values left to filter on
                    if (filters[aggregation].values.length === 0) {
                        delete filters[aggregation];
                    }
                }
            }

            else if(filters[aggregation].filter_type === 'range'){
                if (add) {
                    filters[aggregation].values.from = value[0];
                    filters[aggregation].values.to = value[1];
                }
                else {
                    delete filters[aggregation];
                }
            }

            this.set('filters', filters);
            this.set('currentPayload', this.constructQueryPayload());
            this.http.post('search', this.get('currentPayload'), function(data){
                console.log(data);
                self.set({
                    hits: data.hits.hits,
                    aggregations: data.aggregations,
                    totalHits: data.hits.total,
                    queryTime: data.took,
                    queryTimeMs: (data.took / 1000).toFixed(2),
                });
            });
        },

        constructQueryPayload: function() {
            var filteredQuery = {
                query: {
                    bool: {
                        should: [],
                        minimum_should_match: 1
                    }
                    // query_string: {
                    //     query: this.get('ftQuery'),
                    //     default_operator: 'AND',
                    //     fields: ['title', 'text']
                    // }
                },
                filter: {}
            };

            // Construct the filtered free text query based on the enabled search fields
            var collection = this.get('collection');
            var enabledFields = this.get('enabledSearchFields');
            var ftQuery = this.get('ftQuery');

            var non_nested_fields = [];
            var nested_fields = [];
            _.each(enabledFields, function(field) {
                var field_config = COLLECTIONS_CONFIG[collection].available_search_fields[field];
                if ('nested' in field_config) {
                    nested_fields.push(field_config);
                } else {
                    non_nested_fields.push(field_config);
                }
            });

            // First add non-nested fields as a single query_string query
            if (non_nested_fields.length > 0) {
                var qsq = {
                    query_string: {
                        fields: [],
                        query: ftQuery,
                        default_operator: 'AND'
                    }
                };

                _.each(non_nested_fields, function(field_config) {
                    Array.prototype.push.apply(qsq.query_string.fields, field_config.fields);
                });

                filteredQuery.query.bool.should.push(qsq);
            }

            // Add the fields of a nested document as a seperate 'should' to the bool
            // query. Each nested field is added as a seperate 'should'.
            _.each(nested_fields, function(field_config) {
                filteredQuery.query.bool.should.push({
                    nested: {
                        path: field_config.nested,
                        query: {
                            query_string: {
                                fields: field_config.fields,
                                query: ftQuery,
                                default_operator: 'AND'
                            }
                        }
                    }
                });
            });
            
            var filters = this.get('filters');

            // Only add the filter component to the query if at least one filter
            // is enabled.
            if (_.size(filters) > 0){
                // Each facet is added as an AND filter
                filteredQuery.filter.bool = {must: []};
            }

            _.each(filters, function(filter, aggregation_name) {
                // Term based filtering on nested attributes
                if (filter.nested && filter.filter_type === 'terms') {
                    // Add a filter for each of the values
                    _.each(filter.values, function(value) {
                        var query_filter = {};
                        query_filter.nested = {
                            path: filter.path,
                            filter: {
                                bool: {
                                    must: []
                                }
                            }
                        };

                        var term_filter = {term: {}};
                        term_filter.term[filter.field] = value;
                        query_filter.nested.filter.bool.must.push(term_filter);

                        // Add additonal filters for nested docuent selection
                        query_filter.nested.filter.bool.must.push(filter.filters);

                        filteredQuery.filter.bool.must.push(query_filter);
                    });
                }

                // Range based filtering on nested attributes
                else if (filter.nested && filter.filter_type === 'range') {
                    var query_filter = {};
                    query_filter.nested = {
                        path: filter.path,
                        filter: {
                            bool: {
                                must: []
                            }
                        }
                    };

                    var range_filter = {};
                    range_filter.range[filter.field] = {
                        gte: filter.from,
                        lte: filter.to
                    };
                    query_filter.nested.filter.bool.must.push(range_filter);

                    // Add additonal filters for nested docuent selection
                    query_filter.nested.filter.bool.must.push(filter.filters);

                    filteredQuery.filter.bool.must.push(query_filter);
                }
                // Term based filtering
                else if (filter.filter_type === 'terms') {
                    var terms_filter = {
                        terms: {execution: 'and'}
                    };
                    terms_filter.terms[filter.field] = filter.values;

                    filteredQuery.filter.bool.must.push(terms_filter);
                }
                // Range based filtering
                else if (filter.filter_type == 'range') {
                    var range_filter = { range: {} };
                    range_filter.range[filter.field] = {
                        gte: filter.values.from,
                        lte: filter.values.to
                    };

                    filteredQuery.filter.bool.must.push(range_filter);
                }
            });

            return {
                index: collection,
                query: {
                    filtered: filteredQuery
                },
                aggs: this.get('enabledAggregations'),
                fields: this.get('requiredFields'),
                sort: this.get('sort'),
                size: this.get('hitsPerPage'),
                from: this.get('startAtHit')
            };
        },

        // Navigate to a given page using the existing query (currentPayload)
        paginateToPage: function(page){
            var self = this;
            this.set('startAtHit', this.get('hitsPerPage') * (page - 1));

            // Get a copy of the current payload
            var payload = this.get('currentPayload');
            payload.from = this.get('startAtHit');

            // Since we only have to replace hits, don't request aggregations.
            // This is less expensive on the ES side, and reduces the
            // size of the response.
            delete payload.aggregations;

            this.http.post('search', payload, function(data){
                self.set({
                    hits: data.hits.hits,
                    queryTime: data.took,
                    queryTimeMs: (data.took / 1000).toFixed(2)
                });
            });
        }
    });

    AvrApiModel = Backbone.Model.extend({
        defaults: function(){
            return {
                enabledSearchFields: [],
                enabledFacets: [],
                enabledSearchHitFields: [],
                hitsPerPage: HITS_PER_PAGE,
                startAtHit: 0,
                currentPage: 1,
                highlightFragments: HIT_HIGHLIGHT_FRAGMENTS,
                highlightFragmentSize: HIT_HIGHLIGHT_FRAGMENT_SIZE,
                highlightFields: HIT_HIGHLIGHT_FIELDS,
                ftQuery: null,
                filters: {},
                currentPayload: { facets: {}},

                hits: {},
                totalHits: 0,
                queryTime: 0,
                queryTimeMs: null,

                // Total number of documents in the index
                totalDocs: 0,
                // First broadcast (broadcastDates.start) in the index
                firstBroadcastDate: null,
                // Most recent broadcast (broadcastDates.start) in the index
                lastBroadcastDate: null,
                // Number of broadcasts that contain one or more tweets
                docsWithTweetsCount: null,
                // Number of broadcasts that contain subtitles
                docsWithSubtitleCount: null,

                defaultInterval: 'year',
                interval: null,

                user: USER
            };
        },

        initialize: function(){
            this.api_url = 'api/';

            var self = this;
            app.vent.on('QueryInput:input:' + this.get('name'), function(){
                self.set('minDate', Infinity);
                self.set('maxDate', -Infinity);
            });

            app.vent.on('interval:set', function(){
                self.setHistogram();
            });

            app.vent.on('QueryInput:input:' + this.get('name'), function(){
                self.set('interval', null);
            });
        },

        http: {
            get: function(url, data, callback){
                url = ['api', url].join('/');

                //if (DEBUG) console.log('AvrApiModel:http:post', url, payload);
                $.ajax({
                    url: url,
                    type: 'GET',
                    data: data,
                    dataType: 'json',
                    cache: true,
                    success: callback,
                    error: function(xhr, status, error){
                        console.log(xhr);
                        console.log(status);
                        console.log(error);
                    }
                });
            },
            post: function(url, data, callback){
                if($.inArray(url, ['search', 'count']) !== -1){
                    data = {'payload': JSON.stringify(data)};
                }
                else if(url === 'log_usage'){
                    data = {'events': JSON.stringify(data)};
                }

                url = ['api', url].join('/');

                //if (DEBUG) console.log('AvrApiModel:http:post', url, payload);
                $.ajax({
                    url: url,
                    type: 'POST',
                    data: data,
                    dataType: 'json',
                    cache: true,
                    success: callback,
                    error: function(xhr, status, error){
                        console.log(xhr);
                        console.log(status);
                        console.log(error);
                    }
                });
            }
        },

        register: function(email, name, organization, password){
            var post_data = {
                email: email,
                name: name,
                organization: organization,
                password: password
            };

            var self = this;

            // On successful login, set the user details and trigger 'login_successful' event
            this.http.post('register', post_data, function(data){
                if(data.success){
                    app.vent.trigger('AvrApiModel:registration_successful');
                }
                // Trigger 'login_failed' with the error
                else {
                    app.vent.trigger('AvrApiModel:registration_failed', data.errors);
                }
            });
        },

        login: function(email, password){
            var post_data = {
                email: email,
                password: password
            };

            var self = this;
            this.http.post('login', post_data, function(data){
                // On successful login, set the user details and trigger 'login_successful' event
                if(data.success){
                    self.set('user', data.user);
                    app.vent.trigger('AvrApiModel:login_successful');
                }
                // Trigger 'login_failed' with the error
                else {
                    app.vent.trigger('AvrApiModel:login_failed', data.errors);
                }
            });
        },

        logout: function(){
            var self = this;
            this.set('user', null);
            this.http.get('logout', function(data){
                console.log(data);
            });
        },

        logUsage: function(events){
            this.http.post('log_usage', events, function(data){
                console.log(data);
            });
        },

        // Use the query properties that are set as instance attributes to generate
        // an ES query
        constructQueryPayload: function(){
            var self = this;
            var payload = {
                query: {}
            };

            var filtered = {};
            // Construct the filtered free text query based on enabled sources/fields
            var enabledSources = this.get('enabledSearchFields');
            var ftQuery = this.get('ftQuery');
            filtered.query = {
                bool: {
                    should: [],
                    minimum_number_should_match : 1
                }
            };

            // First add non-nested fields as a single query_string query
            _.each(enabledSources, function(source){
                if(!('nested' in source)){
                    // Only add the query_string defention if the array is still empty
                    if(filtered.query.bool.should.length === 0){
                        filtered.query.bool.should.push({
                            query_string: {
                                fields: [],
                                query: ftQuery,
                                default_operator: 'AND'
                            }
                        });
                    }

                    _.each(source.fields, function(field){
                        filtered.query.bool.should[0].query_string.fields.push(field);
                    });
                }
            });

            // Add the fields of a nested document as a seperate 'should' to the bool
            // query. Each nested document is added as a seperate 'should'.
            _.each(enabledSources, function(source){
                if('nested' in source){
                    filtered.query.bool.should.push({
                        nested: {
                            path: source.nested,
                            query: {
                                query_string: {
                                    fields: source.fields,
                                    query: ftQuery,
                                    default_operator: 'AND'
                                }
                            }
                        }
                    });
                }
            });

            var filters = this.get('filters');

            // Only add the filter component to the query if at least one filter
            // is enabled.
            if(_.size(filters) > 0){
                // Each facet is added as an AND filter
                filtered.filter = {and: []};
            }

            _.each(filters, function(filter, facet_name){
                // Term based filtering on nested attributes
                if(filter.nested && filter.facet_type === 'terms'){
                    _.each(filter.values, function(value){
                        var facet = {};
                        facet.nested = {
                            path: filter.path,
                            // Take all nested documents of 'path' into consideration
                            query: {match_all: {}}
                        };

                        // facet_filters and facet values are added as AND conditions
                        facet.nested.filter = { and: []};

                        // Use the specified field when dealing with multi-field types
                        if('nested_filter_field' in filter){
                            field = filter.path + '.' + filter.nested_filter_field + '.' + filter.field;
                        }
                        else {
                            field = filter.path + '.' + filter.field;
                        }

                        var term_filter = {term : {}};
                        term_filter.term[field] = value;
                        facet.nested.filter.and.push(term_filter);

                        // Add additonal filters for nested docuent selection
                        if('facet_filter' in filter){
                            facet.nested.filter.and.push(filter.facet_filter);
                        }

                        filtered.filter.and.push(facet);
                    });
                }

                // Date range filter on nested attributes
                else if(filter.nested && filter.facet_type === 'range'){
                    var facet = {};
                    facet.nested = {
                        path: filter.path,
                        // Take all nested documents of 'path' into consideration
                        query: {match_all: {}}
                    };

                    // facet_filters and facet values are added as AND conditions
                    facet.nested.filter = { and: []};

                    // Use the specified field when dealing with multi-field types
                    if('nested_filter_field' in filter){
                        field = filter.path + '.' + filter.nested_filter_field + '.' + filter.field;
                    }
                    else {
                        field = filter.path + '.' + filter.field;
                    }

                    var range_filter = {};
                    range_filter[field] = {
                        'from': filter.values.from,
                        'to': filter.values.to
                    };

                    facet.nested.filter.and.push({'range': range_filter});

                    if('facet_filter' in filter){
                        facet.nested.filter.and.push(filter.facet_filter);
                    }

                    filtered.filter.and.push(facet);
                }

                // Term based filtering on non-nested attributes
                else if(filter.facet_type === 'terms'){
                    var facet = {};
                    field = filter.field;
                    values = filter.values;
                    facet.terms = {};
                    facet.terms[field] = values;
                    facet.terms.execution = 'and';

                    filtered.filter.and.push(facet);
                }
            });

            // Add the filters to the query payload
            payload.query.filtered = filtered;

            // Snippets and highlighting
            var highlight = {
                fields: {},
                number_of_fragments: this.get('highlightFragments'),
                fragment_size: this.get('highlightFragmentSize'),
                order: 'score'
            };

            _.each(this.get('highlightFields'), function(field){
                highlight.fields[field] = {};
            });
            payload.highlight = highlight;

            // Facets
            var facets = {};
            var enabled_facets = this.get('enabledFacets');
            // The facet settings we need and Elastic Search supports
            var es_facet_fields = ['date_histogram', 'terms', 'facet_filter', 'nested'];
             _.each(enabled_facets, function(facet, facet_name){
                facets[facet_name] = {};

                _.each(facet, function(option_value, option_name){
                    // Only add to payload if facet setting is supported by ES
                    if(_.contains(es_facet_fields, option_name)){
                        if(option_name === 'date_histogram'){
                            var interval = self.get('interval');
                            if(!interval) interval = self.get('defaultInterval');
                            option_value.interval = interval;
                        }
                        facets[facet_name][option_name] = option_value;
                    }
                });
            });
            payload.facets = facets;

            // The fields that are required to render the search results templates
            payload._source = this.get('enabledSearchHitFields');

            // Number of hits to return and the offset
            payload.size = this.get('hitsPerPage');
            payload.from = this.get('startAtHit');

            return payload;
        },

        changeSearchFields: function(enabled_fields){
            if (DEBUG) console.log('ElasticSearchModel:changeSearchFields', enabled_fields);

            var self = this;

            // Get the config definitions of the enabled fields
            var field_definitions = _.filter(AVAILABLE_SEARCH_FIELDS, function(field){
                if(_.contains(enabled_fields, field.id)){
                    return true;
                } else {
                    return false;
                }
            });

            this.set('enabledSearchFields', field_definitions);
            this.set('currentPayload', this.constructQueryPayload());

            this.http.post('search', this.get('currentPayload'), function(data){
                self.set({
                    hits: data.hits.hits,
                    facets: data.facets,
                    totalHits: data.hits.total,
                    queryTime: data.took,
                    queryTimeMs: (data.took / 1000).toFixed(2)
                });
            });
        },

        // Execute a new query based on an ft query string and the default
        // query properties defined in the config
        freeTextQuery: function(querystring){
            var self = this;

            // Reset query properties
            this.set({
                enabledFacets: AVAILABLE_FACETS,
                enabledSearchHitFields: SEARCH_HIT_FIELDS,
                hitsPerPage: HITS_PER_PAGE,
                startAtHit: 0,
                currentPage: 1,
                ftQuery: querystring,
                filters: {broadcast_start_date: {facet_type: "range", field: "start", nested: true, path: "broadcastDates", values: {from: new Date(1800,1,1), to: new Date()}}}
            });

            this.set('currentPayload', this.constructQueryPayload());
            this.http.post('search', this.get('currentPayload'), function(data){
                self.set({
                    hits: data.hits.hits,
                    facets: data.facets,
                    totalHits: data.hits.total,
                    queryTime: data.took,
                    queryTimeMs: (data.took / 1000).toFixed(2),
                    queryString: querystring
                });
            });
        },

        // Add or remove facet values from the set of active filters
        modifyFacetFilter: function(facet, value, add){
            var self = this;
            var facet_settings = AVAILABLE_FACETS[facet];

            // Get the currently active filters
            var filters = this.get('filters');

            // Add filter defenitions to the filters object if it does not yet exist
            if(!(facet in filters)){
                // Facet of the 'terms' type
                if('terms' in facet_settings){
                    filters[facet] = {
                        facet_type: 'terms',
                        field: facet_settings.terms.field,
                        values: []
                    };
                }
                else if ('date_histogram' in facet_settings){
                    filters[facet] = {
                        facet_type: 'range',
                        field: facet_settings.date_histogram.field,
                        values: {}
                    };
                }

                // Add required addtional info for 'nested' documents
                if('nested' in facet_settings){
                    filters[facet].nested = true;
                    filters[facet].path = facet_settings.nested;

                    // Additional filters that indicate which nested documents of 'path'
                    // should be taken into consideration
                    if('facet_filter' in facet_settings){
                        filters[facet].facet_filter = facet_settings.facet_filter;
                    }

                    // Use a specific field in case of a multi-field
                    if('nested_filter_field' in facet_settings){
                        filters[facet].nested_filter_field = facet_settings.nested_filter_field;
                    }
                }
            }

            // Add or delete a facet value from the filters values array
            if('terms' in facet_settings){
                if(add){
                    filters[facet].values.push(value);
                }
                else {
                    var index = filters[facet].values.indexOf(value);
                    filters[facet].values.splice(index, 1);
                    if(filters[facet].values.length === 0){
                        delete filters[facet];
                    }
                }
            }
            else if('date_histogram' in facet_settings){
                if(add){
                    filters[facet].values.from = value[0];
                    filters[facet].values.to = value[1];
                }
                else {
                    delete filters[facet];
                }
            }

            this.set('filters', filters);
            this.set('currentPayload', this.constructQueryPayload());
            this.http.post('search', this.get('currentPayload'), function(data){
                self.set({
                    hits: data.hits.hits,
                    facets: data.facets,
                    queryTime: data.took,
                    totalHits: data.hits.total,
                    queryTimeMs: (data.took / 1000).toFixed(2)
                });
            });
        },

        getDateHistogram: function(options, callback){
            var self = this;
            var interval = this.get('interval');
            if (!interval){
                interval = this.get('defaultInterval');
            }
            if(options.interval){
                interval = options.interval;
            }

            var payload = _.clone(this.get('currentPayload'));
            delete payload.highlight;
            payload.size = 0;
            payload.facets = {
                broadcast_start_date: {
                    date_histogram: {
                        field: 'start',
                        interval: interval
                    },
                    nested: 'broadcastDates'
                }
            };

            this.http.post('search', payload, function(data){
                callback(data);
            });
        },

        setHistogram: function(){
            if(!this.get('interval')){
                // No need to set a histogram
                return;
            }
            var self = this;
            var payload = _.clone(this.get('currentPayload'));

            delete payload.highlight;
            payload.size = 0;
            payload.facets = {
                broadcast_start_date: {
                    date_histogram: {
                        field: 'start',
                        interval: this.get('interval')
                    },
                    nested: 'broadcastDates'
                }
            };

            this.http.post('search', payload, function(data){
                var facets = self.get('facets');
                facets.broadcast_start_date = data.facets.broadcast_start_date;

                self.set({
                    facets: facets
                }, {silent: true});

                app.vent.trigger('model:redraw:' + self.get('name'));
            });
        },

        // Navigate to a given page using the existing query (currentPayload)
        paginateToPage: function(page){
            var self = this;
            this.set('startAtHit', this.get('hitsPerPage') * (page - 1));

            // Get a copy of the current payload
            var payload = this.get('currentPayload');
            payload.from = this.get('startAtHit');

            // Since we only have to replace hits, don't request facets. This is less
            // expensive on the ES side, and reduces the size of the response.
            delete payload.facets;

            this.http.post('search', payload, function(data){
                self.set({
                    hits: data.hits.hits,
                    queryTime: data.took,
                    queryTimeMs: (data.took / 1000).toFixed(2)
                });
            });
        },

        /* Get the total number of documents that are currently in the index */
        getTotalDocCount: function(){
            var self = this;
            this.http.post('count', {'query': {'match_all': {}}}, function(data){
                self.set('totalDocs', data.count);
            });
        },

        /* Get the date of the first and last broadcasts in the index */
        getFirstLastDocDates: function(){
            var self = this;

            var query = {
                "query": {"match_all": {}},
                "facets": {
                    "min_max_broadcast_start_date": {
                        "nested": "broadcastDates",
                        "statistical": {
                            "field": "start"
                        },
                        "facet_filter": {
                            "range": {
                                "broadcastDates.start": {
                                    "gte": new Date(1800,1,1),
                                    "lte": new Date()
                                }
                            }
                        }
                    }
                },
                "size": 0
            };
            this.http.post('search', query, function(data){
                self.set({
                    firstBroadcastDate: new Date(data.facets.min_max_broadcast_start_date.min),
                    lastBroadcastDate: new Date(data.facets.min_max_broadcast_start_date.max)
                });
            });
        },

        /* Get the number of documents that contain one or more Tweet */
        getDocsWithTweetsCount: function(){
            var self = this;
            var query = {
              "query": {
                "filtered": {
                  "query": { "match_all": {} },
                  "filter": {
                    "nested": {
                      "path": "tweets",
                      "query": { "match_all": {} },
                      "filter": {
                        "not": {
                          "missing": {
                            "field": "tweetId",
                            "existence": true
                          }
                        }
                      }
                    }
                  }
                }
              },
              "size": 0
            };

            this.http.post('search', query, function(data){
                self.set('docsWithTweetsCount', data.hits.total);
            });
        },

        getDocsWithSubtitleCount: function(){
            var self = this;
            var query = {
                "query": {
                    "filtered": {
                        "query": {
                            "match_all": {}
                        },
                        "filter": {
                            "exists": {
                                "field": "subtitles"
                            }
                        }
                    }
                },
                "size": 0
            };

            this.http.post('search', query, function(data){
                self.set('docsWithSubtitleCount', data.hits.total);
            });
        }
    });

    return AvrApiModel1;
});
