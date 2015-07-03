define([
    'jquery',
    'underscore',
    'backbone',
    'app',
    'text!../../../templates/search/results_list_immix.html',
    'text!../../../templates/search/results_list_kb.html'
],
function($, _, Backbone, app, resultsListImmixTemplate, resultsListKbTemplate){
    var ResultsListView = Backbone.View.extend({
        events: {
            'click li a': 'logClick'
        },

        initialize: function(){
            this.templates = {
                'immix': resultsListImmixTemplate,
                'kb': resultsListKbTemplate
            };

            this.model.on('change:hits', this.render, this);
            this.model.on('change:hits', this.logResults, this);

            // Only show the results when there are hits to be displayed
            this.model.on('change:totalHits', function() {
                var hits = this.model.get('totalHits');
                if (hits === 0) {
                    this.$el.addClass('hidden');
                }
                else {
                    this.$el.removeClass('hidden');
                }
            }, this);

            app.vent.on('changeview:ResultsListView', this.changeSortOrder, this);
        },

        render: function(){
            if (DEBUG) console.log('ResultsListView:render');

            this.$el.find('li').remove();
            this.$el.html(_.template(this.templates[this.model.get('collection')])({
                hits: this.model.get('hits')
            }));

            return this;
        },

        changeSortOrder: function(order) {
            var sort;
            if (order == 'relevance') {
                sort = '_score';
            }
            else if (order == 'datetime_desc') {
                sort = {'date': 'desc'};
            }
            else {
                sort = {'date': 'asc'};
            }

            this.model.changeResultOrder(sort);
        },

        logResults: function(){
            var docIDs = _.map(this.model.get('hits'), function(hit){ return hit._id; });
            app.vent.trigger('Logging:results', {
                action: 'results',
                modelName: this.model.get('name'),
                docIDs: docIDs
            });
        },

        logClick: function(e){
            var docID = e.target.dataset.id;
            app.vent.trigger('Logging:clicks', {
                action: 'view_document',
                modelName: this.model.get('name'),
                docID: docID
            });
        }
    });

    return ResultsListView;
});
