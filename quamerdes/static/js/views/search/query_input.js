define([
    'jquery',
    'underscore',
    'backbone',
    'app',
    'text!../../../templates/search/query_input.html'
],
function($, _, Backbone, app, queryInputTemplate){
    var QueryInputView = Backbone.View.extend({
        events: {
            'submit': 'searchOnEnter',
            'click i': 'changeSearchIndex'
        },

        initialize: function(){
            var self = this;
            this.selectedIndex = 'immix';
            this.listenTo(self, 'change:selectedIndex', this.searchIndex);
        },

        render: function(){
            this.$el.html(_.template(queryInputTemplate, {
                searchFields: AVAILABLE_INDICES,
                selectedIndex: this.selectedIndex
            }));

            this.$el.find('i').tooltip();
        },

        setIndex: function(selectedIndex){
            this.selectedIndex = selectedIndex;
            this.trigger('change:selectedIndex', selectedIndex);
        },

        searchIndex: function(){
            // Log change of index
            app.vent.trigger('Logging:clicks', {
                action: 'change_search_field',
                modelName: this.model.get('name'),
                field: this.selectedIndex
            });

            this.$el.find('i').removeClass('active');
            this.$el.find('i[data-index="' + this.selectedIndex + '"]').addClass('active');

            this.model.changeSearchIndex(this.selectedIndex);
        },

        changeSearchIndex: function(e){
            var available_fields = AVAILABLE_INDICES,
                target = $(e.target);

            // If the user clicks the currently selected index, do nothing
            if(target.hasClass(this.checkedField)) return;
            this.setIndex(target.data('index'));
        },

        searchOnEnter: function(e){
            e.preventDefault();
            var querystring = this.$('input').val().trim();

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
        }
    });

    return QueryInputView;
});
