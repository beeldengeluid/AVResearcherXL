from flask.ext.script import Server, Manager, Command, Option
from quamerdes import app
from elasticsearch import Elasticsearch
from elasticsearch.helpers import bulk
import glob
import json
import logging
import random
from quamerdes.settings import ES_SEARCH_HOST, ES_SEARCH_PORT
import zipfile
import pprint

logging.basicConfig(format='%(asctime)s %(levelname)s %(message)s')


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


def serialize_quamerdes(data):
    doc_id = data['_meta'].get('AVRID')
    with open('dumps/data/immix/%s.json' % doc_id, 'wb') as f:
        json.dump(data, f)


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

                    data['text'] = u' '.join([u' '.join(source.get(field, u''))
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
                        'AVRID': doc.get('_id')
                    }

                    serialize_quamerdes(data)

                i += 1
                if i % 1000 == 0:
                    print 'Processed', i, 'documents'


class LoadSampleKB(Command):

    es = Elasticsearch(host=ES_SEARCH_HOST, port=ES_SEARCH_PORT)

    def run(self):
        for item in random.sample(glob.glob('/Users/bart/Downloads/quamerdes/de-volkskrant/*.json'), 1000):
            with open(item, 'rb') as f:
                article = json.load(f)

            doc_id = item.split('/')[-1].split('.')[0]
            logging.debug('Indexing document %s' % doc_id)
            self.es.create(index='quamerdes_kb', doc_type='article', id=doc_id,
                           body=article)


manager = Manager(app)
manager.add_command('runserver', Server(host='0.0.0.0'))
manager.add_command('load_test_avr_data', LoadAVRDataToES())
manager.add_command('transform_avr_data', TransformAVRData())
manager.add_command('load_sample_kb', LoadSampleKB())


if __name__ == '__main__':
    manager.run()
