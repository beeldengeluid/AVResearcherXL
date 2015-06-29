define([
    'jquery',
    'underscore',
    'backbone',
    'app',
    'text!../../../templates/search/filters.html'
],
function($, _, Backbone, app, filtersTemplate) {
    var FiltersView = Backbone.View.extend({
        events: {
            'click a.remove': 'removeFilter'
        },

        initialize: function(options) {
            // Only show the filters when there are hits to be displayed
            this.model.on('change:totalHits', function() {
                var hits = this.model.get('totalHits');
                if (hits === 0) {
                    this.$el.addClass('hidden');
                }
                else {
                    this.$el.removeClass('hidden');
                }
            }, this);

            this.model.on('change:filters', this.render, this);
        },

        render: function() {
            if (DEBUG) console.log('FiltersView:render');

            var filters = this.model.get('filters');
            var collection = this.model.get('collection');

            this.$el.html(_.template(filtersTemplate)({
                filters: filters,
                collection: collection
            }));

            return this;
        },

        removeFilter: function(e) {
            e.preventDefault();

            var filter = $(e.target);
            this.model.modifyQueryFilter(filter.data('filter'), filter.data('value'), false);
        }
    });

    return FiltersView;
});
