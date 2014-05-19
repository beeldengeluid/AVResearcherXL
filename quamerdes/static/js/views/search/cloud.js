define([
    'jquery',
    'underscore',
    'backbone',
    'd3',
    'app',
    'text!../../../templates/search/cloud.html'
], function($, _, Backbone, d3, app, cloudTemplate){
    var CloudView = Backbone.View.extend({

        events: {
            'click a.aggregation': 'filterOnAggregation'
        },

        initialize: function(options){
            if (DEBUG) console.log('CloudView:' + this.model.get('name') + ':initialize');
            var self = this;

            this.selectedAggregations = {};
            this.aggregated = false;
            this.name = options.name;

            this.fontSizeScale = d3.scale.linear()
                .range([
                    MINIMUM_CLOUD_FONTSIZE,
                    MAXIMUM_CLOUD_FONTSIZE
                ]);

            // Reset selected aggregation values when the search button is clicked
            app.vent.on('QueryInput:input:' + this.name, function(){
                _.each(self.selectedAggregations, function(v, aggregation){
                    self.selectedAggregations[aggregation].length = 0;
                });
            });

            _.each(DEFAULT_AGGREGATIONS, function(aggregation){
                self.selectedAggregations[aggregation] = [];
            });

            return this;
        },

        render: function(){
            if (DEBUG) console.log('CloudView:' + this.model.get('name') + ':render');
            if(this.model.get('formattedAggregations') === undefined) return this;

            var self = this,
                aggregationValues = _.find(this.model.get('formattedAggregations'), function(aggVal){ return aggVal.id == self.model.get('activeAgg') ? true : false; });

            this.fontSizeScale.domain(d3.extent(aggregationValues.terms, function(d){ return d.doc_count; }));

            this.$el.html(_.template(cloudTemplate, {
                scale: this.fontSizeScale,
                aggregation: aggregationValues,
                selectedAggregationValues: this.selectedAggregations,
                modelName: this.name,
                aggregated: this.aggregated
            }));

            return this;
        },

        filterOnAggregation: function(e){
            e.preventDefault();
            var aggregation_value_el = $(e.target);
            var model = aggregation_value_el.data('model');
            var aggregation = aggregation_value_el.data('aggregation');
            var value = aggregation_value_el.data('value');

            var selected = aggregation_value_el.hasClass('selected');

            app.vent.trigger('Logging:clicks', {
                action: 'select_aggregation_value',
                query_instance: model,
                aggregation: aggregation,
                aggregation_value: value,
                value: selected ? false : true
            });

            if (!(this.aggregated)){
                this.aggregated = true;
            }

            if(selected){
                this.selectedAggregations[aggregation].splice(
                    this.selectedAggregations[aggregation].indexOf(value), 1
                );

                this.model.modifyAggregationFilter(aggregation, value, false);
            }
            else {
                this.selectedAggregations[aggregation].push(value);
                this.model.modifyAggregationFilter(aggregation, value, true);
            }
        }
    });

    return CloudView;
});
