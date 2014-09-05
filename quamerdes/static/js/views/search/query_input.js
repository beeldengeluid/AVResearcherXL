define([
    'jquery',
    'underscore',
    'backbone',
    'app',
    'views/search/fields',
    'text!../../../templates/search/query_input.html'
],
function($, _, Backbone, app, FieldsView, queryInputTemplate){
    var QueryInputView = Backbone.View.extend({
        events: {
            'submit': 'searchOnEnter',
            'focus input.query': 'focusOnInput',
            'focusout input.query': 'focusOnInput',
            'click .input-container': 'focus',
            'click .clear-query a': 'clearQuery'
        },

        initialize: function(options){
            this.fields = new FieldsView({ model: this.model });

            this.model.on('change:loading', this.toggleLoadingIndicator, this);
            this.model.on('change:loading', this.showNoResultsWarning, this);
        },

        render: function(){
            this.$el.html(_.template(queryInputTemplate));
            this.fields.setElement(this.$el.find('.fields')).render();
        },

        searchOnEnter: function(e){
            e.preventDefault();
            var querystring = this.$('input.query').val().trim();

            // Also log empty query strings
            app.vent.trigger('Logging:clicks', {
                action: 'submit_query',
                modelName: this.model.get('name'),
                collection: this.model.get('collection'),
                querystring: querystring
            });

            app.vent.trigger('QueryInput:input');
            app.vent.trigger('QueryInput:input:' + this.model.get('name'));

            // Only search if actual terms were entered
            if(!querystring){
                return;
            }

            // Remove the 'zero results warning' if it is still visible
            this.$el.find('.no-results').remove();

            this.model.freeTextQuery(querystring);
        },

        focus: function(e) {
            this.$el.find('input.query').focus();
        },

        focusOnInput: function(e){
            if (e.type === 'focusin') {
                this.$el.find('.input-container').addClass('focussed');
            }
            else {
                this.$el.find('.input-container').removeClass('focussed');
            }
        },

        clearQuery: function(e){
            if (DEBUG) console.log('QueryInputView:clearQuery');

            e.preventDefault();

            // Perform a new query with an empty qs
            this.model.freeTextQuery('');

            // Clear the input text
            this.$('input.query').val('');
        },

        toggleLoadingIndicator: function() {
            if (this.model.get('loading')) {
                this.$el.find('.loading').show();
            } else {
                this.$el.find('.loading').hide();
            }
        },

        showNoResultsWarning: function() {
            if (this.model.get('loading') === false && this.model.get('totalHits') === 0) {
                var warning = $('<div class="no-results alert alert-warning"><strong>No results!</strong> There are no documents in the collection that match your query.</div>');
                this.$el.append(warning);
                warning.fadeIn('fast', function() {
                    setTimeout(function() {
                        warning.fadeOut('fast', function() {
                            warning.remove();
                        });
                    }, 1700);
                });
            }
        }
    });

    return QueryInputView;
});
