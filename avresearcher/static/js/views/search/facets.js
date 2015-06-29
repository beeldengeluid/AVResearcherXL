define([
    'jquery',
    'underscore',
    'backbone',
    'd3',
    'app',
    'views/search/cloud',
    'views/search/barchart',
    'text!../../../templates/search/facets.html'
],
function($, _, Backbone, d3, app, CloudView, BarChartView, facetsTemplate){
    var FacetsView = Backbone.View.extend({
        events: {
            'click a.nav-tab': 'switchTab'
        },

        initialize: function(options){
            if (DEBUG) console.log('FacetsView:initialize');

            this.activeTab = null;

            this.representation = 'cloud';
            this.cloud = new CloudView({model: this.model});
            this.barchart = new BarChartView({model: this.model, name: options.name });

            // Only show the facets when there are hits to be displayed
            this.model.on('change:totalHits', function() {
                var hits = this.model.get('totalHits');
                if (hits === 0) {
                    this.$el.addClass('hidden');
                }
                else {
                    this.$el.removeClass('hidden');
                }
            }, this);

            this.model.on('change:collection', this.render, this);
            this.model.on('change:aggregations', this.updateFacetValues, this);
            app.vent.on('changeview:FacetsView', this.swithFacetRepresentation, this);
        },

        render: function() {
            if (DEBUG) console.log('FacetsView:render');

            var self = this;
            
            var collection = this.model.get('collection');
            var tabs = {};

            _.each(COLLECTIONS_CONFIG[collection].enabled_facets, function(facet){
                var agg_specs = COLLECTIONS_CONFIG[collection].available_aggregations[facet];
                tabs[facet] = {
                    name: agg_specs.name,
                    description: agg_specs.description
                };
            });

            // If the currently selected tab does not exist (or is null),
            // make the first available tab the selected tab
            if (!(this.activeTab in tabs)) {
                this.activeTab = _.keys(tabs)[0];
            }

            var facet_values = [];
            var filters = this.model.get('filters');
            var aggregations = this.model.get('aggregations');
            if (aggregations && this.activeTab in aggregations) {
                var buckets;
                if ('buckets_path' in COLLECTIONS_CONFIG[collection].available_aggregations[this.activeTab]) {
                    buckets = this.get_property_by_path(aggregations[this.activeTab], COLLECTIONS_CONFIG[collection].available_aggregations[this.activeTab].buckets_path);
                }
                else {
                    buckets = aggregations[this.activeTab].buckets;
                }


                _.each(buckets, function(aggregation) {
                    var active_filter = false;

                    if (self.activeTab in filters && filters[self.activeTab].values.indexOf(aggregation.key) != -1) {
                        active_filter = true;
                    }

                    facet_values.push([aggregation.key, aggregation.doc_count, active_filter]);
                });
            }

            this.$el.html(_.template(facetsTemplate)({
                tabs: tabs,
                active_tab: this.activeTab
            }));

            if (this.representation == 'cloud') {
                this.cloud.setElement(this.$el.find('div.tab-' + this.activeTab)).render(this.activeTab, facet_values);
            }
            else if (this.representation == 'barchart') {
                this.barchart.setElement(this.$el.find('div.tab-' + this.activeTab)).render(this.activeTab, facet_values);
            }
        },

        updateFacetValues: function() {
            if (DEBUG) console.log('FacetsView:updateFacetValues');
            this.render();
        },

        switchTab: function(e) {
            e.preventDefault();
            
            var targetTab = $(e.currentTarget).data('target');

            if (DEBUG) console.log('FacetsView:switchTab Switch to \"' + targetTab + '\"');
            
            app.vent.trigger('Logging:clicks', {
                modelName: this.model.get('name'),
                action: 'change_facet_tab',
                fromTab: this.activeTab,
                toTab: targetTab
            });

            // Switch the active tab
            this.$el.find('a[data-target="' + targetTab + '"]').tab('show');
            
            // Set the active tab
            this.activeTab = targetTab;

            // Switch to the correct tab content
            this.$el.find('.tab-pane.active').removeClass('active');
            this.$el.find('.tab-' + targetTab).addClass('active');

            // Render content
            this.render();
        },

        swithFacetRepresentation: function(representation){
            if (DEBUG) console.log('FacetsView:swithFacetRepresentation');

            // Do nothing if we are already showing this representation
            if(representation == this.representation){
                return;
            }

            this.representation = representation;
            this.render();
        },

        get_property_by_path: function(obj, path){
            var arr = path.split('.');
            
            for(var i = 0; i < arr.length; i++){
                if(obj) {
                    obj = obj[arr[i]];
                }
            }
            
            return obj;
        }
    });
    
    return FacetsView;
});
