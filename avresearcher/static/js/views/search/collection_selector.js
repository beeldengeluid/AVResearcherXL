define([
    'jquery',
    'underscore',
    'backbone',
    'app',
    'text!../../../templates/search/collection_selector.html'
],
function($, _, Backbone, app, collectionSelectorTemplate){
    var CollectionSelectorView = Backbone.View.extend({
        events: {
            'click a': 'clickedCollection'
        },

        render: function(){
            if (DEBUG) console.log('CollectionSelectorView:render');

            this.$el.html(_.template(collectionSelectorTemplate)({
                enabledCollections: ENABLED_COLLECTIONS,
                collections: COLLECTIONS_CONFIG
            }));

            // On render, select the first enabled collection
            this.changeCollection(ENABLED_COLLECTIONS[0]);
        },

        changeCollection: function(collection) {
            if (DEBUG) console.log('CollectionSelectorView:changeCollection', collection);

            // Do nothing if the collection is already selected
            if (this.current_collection == collection) {
                return;
            }

            this.$el.find('a.selected').removeClass('selected');
            this.$el.find('a[data-collection="' + collection + '"]').addClass('selected');

            this.model.changeCollection(collection);

            this.current_collection = collection;
        },

        clickedCollection: function(e) {
            e.preventDefault();
            var collection = $(e.currentTarget).data('collection');
            if (DEBUG) console.log('CollectionSelectorView:clickedCollection', collection);
            this.changeCollection(collection);
        }
    });

    return CollectionSelectorView;
});
