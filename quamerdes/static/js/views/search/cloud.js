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

                this.$el.html(_.template(cloudTemplate, {
                    facetName: tab,
                    scale: this.fontSizeScale,
                    terms: facet_values,
                    selectedFacets: this.selectedFacets,
                    faceted: this.faceted
                }));
            }

            this.$el.find('div.cloud a.facet').tooltip({
                placement: 'right'
            });

            return this;
        },

        filterOnFacet: function(e){
            e.preventDefault();
            var facet_value_el = $(e.target);
            var model = facet_value_el.data('model');
            var facet = facet_value_el.data('facet');
            var value = facet_value_el.data('value');

            var selected = facet_value_el.hasClass('selected');

            app.vent.trigger('Logging:clicks', {
                action: 'select_facet_value',
                query_instance: model,
                facet: facet,
                facet_value: value,
                value: selected ? false : true
            });

            if (!(this.faceted)){
                this.faceted = true;
            }

            if(selected){
                this.selectedFacets[facet].splice(
                    this.selectedFacets[facet].indexOf(value), 1
                );

                this.model.modifyFacetFilter(facet, value, false);
            }
            else {
                this.selectedFacets[facet].push(value);
                this.model.modifyFacetFilter(facet, value, true);
            }
        }
    });

    return FacetView;
});
