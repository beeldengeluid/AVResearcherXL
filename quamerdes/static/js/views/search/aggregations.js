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
            // this.aggregated = { q1: false, q2: false },
            var self = this;

            this.aggregations = {};
            this.aggregated = {};

            this.clouds = {};
            this.barcharts = {};

            this.selectedAggregations = {};
            this.activeTab = DEFAULT_AGGREGATIONS[0];

            this.representation = 'clouds';
            this.models = options.models;

            // Control visibility on init. Element is shown on first query.
            this.is_visible = true;
            app.vent.once('QueryInput:input', this.toggleVisibility, this);

            _.each(this.models, function(model, modelName){
                self.clouds[modelName] = new CloudView({
                    model: model,
                    name: modelName
                });
                self.barcharts[modelName] = new BarChartView({
                    model: model,
                    name: modelName
                });
            });

            _.each(this.models, function(model, modelName){
                model.on('change:aggregations', self.formatData, self);
            });

            _.each(DEFAULT_AGGREGATIONS, function(aggregation){
                self.aggregations[aggregation] = {name: AVAILABLE_AGGREGATIONS[aggregation].name};
            });
        },

        render: function(icon){
            if (DEBUG) console.log('AggregationsView:render');
            var self = this;

            this.$el.html(_.template(aggregationsTemplate, {
                aggregations: this.aggregations,
                activeTab: this.activeTab,
                representation: this.representation
            }));

            _.each(this.models, function(model, modelName){
                var tab = self[self.representation][modelName];
                tab.setElement(self.$el.find('div.tab-' + self.activeTab + ' div.' + modelName)).render(self.activeTab);
            });

            // Make sure the cloud boxes of Q1 and Q2 are of equal height
            var height = 0;
            this.$el.find('.tab-' + this.activeTab + ' .cloud').each(function(){
                var el_height = $(this).height();
                if(el_height > height){
                    height = el_height;
                }
            });
            this.$el.find('.tab-' + this.activeTab + ' .cloud').height(height);

            return this;
        },

        switchAggregationRepresentation: function(event){
            if (DEBUG) console.log('AggregationsView:switchAggregationRepresentation');
            var self = this;

            var clicked_rep = $(event.target);

            // Do nothing if we are already showing this representation
            if(clicked_rep.data('representation') == this.representation){
                return;
            }

            this.representation = clicked_rep.data('representation');
            this.render();
        },

        formatData: function(){
            if (DEBUG) console.log('AggregationsView:formatData');
            var self = this;
            var aggregations = {};

            _.each(DEFAULT_AGGREGATIONS, function(aggregation){
                aggregations[aggregation] = {};
                _.each(self.models, function(model){
                    if(model.get('aggregations')){
                        aggregations[aggregation][model.get('name')] = {};
                        _.each(model.get('aggregations')[aggregation].buckets, function(bucket){
                            aggregations[aggregation][model.get('name')][bucket.key] = bucket.doc_count;
                        });
                    }
                });
                if(_.keys(aggregations[aggregation]).length > 1){ // there is data for both search boxes
                    self.aggregations[aggregation]['data'] = {
                        // 'combined': {'terms': {}, totalCount: 0, maxCount: -Infinity},
                        'q1': {'terms': {}, totalCount: 0, maxCount: -Infinity},
                        'q2': {'terms': {}, totalCount: 0, maxCount: -Infinity}
                    };
                    var q1Aggregations = aggregations[aggregation].q1;
                    var q2Aggregations = aggregations[aggregation].q2;

                    _.each(q1Aggregations, function(count, term){
                        self.aggregations[aggregation].data.q1.terms[term] = count;
                        self.aggregations[aggregation].data.q1.totalCount += count;
                        if(q1Aggregations[term] > self.aggregations[aggregation].data.q1.maxCount) self.aggregations[aggregation].data.q1.maxCount = count;
                    });

                    _.each(q1Aggregations, function(count, term){
                        self.aggregations[aggregation].data.q2.terms[term] = count;
                        self.aggregations[aggregation].data.q2.totalCount += count;
                        if(q1Aggregations[term] > self.aggregations[aggregation].data.q2.maxCount) self.aggregations[aggregation].data.q2.maxCount = count;
                    });

                    // sum of aggregation counts
                    self.aggregations[aggregation].sumOfCounts = _.reduce(
                            _.values(
                                self.aggregations[aggregation].data
                            ).map(function(f){
                                return f.totalCount;
                            }), function(memo, num){
                                return memo + num;
                            }, 0); // zero is the initial state of the reduction (i.e. memo)
                }
                else {
                    var query_id = _.keys(aggregations[aggregation])[0];
                    self.aggregations[aggregation].data = {};
                    var totalCount = _.reduce(_.values(_.values(aggregations[aggregation])[0]), function(memo, num){ return memo + num; }, 0);
                    self.aggregations[aggregation].data[query_id] = {terms:
                        aggregations[aggregation][query_id],
                        totalCount: totalCount
                    };
                    self.aggregations[aggregation].sumOfCounts = totalCount;
                }
            });

            this.render();
        },

        switchTab: function(e){
            e.preventDefault();
            var self = this;

            var targetTab = $(e.currentTarget).data('target');

            if (DEBUG) console.log('AggregationsView:switchTab Switch to \"' + targetTab + '\"');
            app.vent.trigger('Logging:clicks', {
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
