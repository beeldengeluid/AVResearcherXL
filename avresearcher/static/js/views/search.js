define([
    'jquery',
    'underscore',
    'backbone',
    'views/base',
    'text!../../templates/search.html',
    'views/search/collection_selector',
    'views/search/query_input',
    'views/search/query_properties',
    'views/search/timeslider',
    'views/search/results_list',
    'views/search/paginator',
    'views/search/facets',
    'views/search/filters'
],
function($, _, Backbone, BaseView, searchTemplate, CollectionSelectorView, QueryInputView,
         QueryPropertiesView, TimeSliderView, ResultsListView, PaginatorView, FacetsView,
         FiltersView){
    var SearchView = Backbone.View.extend({
        initialize: function(options){
            this.constructor.__super__.initialize.apply(this, [options]);
            this.name = options.name;
            
            this.collection_selector = new CollectionSelectorView({ model: this.model });
            this.query_input = new QueryInputView({ model: this.model });
            this.timeslider = new TimeSliderView({
                model: this.model,
                date_facet: DATE_AGGREGATION
            });

            // Initialize subviews
            this.results_list = new ResultsListView({ model: this.model });
            this.query_properties = new QueryPropertiesView({ model: this.model });
            this.paginator = new PaginatorView({ model: this.model });
            this.facets = new FacetsView({
                    model: this.model,
                    name: options.name
            });
            this.filters = new FiltersView({ model: this.model });
        },

        render: function(){
            var compiledTemplate = _.template(searchTemplate, {});
            this.$el.html(compiledTemplate);

            // Setup all subviews
            this.collection_selector.setElement($('.collection-selector.' + this.name)).render();
            this.query_input.setElement($('.query-input.' + this.name)).render();
            //this.query_properties.setElement($('.query-properties.' + this.name)).render();
            this.timeslider.setElement($('.timeslider.' + this.name)).render();
            this.results_list.setElement($('.hits.' + this.name)).render();
            this.paginator.setElement($('.pagination.' + this.name)).render();
            this.facets.setElement($('.facets.' + this.name)).render();
            this.filters.setElement($('.filters.' + this.name)).render();

            $('#qaffix').affix({offset: {top: 54}});
        }
    });

    return SearchView;
});
