define([
    'jquery',
    'underscore',
    'backbone',
    'app',
    'views/search/results_list',
    'views/search/paginator',
    'models/avrapi',
    'text!../../../templates/search/results_modal.html'
],
function($, _, Backbone, app, ResultsListView, PaginatorView, AvrApiModel, resultsModalTemplate){
    var ResultsModal = Backbone.View.extend({
        parent: $('body'),
        id: 'results_modal_container',
        events: {
            'click .close a': 'closeModal'
        },

        initialize: function(options){
            this.el = $(this.el);
            this.parent.append(this.el);

            this.model = new AvrApiModel(_.clone(options.currentQueryAttrs));

            var bucket_duration = {
               'year': 1000*60*60*24*365,
               'month': 1000*60*60*24*30,
               'week': 1000*60*60*24*7,
               'day': 1000*60*60*24
            };

            this.startPubDate = new Date(this.options.bucketStartDate);
            this.endPubDate = new Date(this.options.bucketStartDate + bucket_duration[this.model.get('interval')]);

            this.model.modalSearch(this.startPubDate, this.endPubDate);

            this.time_display_formats = {
                'year': d3.time.format('%Y'),
                'month': d3.time.format('%B %Y'),
                'week': d3.time.format('Week %W, %B %Y'),
                'day': d3.time.format('%A %B %e, %Y')
            };

            this.results_list = new ResultsListView({ model: this.model });
            this.pagination = new PaginatorView({ model: this.model });
            this.render();
        },

        render: function() {
            this.el.addClass(this.model.get('name'));
            this.$el.html(_.template(resultsModalTemplate)({
                query: this.model.get('queryString'),
                start: this.time_display_formats[this.model.get('interval')](new Date(this.startPubDate)),
                end: this.time_display_formats[this.model.get('interval')](new Date(this.endPubDate))
            }));
            this.$el.find('#results_modal').modal({
                keyboard: false,
                backdrop: 'static',
                show: true
            });

            this.results_list.setElement(this.$el.find('.hits')).render();
            this.pagination.setElement(this.$el.find('.pagination')).render();
        },

        closeModal: function() {
            this.$el.find('#results_modal').modal('hide');

            this.unbind();

            Backbone.View.prototype.remove.call(this);
        }
    });

    return ResultsModal;
});
