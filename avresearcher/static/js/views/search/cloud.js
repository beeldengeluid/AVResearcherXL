define([
    'jquery',
    'underscore',
    'backbone',
    'd3',
    'app',
    'text!../../../templates/search/cloud.html'
], function($, _, Backbone, d3, app, cloudTemplate){
    var FacetView = Backbone.View.extend({

        events: {
            'click a.facet': 'filterOnFacet'
        },

        initialize: function(options){
            if (DEBUG) console.log('CloudView:initialize');
            var self = this;
            
            this.fontSizeScale = d3.scale.linear()
                .range([
                    MINIMUM_CLOUD_FONTSIZE,
                    MAXIMUM_CLOUD_FONTSIZE
                ]);
        },

        render: function(tab, facet_values){
            if (DEBUG) console.log('CloudView:render');

            if(facet_values){
                this.fontSizeScale.domain(
                    d3.extent(facet_values, function(d){
                        return d[1];
                    })
                );

                this.$el.html(_.template(cloudTemplate)({
                    facetName: tab,
                    scale: this.fontSizeScale,
                    terms: facet_values,
                    selectedFacets: this.selectedFacets,
                    faceted: this.faceted
                }));
            }

            this.$el.find('div.cloud a.facet, div.cloud span.facet').tooltip({
                placement: 'right'
            });

            return this;
        },

        filterOnFacet: function(e){
            e.preventDefault();
            var facet_value_el = $(e.target);
            var facet = facet_value_el.data('facet');
            var value = facet_value_el.data('value');

            // app.vent.trigger('Logging:clicks', {
            //     action: 'select_facet_value',
            //     query_instance: model,
            //     facet: facet,
            //     facet_value: value,
            //     value: selected ? false : true
            // });
            console.log(facet_value_el.data());
            this.model.modifyQueryFilter(facet, value, true);
        }
    });

    return FacetView;
});
