#!/usr/bin/env python
import logging
import json
import os
import re
import tarfile
from datetime import datetime
from glob import glob, iglob

import click
from elasticsearch import Elasticsearch
from elasticsearch.exceptions import TransportError
from elasticsearch.helpers import bulk

from avresearcher import create_app
from avresearcher.extensions import db
from avresearcher.settings import ES_SEARCH_CONFIG


logging.getLogger('elasticsearch').setLevel(logging.INFO)
logging.getLogger('urllib3').setLevel(logging.INFO)
logging.getLogger('elasticsearch.trace').setLevel(logging.DEBUG)

log_sh = logging.StreamHandler()
log_sh.setLevel(logging.DEBUG)
lg_formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s: %(message)s')
log_sh.setFormatter(lg_formatter)

logger = logging.getLogger('')
logger.setLevel(logging.DEBUG)
logger.addHandler(log_sh)

es_log = logging.getLogger('elasticsearch.trace')
es_log.addHandler(log_sh)
es_log.setLevel(logging.ERROR)

es = Elasticsearch(**ES_SEARCH_CONFIG)


@click.group()
def cli():
    pass


@cli.command()
@click.option('--host', default='0.0.0.0',
              help='Host to bind to, defaults to 0.0.0.0')
@click.option('--port', default=5000,
              help='Port of the development server, defaults to 5000')
def runserver(host, port):
    """Start a Flask development server"""
    app = create_app()
    app.run(host=host, port=port, use_reloader=True)


@cli.command()
def init_db():
    """Creates all required database tables"""
    app = create_app()

    with app.app_context():
        db.create_all()


@cli.group()
def elasticsearch():
    pass


@elasticsearch.command('put_template')
@click.argument('templ_file', type=click.File('rb'))
@click.argument('templ_name', default='avresearcher')
def es_put_template(templ_file, templ_name):
    """Upload template"""
    result = es.indices.put_template(name=templ_name, body=json.load(templ_file))

    if result['acknowledged']:
        click.echo('Added template %s' % templ_name)


@elasticsearch.command('delete_template')
@click.argument('templ_name', default='avresearcher')
def es_delete_template(templ_name):
    """Delete template"""
    result = es.indices.delete_template(name=templ_name)

    if result['acknowledged']:
        click.echo('Removed template %s' % templ_name)


@elasticsearch.command('create_indexes')
@click.argument('mapping_dir', type=click.Path(exists=True, file_okay=False,
                                               resolve_path=True))
@click.option('--mapping_prefix', default='mapping_',
              help='The prefix of the mapping files (default)')
def es_create_indexes(mapping_dir, mapping_prefix):
    """Create indexes for all mappings in a directory

    The default prefix of a mapping in 'mapping_dir' is 'mapping_'.
    """
    r_index_name = re.compile(r"%s(.*)\.json$" % mapping_prefix)
    for mapping_file_path in glob(os.path.join(mapping_dir, '%s*' % mapping_prefix)):
        index_name = r_index_name.findall(mapping_file_path)[0]

        click.echo('Creating ES index %s' % index_name)

        mapping_file = open(mapping_file_path, 'rb')
        mapping = json.load(mapping_file)
        mapping_file.close()

        try:
            es.indices.create(index=index_name, body=mapping)
        except TransportError as e:
            click.echo('Creation of ES index %s failed: %s' % (index_name, e))


@elasticsearch.command('index_collection')
@click.argument('name')
@click.argument('files', nargs=-1, type=click.Path(exists=True, resolve_path=True))
def es_index_collection(name, files):
    """Index a given collection

    NAME corresponds to the name of the Elasticsearch index, FILES should
    be one ore more files that contain the collection data.

    \b
    Currently NAME can take the following values:
    - avresearcher_immix
    - avresearcher_kb
    """
    if name == 'avresearcher_immix':
        item_getter = get_immix_items
    elif name == 'avresearcher_kb':
        item_getter = get_kb_items
    else:
        pass

    for f in files:
        actions = es_format_index_actions(name, 'item', item_getter(f))
        bulk(es, actions=actions)


def get_immix_items(archive_path):
    with tarfile.open(archive_path, 'r:gz') as tar:
        for immix_file in tar:
            f = tar.extractfile(immix_file)
            expression = json.load(f)
            doc_id = immix_file.name.split('/')[-1].split('.')[0].lstrip('_')

            # Skip items that don't include a date
            if not expression['date']:
                logger.warn('Skipping iMMix item %s, unknown date' % doc_id)
                continue
            else:
                yield doc_id, expression

            # The tarfile module places all extracted files as TarInfo
            # objects in the members list. We empty this list to prevent
            # running out of memory.
            tar.members = []


def get_kb_items(archive_path):
    min_date = datetime.strptime('1900-01-01', '%Y-%m-%d')
    publication_name = re.findall(r'.*\/(.*)\.tar.gz$', archive_path)[0]

    publications = {
        'de-tijd-de-maasbode': 'De Tijd / de Maasbode',
        'de-telegraaf': 'De Telegraaf',
        'nieuwsblad-van-het-noorden': 'Nieuwsblad van het Noorden',
        'leeuwarder-courant': 'Leeuwarder Courant',
        'de-waarheid': 'De Waarheid',
        'nieuwsblad-van-friesland-hepkemas-courant': 'Nieuwsblad van Friesland',
        'limburger-koerier-provinciaal-dagblad': 'Limburger koerier',
        'de-volkskrant': 'De Volkskrant',
        'de-tijd-de-maasbode': 'De Tijd De Maasbode'
    }

    publication_name = publications[publication_name]

    with tarfile.open(archive_path, 'r:gz') as tar:
        for kb_file in tar:
            f = tar.extractfile(kb_file)
            doc_id = kb_file.name.split('/')[-1].split('.')[0]

            logger.debug('Processing doc %s' % doc_id)

            article = json.load(f)
            article['meta'] = article.pop('_meta')
            article['meta']['publication_name'] = publication_name

            if not article['date']:
                logger.warn('Skipping KB item %s, unknown date' % doc_id)
                yield None
            else:
                article_date = datetime.strptime(article['date'], '%Y-%m-%d')
                if article_date < min_date:
                    logger.warn('Skipping KB item %s, date before %s'
                                % (doc_id, min_date.isoformat()))
                    yield None
                else:
                    yield doc_id, article

            tar.members = []


@cli.group()
def analyze_text():
    pass


@analyze_text.command()
@click.argument('role', type=click.Choice(['producer', 'consumer']))
@click.argument('file_path')
@click.argument('text_extractor')
@click.option('--socket_addr', default='tcp://127.0.0.1:5557')
def tokenize(role, file_path, socket_addr, text_extractor):
    from text_analysis import tasks

    if role == 'producer':
        tasks.tokenize_producer(socket_addr, file_path, text_extractor)
    else:
        tasks.tokenize_consumer(socket_addr, file_path)


@analyze_text.command()
@click.argument('analyzed_items_path')
@click.argument('dictionary_path')
def create_dictionary(analyzed_items_path, dictionary_path):
    from text_analysis import tasks

    print tasks.create_dictionary(analyzed_items_path, dictionary_path)


@analyze_text.command()
@click.argument('dictionaries_path')
@click.argument('merged_dictionary_path')
def merge_dictionaries(dictionaries_path, merged_dictionary_path):
    from text_analysis import tasks

    print tasks.merge_dictionaries(dictionaries_path, merged_dictionary_path)


@analyze_text.command()
@click.argument('src_dictionary_path')
@click.argument('dest_dictionary_path')
@click.option('--no_below', default=None, type=click.INT)
@click.option('--no_above', default=None, type=click.FLOAT)
@click.option('--keep_n', default=None, type=click.INT)
def prune_dictionary(src_dictionary_path, dest_dictionary_path, no_below,
                     no_above, keep_n):
    from text_analysis import tasks

    print tasks.prune_dictionary(src_dictionary_path, dest_dictionary_path,
                                 no_below, no_above, keep_n)


@analyze_text.command()
@click.argument('analyzed_items_path')
@click.argument('dictionary_path')
@click.argument('corpus_path')
def construct_corpus(analyzed_items_path, dictionary_path, corpus_path):
    from text_analysis import tasks

    corpus = tasks.Corpus(analyzed_items_path=analyzed_items_path,
                          dictionary_path=dictionary_path)
    corpus.construct_corpus(corpus_path)


@analyze_text.command()
@click.argument('corpus_path')
@click.argument('model_path')
def construct_tfidf_model(corpus_path, model_path):
    from text_analysis import tasks

    corpus = tasks.Corpus(corpus_path=corpus_path)
    corpus.construct_tfidf_model(model_path)


@analyze_text.command()
@click.argument('analyzed_items_path')
@click.argument('dictionary_path')
@click.argument('corpus_path')
@click.argument('model_path')
@click.argument('index')
@click.argument('field')
@click.argument('top_n_terms', type=click.INT)
def index_descriptive_terms(analyzed_items_path, dictionary_path, corpus_path,
                            model_path, index, field, top_n_terms):
    from text_analysis import tasks

    corpus = tasks.Corpus(analyzed_items_path, dictionary_path, corpus_path,
                          model_path)

    es_update_actions = corpus.descriptive_terms_es_actions(index, field,
                                                            top_n_terms)
    bulk(es, actions=es_update_actions, chunk_size=1000)


def es_format_index_actions(index_name, doc_type, item_iterable):
    for item in item_iterable:
        if not item:
            pass
        else:
            yield {
                '_index': index_name,
                '_type': doc_type,
                '_id': item[0],
                '_source': item[1]
            }


if __name__ == '__main__':
    cli()
