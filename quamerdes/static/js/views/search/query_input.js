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
        },

        render: function(){
            this.$el.html(_.template(queryInputTemplate));
            this.fields.setElement(this.$el.find('.fields')).render();
        },

        searchOnEnter: function(e){
            e.preventDefault();
            var querystring = this.$('input.query').val().trim();

            // Also log empty querystrings
            app.vent.trigger('Logging:clicks', {
                action: 'submit_query',
                modelName: this.model.get('name'),
                querystring: querystring
            });

            app.vent.trigger('QueryInput:input');
            app.vent.trigger('QueryInput:input:' + this.model.get('name'));

            // Only search if actual terms were entered
            if(!querystring){
                return;
            }

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
        }
    });

    return QueryInputView;
});
