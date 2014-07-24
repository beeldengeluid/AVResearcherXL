define([
    'jquery',
    'underscore',
    'backbone',
    'app',
    'text!../../../templates/search/fields.html'
],
function($, _, Backbone, app, fieldsTemplate) {
    var FieldsView = Backbone.View.extend({
        events: {
            'click :checkbox': 'updateSelectedFields',
            'click a.toggle-menu': 'toggleMenu'
        },

        initialize: function(options) {
            this.model.on('change:collection', this.render, this);
        },

        render: function() {
            if (DEBUG) console.log('FieldsView:render');

            var collection = this.model.get('collection');

            this.$el.html(_.template(fieldsTemplate, {
                enabled_fields: this.model.get('enabledSearchFields'),
                available_fields: COLLECTIONS_CONFIG[collection].available_search_fields
            }));

            this.menu = this.$el.find('.dropdown');
            this.toggle_button = this.$el.find('a.toggle-menu');
        },

        toggleMenu: function(e) {
            if (DEBUG) console.log('FieldsView:toggleMenu');
            
            e.preventDefault();

            if (!this.menu.hasClass('open')) {
                $('<div class="dropdown-backdrop"/>').insertAfter(this.$el).on('click', $.proxy(this.toggleMenu, this));
            }
            else {
                this.$el.parent().find('.dropdown-backdrop').remove();
            }

            this.menu.toggleClass('open');
        },

        updateSelectedFields: function(e) {
            if (DEBUG) console.log('FieldsView:updateSelectedFields');

            var checkbox = $(e.target);

            if (checkbox.is(':checked')) {
                this.model.changeEnabledSearchFields(checkbox.val(), true);
            }
            else {
                this.model.changeEnabledSearchFields(checkbox.val(), false);
            }
        }
    });

    return FieldsView;
});