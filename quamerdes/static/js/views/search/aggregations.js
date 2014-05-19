define([
    'jquery',
    'underscore',
    'backbone',
    'd3',
    'app',
    'views/search/cloud',
    'views/search/barchart',
    'text!../../../templates/search/aggregations.html'
],
function($, _, Backbone, d3, app, CloudView, BarChartView, aggregationsTemplate){
    var AggregationsView = Backbone.View.extend({
        events: {
            'click a.nav-tab': 'switchTab',
            'click ul.nav i': 'switchAggregationRepresentation'
        },

        initialize: function(options){
            if (DEBUG) console.log('AggregationsView:initialize');
            var self = this;
            this.name = options.name;

            this.aggregations = {};
            this.aggregated = {};
            this.representation = 'cloud';

            // Control visibility on init. Element is shown on first query.
            this.is_visible = true;
            app.vent.once('QueryInput:input', this.toggleVisibility, this);

            this.cloud = new CloudView({
                model: this.model,
                name: this.name
            });

            this.barchart = new BarChartView({
                model: this.model,
                name: this.name
            });

            this.model.on('change:aggregations', this.formatData, this);
            this.model.on('change:formattedAggregations', this.render, this);
        },

        render: function(icon){
            if (DEBUG) console.log('AggregationsView:render');
            var self = this;

            this.$el.html(_.template(aggregationsTemplate, {
                aggregations: this.model.get('formattedAggregations'),
                activeTab: this.model.get('activeAgg'),
                representation: this.representation
            }));

            if(this.representation == 'cloud') this.cloud.setElement(this.$el.find('.tab-content')).render();
            if(this.representation == 'barchart') this.barchart.setElement(this.$el.find('.tab-content')).render();

            return this;
        },

        switchAggregationRepresentation: function(event){
            if (DEBUG) console.log('AggregationsView:switchAggregationRepresentation');
            var self = this;

            var clicked_rep = $(event.target);

            // Do nothing if we are already showing this representation
            if(clicked_rep.data('representation') == this.representation) return;

            this.representation = clicked_rep.data('representation');
            this.render();
        },

        formatData: function(){
            if (DEBUG) console.log('AggregationsView:formatData');
            var self = this,
                aggs = this.model.get('aggregations'),
                availableAggregations = this.model.get('availableAggregations'),
                facets = this.model.getAggregationNames();

            aggregations = [];
            _.each(facets, function(aggName){
                if(aggName != 'dates'){
                    var totalCount = _.reduce(aggs[aggName].buckets, function(memo, bucket){
                        return memo + bucket.doc_count;
                    }, 0);
                    aggregations.push({
                        id: aggName,
                        name: availableAggregations[aggName].name,
                        terms: aggs[aggName].buckets,
                        totalCount: totalCount
                    });
                }
            });

            // If the active aggregations hasn't been set, or if it isn't in the aggragations
            // anymore (when changing collections, for example), set the active aggregation to
            // the first aggregation
            if(!this.model.get('activeAgg') || !(_.contains(aggregations, this.model.get('activeAgg')))){
                this.model.set('activeAgg', aggregations[0].id);
            }
            this.model.set('formattedAggregations', aggregations);
        },

        switchTab: function(e){
            e.preventDefault();
            var self = this;

            var targetTab = $(e.currentTarget).data('target');

            if (DEBUG) console.log('AggregationsView:switchTab Switch to \"' + targetTab + '\"');
            app.vent.trigger('Logging:clicks', {
                action: 'change_facet_tab',
                fromTab: this.model.get('activeAgg'),
                toTab: targetTab
            });

            // Switch the active tab
            this.$el.find('a[data-target="' + targetTab + '"]').tab('show');
            // Set the active tab
            this.model.set('activeAgg', targetTab);

            // Switch to the correct tab content
            this.$el.find('.tab-pane.active').removeClass('active');
            this.$el.find('.tab-' + targetTab).addClass('active');

            // Render content
            this.render();
        },

        toggleVisibility: function(){
            if (DEBUG) console.log('AggregationsView:toggleVisibility');

            if(this.is_visible){
                this.$el.hide();
                this.is_visible = false;
            }
            else {
                this.$el.show();
                this.is_visible = true;
            }

            return this;
        }
    });

    return AggregationsView;
});
