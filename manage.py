from flask.ext.script import Server, Manager, Command, Option
from quamerdes import app
from elasticsearch import Elasticsearch
from elasticsearch.helpers import bulk
import glob
import json
import logging
import random
import os
from quamerdes.settings import ES_SEARCH_HOST, ES_SEARCH_PORT
import zipfile
import tarfile
import cStringIO

logging.basicConfig(format='%(asctime)s %(levelname)s %(message)s')
logger = logging.getLogger('QuaMeRDES-management')
logger.setLevel(logging.DEBUG)

DATA = '/Users/bart/Desktop/quamerdes'


def getAVRDoc(line):
    line = line.strip()
    if not line.startswith('[') and not line.startswith(']'):
        if line.startswith(','):
            line = line[1:]
        try:
            doc = json.loads(line)
        except ValueError:
            print line
        else:
            return doc
    return None


def serialize_quamerdes(data, archive):
    doc_id = data['_meta'].get('resource_identifier')
    data = json.dumps(data)

    info = tarfile.TarInfo('immix/%s.json' % doc_id)
    info.size = len(data)

    archive.addfile(info, cStringIO.StringIO(data))
    logger.debug('Adding %s to archive' % doc_id)


class LoadAVRDataToES(Command):

    """
    Load some test data
    """
    es = Elasticsearch(host=ES_SEARCH_HOST, port=ES_SEARCH_PORT)

    def run(self):
        with open('mappings/avresearcher_mapping.json', 'rb') as f:
            mapping = json.load(f)
            self.es.indices.create('avresearcher', body=mapping)

        with zipfile.ZipFile('dumps/avresearcher.json.zip', 'rb') as f:
            docs = []
            i = 0
            for line in f:
                doc = getAVRDoc(line)
                if doc:
                    doc.pop('_score')
                    docs.append(doc)
                    i += 1

                # Send 500 docs to ES
                if len(docs) % 500 == 0:
                    logging.info('Index documents')
                    bulk(self.es, docs, stats_only=True)
                    docs = []

                if i > 2500:
                    break

            # Last docs
            bulk(self.es, docs, stats_only=True)


class TransformAVRData(Command):

    """
    Transform AVResearcher expressions to QuaMeRDES documents.
    """

    def get_options(self):
        return (
            Option('-d', '--dump', default='dumps/avresearcher.json',
                   dest='avrdump', ),
        )

    def run(self, avrdump):
        archive = tarfile.open(os.path.join(DATA, 'immix.tar.gz'), 'w:gz')
        with open(avrdump, 'rb') as f:
            i = 0
            for line in f:
                doc = getAVRDoc(line)
                if doc:
                    source = doc.get('_source', {})

                    data = {
                        'title': source.get('mainTitle', None),
                        'source': 'http://zoeken.beeldengeluid.nl/internet/in'
                                  'dex.aspx?chapterid=1164&contentid=7&verity'
                                  'ID=%s@expressies' % doc.get('_id')
                    }

                    broadcastdates = sorted(source.get('broadcastDates', []),
                                            key=lambda d: d['start'])

                    if broadcastdates:
                        data['date'] = broadcastdates[0]['start']
                    else:
                        data['date'] = None

                    data['text'] = u' '.join([u' '.join(source.get(field, u'')).replace('\n', ' ')
                                             for field in ['titles', 'mainTitle', 'summaries', 'descriptions']])
                    data['_meta'] = {
                        'broadcasters': source.get('broadcasters', []),
                        'broadcastdates': broadcastdates,
                        'categories': [{
                            'key': category.get('categoryKey'),
                            'value': category.get('categoryValue')
                        } for category in source.get('categories', [])],
                        'descriptions': source.get('descriptions', []),
                        'expressieID': source.get('expressieId'),
                        # Not entirely sure what this is; maybe the date the
                        # expression was added to iMMix?
                        'immixDate': source.get('immixDate'),
                        'levelTitles': [{
                            'title': title,
                            'level': level
                        } for level, title in source.get(
                            'levelTitles', {}).items()],
                        'mainTitle': source.get('mainTitle'),
                        'realisatieID': source.get('realisatieId'),
                        'reeksID': source.get('reeksId'),
                        'roles': [{
                            'key': role.get('roleKey'),
                            'value': role.get('roleValue'),
                            'playerName': role.get('rolePlayerName'),
                            'playerFunction': role.get('rolePlayerFunction')
                        } for role in source.get('roles', [])],
                        'subtitles': source.get('subtitles', []),
                        'summaries': source.get('summaries', []),
                        'titles': source.get('titles', []),
                        'werkID': source.get('werkID'),
                        'resource_identifier': doc.get('_id')
                    }

                    serialize_quamerdes(data, archive)

                i += 1
                if i % 1000 == 0:
                    print 'Processed', i, 'documents'
        archive.close()


class LoadSampleKB(Command):

    es = Elasticsearch(host=ES_SEARCH_HOST, port=ES_SEARCH_PORT)

    def run(self):
        for item in random.sample(glob.glob('/Users/bart/Downloads/quamerdes/de-volkskrant/*.json'), 1000):
            with open(item, 'rb') as f:
                article = json.load(f)

            doc_id = item.split('/')[-1].split('.')[0]
            logger.debug('Indexing KB document %s' % doc_id)
            self.es.create(index='quamerdes_kb', doc_type='article', id=doc_id,
                           body=article)


class LoadSampleImmix(Command):

    es = Elasticsearch(host=ES_SEARCH_HOST, port=ES_SEARCH_PORT)
    size = 1000

    def run(self):
        with tarfile.open(os.path.join(DATA, 'immix.tar.gz'), 'r:gz') as t:
            s = 0
            for member in t:
                if s == 1000:
                    break
                logger.debug('Extracting %s' % member.name)
                f = t.extractfile(member)

                logger.debug('Loaded %s' % member.name)
                expression = json.load(f)

                logger.info('Indexing iMMix document %s' % member.name)
                self.es.create(index='quamerdes_immix', doc_type='expression',
                               body=expression, id=member.name.split('/')[-1].split('.')[0])
                s += 1


manager = Manager(app)
manager.add_command('runserver', Server(host='0.0.0.0'))
manager.add_command('load_test_avr_data', LoadAVRDataToES())
manager.add_command('transform_avr_data', TransformAVRData())
manager.add_command('load_sample_kb', LoadSampleKB())
manager.add_command('load_sample_immix', LoadSampleImmix())


if __name__ == '__main__':
    manager.run()
