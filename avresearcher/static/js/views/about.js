define([
    'jquery',
    'underscore',
    'backbone',
    'd3',
    'text!../../templates/about.html'
],
function($, _, Backbone, d3, aboutTemplate){
    var AboutView = Backbone.View.extend({
        parent: $('#main'),
        id: 'about',

        initialize: function(options){
            var self = this;

            this.el = $(this.el);
            this.parent.append(this.el);

            this.numberFormat = d3.format(',0f');
            this.dateFormat = d3.time.format('%e %B %Y');

            this.model.on('change:stats', this.renderIndexStats, this);

            for (var i = 0; i < ENABLED_COLLECTIONS.length; i++) {
                var coll = ENABLED_COLLECTIONS[i];
                this.model.getTotalDocCount(coll);
                this.model.getFirstLastDocDates(coll);
            }

            if (_.has(ENABLED_COLLECTIONS, 'immix')) {
                this.model.getImmixDocsWithSubtitleCount();
            }
            if (_.has(ENABLED_COLLECTIONS, 'kb')) {
                this.model.getKbDocsByTypeCount();
            }
        },

        render: function(){
            if (DEBUG) console.log('AboutView:render');

            this.$el.html(_.template(aboutTemplate));

            return this;
        },

        renderIndexStats: function(){
            if (DEBUG) console.log('AboutView:renderIndexStats');

            var self = this;
            var stats = this.model.get('stats');
            var stats_html = '';

            if (_.has(stats, 'immix')){
                stats_html += '<h2>iMMix</h2>';

                if (_.has(stats.immix, 'total_docs')){
                    stats_html += '<li><span>' + this.numberFormat(stats.immix.total_docs) + '</span> <em>broadcasts</em> are currently indexed</li>';
                }

                if (_.has(stats.immix, 'docs_with_subtitles')) {
                    stats_html += '<li><span>' + this.numberFormat(stats.immix.docs_with_subtitles) + '</span> broadcasts have <em>subtitles</em>';
                }

                if (_.has(stats.immix, 'publication_date_stats')) {
                    stats_html += '<li><span>' + this.dateFormat(new Date(stats.immix.publication_date_stats.min)) +'</span> is the date of the <em>first broadcast</em> in the index</li>';
                    stats_html += '<li><span>' + this.dateFormat(new Date(stats.immix.publication_date_stats.max)) +'</span> is the date of the <em>last broadcast</em> in the index</li>'
                }
            }

            if (_.has(stats, 'kb')){
                stats_html += '<h2>KB newspapers</h2>';

                if (_.has(stats.kb, 'total_docs')){
                    stats_html += '<li><span>' + this.numberFormat(stats.kb.total_docs) + '</span> <em>articles</em> are currently indexed</li>';
                }

                if (_.has(stats.kb, 'docs_by_type_count')){
                    _.each(stats.kb.docs_by_type_count, function(doc_type){
                        stats_html += '<li><span>' + self.numberFormat(doc_type.doc_count) + '</span> articles are of type <em>"' + doc_type.key + '"</em></li>';
                    });
                }

                if (_.has(stats.kb, 'publication_date_stats')) {
                    stats_html += '<li><span>' + this.dateFormat(new Date(stats.kb.publication_date_stats.min)) +'</span> is the date of the <em>first article</em> in the index</li>';
                    stats_html += '<li><span>' + this.dateFormat(new Date(stats.kb.publication_date_stats.max)) +'</span> is the date of the <em>last article</em> in the index</li>'
                }
            }

            this.$el.find('#collectionstats ul').html(stats_html);
        }
    });

    return AboutView;
});
