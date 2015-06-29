define([
    'jquery',
    'underscore',
    'backbone',
    'd3',
    'app',
    'views/search/results_modal'
],
function($, _, Backbone, d3, app, ResultsModal){
    var TimeseriesView = Backbone.View.extend({
        initialize: function(options) {
            this.ts_chart = this.chart();
            this.chart_width = 900;
            this.current_interval = null;
            this.current_frequency = 'absolute';

            this.time_display_formats = {
                'year': d3.time.format('%Y'),
                'month': d3.time.format('%B %Y'),
                'week': d3.time.format('Week %W, %B %Y'),
                'day': d3.time.format('%A %B %e, %Y')
            };

            this.y_axis_percentage_format = d3.format('.2%');

            // HACK HACK HACK
            // Previously this attribute magically appeared on the object...
            this.options = options;

            var self = this;
            _.each(this.options.models, function(model, name) {
                model.on('change:aggregations',  self.determineInterval, self);
                model.on('change:dateHistogram', self.updateTimeseries, self);
                model.on('change:ftQuery', self.updateLegend, self);
                model.on('change:totalHits', self.updateLegend, self);
                model.on('change:totalHits', self.graphVisibility, self);
            });

            app.vent.on('changeview:TimeseriesView', this.swithFrequency, this);
        },

        graphVisibility: function() {
            var show = false;
            _.each(this.options.models, function(model, name) {
                if (model.get('totalHits') > 0) {
                    show = true;
                }
            });

            if (show) {
                this.$el.removeClass('hidden');
            } else {
                this.$el.addClass('hidden');
            }
        },

        determineInterval: function() {
            if (DEBUG) console.log('TimeSeriesView:determineInterval');

            // Get the min/max dates stats from the models
            var dates_stats = [];
            _.each(this.options.models, function(model, name) {
                var aggs = model.get('aggregations');
                if (aggs && 'dates_stats' in aggs) {
                    dates_stats.push(aggs.dates_stats);
                }
            });

            // Find the absolute min and max dates among the models
            var range_min = d3.min(dates_stats, function(stats) { return stats.min; });
            var range_max = d3.max(dates_stats, function(stats) { return stats.max; });
            
            // The number of miliseconds between the min and max values
            var range_length = range_max - range_min;

            // Estimated 'duration' (in ms) of possible intervals
            var available_intervals = [
                ['year', 1000*60*60*24*365],
                ['month', 1000*60*60*24*30],
                ['week', 1000*60*60*24*7],
                ['day', 1000*60*60*24]
            ];

            var selected_interval_size = null;
            $.each(available_intervals, function(i, interval) {
                // Calculate the estimated max. number of intervals for this
                // interval size
                var n_intervals = (range_length / interval[1]);
                
                // Select the current interval size if the estimated number of
                // buckets fit in the current graph
                if (n_intervals <= 650) {
                    selected_interval_size = interval[0];
                } else {
                    // Stop iterating when we found the right interval
                    return false;
                }
            });

            _.each(this.options.models, function(model) {
                var aggs = model.get('aggregations');
                if (aggs && 'dates_stats' in aggs) {
                    model.getDateHistogram(selected_interval_size);
                }
            });

            this.current_interval = (selected_interval_size === null) ? 'year' : selected_interval_size;
        },

        render: function() {
            if (DEBUG) console.log('TimeSeriesView:render');
            this.$el.html('<div class="legend"></div><div class="graph"></div>');

            this.legend = this.$el.find('.legend');
            this.chart_width = this.$el.width();
        },

        updateLegend: function(e) {
            var self = this;

            _.each(this.options.models, function(model, name) {
                var legend_item = self.legend.find('.legend-item.' + name);

                if (legend_item.length === 0) {
                    self.legend.append('<div class="legend-item '+ name +'"></div>');
                    legend_item = self.legend.find('.legend-item.' + name);
                }

                var query = model.get('ftQuery');
                var count = model.get('totalHits');

                if (query) {
                    legend_item[0].innerHTML = '<div class="linecolor"></div>' + model.get('ftQuery') + ' <span class="count">(' + model.get('totalHits') + ')</span>';
                }
                else {
                    legend_item[0].innerHTML = '';
                }
            });
        },

        updateTimeseries: function(e) {
            if (DEBUG) console.log('TimeSeriesView:updateTimeseries');

            var self = this;
            var histograms = {};
            var dates = [];
            $.each(this.options.models, function(name, model) {
                var global_date_histogram = model.get('globalDateHistogram');
                if (global_date_histogram) {
                    histograms[name] = {
                        'global_date_histogram': {},
                        'date_histogram': {}
                    };
                    
                    _.each(global_date_histogram.buckets, function(bucket) {
                        histograms[name].global_date_histogram[bucket.key] = bucket.doc_count;
                    });

                    var date_histogram = model.get('dateHistogram');
                    _.each(date_histogram.buckets, function(bucket) {
                        histograms[name].date_histogram[bucket.key] = bucket.doc_count;
                    });

                    dates = _.union(dates, _.keys(histograms[name].global_date_histogram));
                }
            });
            dates = _.sortBy(dates, function(num){ return parseInt(num); });

            var data = [];
            $.each(this.options.models, function(name, model) {
                if (name in histograms) {
                    var model_data = {
                        name: name,
                        buckets: []
                    };
                    _.each(dates, function(date) {
                        var bucket = {
                            x: parseInt(date),
                            y: 0,
                            total: 0,
                            found: 0,
                            rel: 0,
                            model: name
                        };

                        if (date in histograms[name].global_date_histogram) {
                            bucket.total = histograms[name].global_date_histogram[date];
                            bucket.found = histograms[name].date_histogram[date];
                            bucket.rel = bucket.found / bucket.total;

                            if (isNaN(bucket.rel)) {
                                bucket.rel = 0;
                            }

                            if (self.current_frequency == 'absolute') {
                                bucket.y = bucket.found;
                            }
                            else {
                                bucket.y = bucket.rel;
                            }
                        }

                        model_data.buckets.push(bucket);
                    });
                    data.push(model_data);
                }
            });

            d3.select('#timeseries .graph').datum(data).call(this.ts_chart);
        },

        swithFrequency: function(frequency) {
            if (DEBUG) console.log('TimeseriesView:swithFrequency', frequency);

            // Do nothing if graph is already renered with the clicked freq. setting
            if (this.current_frequency == frequency) {
                return;
            }

            this.current_frequency = frequency;
            this.updateTimeseries();
        },

        chart: function(selection) {
            var margin = { top: 10, right: 10, bottom: 50, left: 70 },
                width = 1100,
                height = 340,
                xScale = d3.time.scale(),
                yScale = d3.scale.linear(),
                xAxis = d3.svg.axis().scale(xScale).orient('bottom').tickSize(10, 0).tickPadding(10).ticks(13),
                yAxis = d3.svg.axis().scale(yScale).orient('left').tickPadding(5).ticks(10),
                line = d3.svg.line().x(X).y(Y).interpolate('monotone');
                self = this;

            function chart(selection) {
                selection.each(function(data) {
                    var minX = new Date(d3.min(data, function(d) {
                        return d3.min(d.buckets, function (b) {
                            return b.x;
                        });
                    }));
                    var maxX = new Date(d3.max(data, function(d) {
                        return d3.max(d.buckets, function (b) {
                            return b.x;
                        });
                    }));
                    var maxY = d3.max(data, function(d) {
                        return d3.max(d.buckets, function (b) {
                            return b.y;
                        });
                    });

                    if (maxY === undefined) {
                        minX = null;
                        maxX = null;
                        maxY = null;
                    }

                    // Update scales and axes
                    xScale
                        .domain([minX, maxX])
                        .range([0, width - margin.left - margin.right]);
                    yScale
                        .domain([0, maxY])
                        .range([height - margin.top - margin.bottom, 0]);
                    xAxis
                        .tickSize(-height + margin.top + margin.bottom, 0);
                    
                    if (self.current_frequency === 'absolute') {
                        yAxis
                            .tickSize(-width + margin.left + margin.right, 0)
                            .tickFormat(function(tick) {return tick; });
                    }
                    else if (self.current_frequency == 'relative') {
                        yAxis
                            .tickSize(-width + margin.left + margin.right, 0)
                            .tickFormat(function(tick){ return self.y_axis_percentage_format(tick); });
                    }

                    // Select SVG element, if it exists
                    var svg = d3.select(this).selectAll('svg').data([data]);

                    // Otherwise create the chart skeleton
                    var gEnter = svg.enter().append('svg').append('g').attr('class', 'inner');
                    gEnter.append('g').attr('class', 'axis x');
                    gEnter.append('g').attr('class', 'axis y');
                    gEnter.append('g').attr('class', 'lines');

                    // Add axis labels
                    gEnter.append('text')
                        .attr('class', 'label x')
                        .attr('text-anchor', 'middle')
                        .attr('dy', '.65em')
                        .attr('x', (width - margin.left - margin.right) / 2)
                        .attr('y', yScale.range()[0] + 37)
                        .text('Publication date');
                    gEnter.append('text')
                        .attr('class', 'label y')
                        .attr('text-anchor', 'middle')
                        .attr('dy', '.65em')
                        .attr("transform", "rotate(-90)")
                        .attr('x', -((height - margin.top - margin.bottom) / 2))
                        .attr('y', -65);

                    // Update the text of the y-axis label to include the correct interval name
                    svg.select('text.label.y').text('Hits per ' + self.current_interval);

                    // Update outer dimensions
                    svg.attr('width', width)
                       .attr('height', height);

                    // Update inner dimensions
                    var g = svg.select('g')
                        .attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');

                    var line_group = svg.select('g.lines').selectAll('g.linegroup').data(data, function(d){ return d.name; });
                    var line_groupEnter = line_group.enter().append('g')
                        .attr('class', function(d) { return 'linegroup ' + d.name; });

                    //var lines = line_group.selectAll('.line').data(data, function(d){ return d.name; });
                    var lines = line_group.selectAll('path').data(function(d) { return [d]; }, function(d) { return d.name; });
                    
                    // Update existing lines
                    lines.transition()
                        .attr('d', function(d){ return line(d.buckets); })
                        .attr('stroke-dashoffset', null)
                        .attr('stroke-dasharray', null);
                    
                    // Add new lines
                    var linesEnter = lines.enter().append('path')
                        .attr('class', function(d) { return d.name; })
                        .attr('d', function(d){
                            return line(d.buckets);
                        })
                        .attr('stroke-dasharray', function(){ var length = this.getTotalLength(); return length + ' ' + length; })
                        .attr('stroke-dashoffset', function(){ return this.getTotalLength(); })
                      .transition()
                        .delay(100)
                        .duration(600)
                        .ease('quad-in-out')
                        .attr('stroke-dashoffset', 0);

                    var circles = line_group.selectAll('circle').data(function(d){ return d.buckets; }, function(d, i){ return i; });

                    // Update existing circles
                    circles
                        .attr('data-original-title', tooltipData)
                      .transition()
                        .attr('r', 2.4)
                        .attr('cx', X)
                        .attr('cy', Y)
                      .transition()
                        .delay(750)
                        .attr('opacity', 1);

                    // Add new circles
                    circles.enter()
                      .append('circle')
                        .attr('opacity', 0)
                        .attr('data-original-title', tooltipData)
                        .attr('data-has-hits', function(d){
                            if (d.found > 0) {
                                return 'true';
                            } else {
                                return 'false';
                            }
                        })
                        .on('mouseover', function(d){
                            d3.select(this).transition()
                                .ease('quad-in-out')
                                .attr('r', 6);
                        })
                        .on('mouseout', function(){
                            d3.select(this).transition()
                                .ease('quad-in-out')
                                .attr('r', 2.4);
                        })
                        .on('click', function(d) {
                            if (d.found > 0) {
                                new ResultsModal({
                                    currentQueryAttrs: self.options.models[d.model].attributes,
                                    bucketStartDate: d.x
                                });
                            }
                        })
                      .transition()
                        .attr('r', 2.4)
                        .attr('cx', X)
                        .attr('cy', Y)
                      .transition()
                        .delay(750)
                        .attr('opacity', 1);

                    g.select('.x.axis')
                        .attr('transform', 'translate(0,' + yScale.range()[0] + ')')
                        .transition()
                        .call(xAxis);

                    g.select('.y.axis')
                        .transition()
                        .call(yAxis);
                    
                    lines.exit()
                      .transition()
                        .duration(500)
                        .ease('quad-in-out')
                        .style('opacity', 0)
                        .remove();
                    
                    circles.exit()
                      .transition()
                        .duration(1000)
                        .ease('quad-in-out')
                        .style('opacity', 0)
                        .remove();

                    line_group.exit().remove();

                });
            }

            // The x-accessor for the path generator; xScale(xValue)
            function X(d) {
                return xScale(d.x);
            }

            // The x-accessor for the path generator; yScale(yValue)
            function Y(d) {
                return yScale(d.y);
            }

            function tooltipData(d) {
                self.$el.find(this).tooltip({ container: 'div#timeseries', html: true });
                var text = self.time_display_formats[self.current_interval](new Date(d.x)) + '<br />';
                if (self.current_frequency == 'absolute') {
                    if (d.found === 1) {
                        text += '1 hit';
                    } else {
                        text += d.found + ' hits';
                    }
                } else {
                    text += +(d.rel * 100).toFixed(2) + '% (' + d.found + ' of ' + d.total + ' hits)';
                }

                return text;
            }

            chart.margin = function(val) {
                if (!arguments.length) return margin;
                margin = val;
                return chart;
            };

            chart.width = function(val) {
                if (!arguments.length) return width;
                width = val;
                return chart;
            };

            chart.height = function(val) {
                if (!arguments.length) return height;
                height = val;
                return chart;
            };

            return chart;
        }
    });

    return TimeseriesView;
});
