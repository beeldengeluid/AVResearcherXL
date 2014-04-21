from flask.ext.script import Server, Manager, Command, Option
from quamerdes import app
from elasticsearch import Elasticsearch
from elasticsearch.helpers import bulk
import json
import logging
from quamerdes.settings import ES_SEARCH_HOST, ES_SEARCH_PORT

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


class LoadAVRDataToES(Command):

    """
    Load some test data
    """
    es = Elasticsearch(host=ES_SEARCH_HOST, port=ES_SEARCH_PORT)

    def run(self):
        with open('mappings/avresearcher_mapping.json', 'rb') as f:
            mapping = json.load(f)
            self.es.indices.create('avresearcher', body=mapping)

        with open('dumps/avresearcher.json', 'rb') as f:
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
                    data = {
                        'date': doc['_source']['immixDate']
                    }
                    if not doc.get('_source', {}).get('immixDate', None):
                        print doc
                        # print json.dumps(doc)
                        # print '=' * 80


                i += 1
                if i % 1000 == 0:
                    print 'Checked', i, 'documents'
                # if i > 2:
                #     break



manager = Manager(app)
manager.add_command('runserver', Server(host='0.0.0.0'))
manager.add_command('load_test_avr_data', LoadAVRDataToES())
manager.add_command('transform_avr_data', TransformAVRData())


if __name__ == '__main__':
    manager.run()
