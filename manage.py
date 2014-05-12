from flask.ext.script import Server, Manager, Command, Option, prompt, prompt_pass
from quamerdes import app
from elasticsearch import Elasticsearch
from elasticsearch.exceptions import NotFoundError
from elasticsearch.helpers import bulk
import glob
import json
import logging
import random
import os
from quamerdes.settings import ES_SEARCH_HOST, ES_SEARCH_PORT
from quamerdes.models import User
from quamerdes.views import bcrypt
from quamerdes import db

import zipfile
import tarfile
import cStringIO

logging.basicConfig(format='%(asctime)s %(levelname)s %(message)s')
logger = logging.getLogger('QuaMeRDES-management')
logger.setLevel(logging.DEBUG)


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
    doc_id = data['meta'].get('record_identifier')
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

    def run(self, avrdump, datadir='/Users/bart/Desktop/quamerdes'):
        archive = tarfile.open(os.path.join(datadir, 'immix.tar.gz'), 'w:gz')
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
                    data['meta'] = {
                        'broadcasters': source.get('broadcasters', []),
                        'broadcastdates': broadcastdates,
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
                        'subtitles': source.get('subtitles', []),
                        'summaries': source.get('summaries', []),
                        'titles': source.get('titles', []),
                        'werkID': source.get('werkID'),
                        'record_identifier': doc.get('_id')
                    }

                    for category in source.get('categories', []):
                        key = category.get('categoryKey')
                        value = category.get('categoryValue')
                        if key not in data['meta']:
                            data['meta'][key] = [value]
                        else:
                            data['meta'][key].append(value)

                    for role in source.get('roles', []):
                        key = role.get('roleKey')
                        value = role.get('roleValue')
                        if key not in data['meta']:
                            data['meta'][key] = [value]
                        else:
                            data['meta'][key].append(value)

                    serialize_quamerdes(data, archive)

                i += 1
                if i % 1000 == 0:
                    print 'Processed', i, 'documents'
        archive.close()


class LoadSampleKB(Command):

    es = Elasticsearch(host=ES_SEARCH_HOST, port=ES_SEARCH_PORT)

    def run(self, datadir='/Users/bart/Desktop/quamerdes', sample_size=1000):
        with tarfile.open(os.path.join(datadir, 'de-volkskrant.tar.gz'), 'r:gz') as t:
            s = 0
            for member in t:
                if s == sample_size:
                    break
                logger.debug('Extracting %s' % member.name)
                f = t.extractfile(member)

                logger.debug('Loaded %s' % member.name)
                article = json.load(f)

                logger.info('Indexing KB article %s' % member.name)
                self.es.create(index='quamerdes_kb1', doc_type='item',
                               body=article, id=member.name.split('/')[-1].split('.')[0])

                s += 1


class LoadSampleImmix(Command):

    es = Elasticsearch(host=ES_SEARCH_HOST, port=ES_SEARCH_PORT)

    def run(self, datadir='/Users/bart/Desktop/quamerdes', sample_size=1000):
        with tarfile.open(os.path.join(datadir, 'immix.tar.gz'), 'r:gz') as t:
            s = 0
            for member in t:
                if s == sample_size:
                    break
                logger.debug('Extracting %s' % member.name)
                f = t.extractfile(member)

                logger.debug('Loaded %s' % member.name)
                expression = json.load(f)

                logger.info('Indexing iMMix document %s' % member.name)
                self.es.create(index='quamerdes_immix1', doc_type='item',
                               body=expression, id=member.name.split('/')[-1].split('.')[0])
                s += 1


class CreateAliases(Command):

    es = Elasticsearch(host=ES_SEARCH_HOST, port=ES_SEARCH_PORT)

    def run(self):
        self.es.indices.put_alias(index='quamerdes_kb1', name='quamerdes_kb')
        self.es.indices.put_alias(index='quamerdes_immix1', name='quamerdes_immix')


class PutSettingsAndMappings(Command):

    es = Elasticsearch(host=ES_SEARCH_HOST, port=ES_SEARCH_PORT)
    indices = ['quamerdes_kb', 'quamerdes_immix']

    def run(self):
        with open('mappings/quamerdes_template.json', 'rb') as f:
            quamerdes_template = json.load(f)

        self.es.indices.put_template(name='quamerdes', body=quamerdes_template)

        for index in self.indices:
            with open('mappings/%s.json' % index, 'rb') as f:
                mapping = json.load(f)
            logger.info('Creating %s' % index)
            self.es.indices.create(index='%s1' % index, body=mapping)


class DeleteIndices(Command):

    es = Elasticsearch(host=ES_SEARCH_HOST, port=ES_SEARCH_PORT)

    def run(self):
        try:
            logger.info('Deleting indices')
            self.es.indices.delete(index='quamerdes_kb1,quamerdes_immix1')
        except NotFoundError:
            logger.info('Indices already deleted')


class InitTestEnv(Command):

    option_list = (
        Option('--data', '-d', dest='datadir', default='/Users/bart/Desktop/quamerdes'),
        Option('--samplesize', '-s', dest='sample_size', default=1000),
    )

    def run(self, datadir, sample_size):
        delete_indices = DeleteIndices()
        delete_indices.run()

        put_settings = PutSettingsAndMappings()
        put_settings.run()

        load_kb = LoadSampleKB()
        load_kb.run(datadir=datadir, sample_size=sample_size)

        load_immix = LoadSampleImmix()
        load_immix.run(datadir=datadir, sample_size=sample_size)

        create_aliases = CreateAliases()
        create_aliases.run()


class AddUser(Command):
    """
    Create a new user from the command line.
    """
    def run(self):
        user_opts = {}

        user_opts['name'] = prompt('Name')
        user_opts['email'] = prompt('Email')
        user_opts['password'] = prompt_pass('Password')
        user_opts['password'] = bcrypt.generate_password_hash(user_opts['password'], 12)
        user_opts['organization'] = prompt('Organization')

        user_opts['email_verified'] = True
        user_opts['approved'] = True
        user_opts['email_verification_token'] = 'test'
        user_opts['approval_token'] = 'test'

        user = User(**user_opts)
        db.session.add(user)
        db.session.commit()

        print 'Created user: %s' % user


manager = Manager(app)
manager.add_command('runserver', Server(host='0.0.0.0'))
manager.add_command('load_test_avr_data', LoadAVRDataToES())
manager.add_command('transform_avr_data', TransformAVRData())
manager.add_command('load_sample_kb', LoadSampleKB())
manager.add_command('load_sample_immix', LoadSampleImmix())
manager.add_command('create_aliases', CreateAliases())
manager.add_command('put_settings', PutSettingsAndMappings())
manager.add_command('init_test_env', InitTestEnv())
manager.add_command('add_user', AddUser())
manager.add_command('delete_indices', DeleteIndices())


if __name__ == '__main__':
    manager.run()
