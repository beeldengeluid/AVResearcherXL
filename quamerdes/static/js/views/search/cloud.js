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
            if (DEBUG) console.log('CloudView:' + options.name + ':initialize');
            var self = this;
            this.modelName = options.name;

            this.selectedAggregations = {},
            this.aggregated = false,

            this.fontSizeScale = d3.scale.linear()
                .range([
                    MINIMUM_CLOUD_FONTSIZE,
                    MAXIMUM_CLOUD_FONTSIZE
                ]);

            app.vent.on('QueryInput:input:' + this.modelName, function(){
                _.each(DEFAULT_AGGREGATIONS, function(aggregation){
                    // Reset selected aggregation values when the search button is clicked
                    self.selectedAggregations[aggregation].length = 0;
                });
            });

            _.each(DEFAULT_AGGREGATIONS, function(aggregation){
                self.selectedAggregations[aggregation] = [];
            });
        },

        render: function(tab){
            if (DEBUG) console.log('CloudView:' + this.modelName + ':render');

            var aggregationValues = this.model.get('aggregations');

            if(aggregationValues && tab){
                console.log(tab);
                this.fontSizeScale.domain(
                    d3.extent(aggregationValues[tab].terms, function(d){
                        return d.count;
                    })
                );
                this.$el.html(_.template(cloudTemplate, {
                    aggregationName: tab,
                    modelName: this.modelName,
                    scale: this.fontSizeScale,
                    terms: aggregationValues[tab].terms,
                    selectedAggregations: this.selectedAggregations,
                    aggregated: this.aggregated
                }));
            }

            this.$el.find('div.cloud a.aggregation').tooltip({
                placement: 'right'
            });

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
