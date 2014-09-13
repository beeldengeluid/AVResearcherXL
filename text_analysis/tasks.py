import os
from glob import iglob
import json
import tarfile

import zmq
from gensim.corpora.dictionary import Dictionary

from tokenizer import tokenize


def extract_kb_text(item):
    if 'text' in item and item['text']:
        return item['text']

    return None


def extract_immix_subtitles(item):
    if 'meta' in item and 'subtitles' in item['meta']\
            and item['meta']['subtitles']:
        return item['meta']['subtitles']

    return None


def extract_immix_summaries(item):
    text = ''

    if 'meta' not in item:
        return None

    if 'descriptions' in item['meta'] and item['meta']['descriptions']:
        text += u' '.join(item['meta']['descriptions'])

    if 'summaries' in item['meta'] and item['meta']['summaries']:
        text += u' '.join(item['meta']['summaries'])

    if text:
        return text

    return None


def tokenize_producer(socket_addr, items_path, text_extractor):
    """Sends the file's name and text as JSON for each file
    in ``items_path``"""
    if text_extractor == 'kb_text':
        text_extractor = extract_kb_text
    elif text_extractor == 'immix_subtitles':
        text_extractor = extract_immix_subtitles
    elif text_extractor == 'immix_summaries':
        text_extractor extract_immix_summaries
    else:
        raise ValueError('Unknown text extractor (\'%s\')' % text_extractor)

    context = zmq.Context()

    zmq_socket = context.socket(zmq.PUSH)
    zmq_socket.setsockopt(zmq.SNDHWM, 1000)
    zmq_socket.bind(socket_addr)

    for item in iglob(items_path):
        print item
        with open(item, 'r') as item_f:
            try:
                text = text_extractor(json.load(item_f))
            except ValueError:
                continue

        if not text:
            continue

        zmq_socket.send_json({'filename': item, 'text': text})


def tokenize_consumer(socket_addr, tokenized_items_path):
    """For each recieved item, tokenizes the text and stores the tokens
    in a file on disk (one line per token)"""
    context = zmq.Context()

    consumer_receiver = context.socket(zmq.PULL)
    consumer_receiver.connect(socket_addr)

    # File and directory counters used to partition the files in multiple
    # sub-directories
    file_c = 0
    dir_c = 0

    while True:
        data = consumer_receiver.recv_json()
        tokens = list(tokenize(data['text']))

        if tokens:
            filename = os.path.split(data['filename'])[-1][:-5]
            filename = os.path.join(tokenized_items_path, str(dir_c),
                                    '%s.txt' % filename)

            # Open the file, and create the directory if it doesn't exist
            try:
                doc = open(filename, 'w')
            except IOError:
                os.mkdir(os.path.join(tokenized_items_path, str(dir_c)))
                doc = open(filename, 'w')

            # Each line stores a single token
            for token in tokens:
                doc.write('%s\n' % token.encode('utf-8'))

            doc.close()

            # Update the file and document counts
            file_c += 1
            if file_c % 10000 == 0:
                dir_c += 1


def iter_docs(analyzed_items_path, progress_cnt=1000):
    docno = 0
    for doc in iglob(analyzed_items_path):
        tokens = []
        with open(doc, 'r') as f:
            for token in f:
                tokens.append(token[:-1].decode('utf-8'))

        docno += 1
        if docno % progress_cnt == 0:
            print docno

        yield tokens


def create_dictionary(analyzed_items_path, dictionary_path=None):
    dictionary = Dictionary(iter_docs(analyzed_items_path))

    if dictionary_path:
        dictionary.save(dictionary_path)

    return dictionary


def merge_dictionaries(dictionaries_path, merged_dictionary_path=None):
    dict_paths = list(iglob(dictionaries_path))

    final_dictionary = Dictionary.load(dict_paths[0])

    for dict_path in dict_paths[1:]:
        dictionary = Dictionary.load(dict_path)

        final_dictionary.merge_with(dictionary)

    if merged_dictionary_path:
        final_dictionary.save(merged_dictionary_path)

    return final_dictionary


def prune_dictionary(src_dictionary_path, dest_dictionary_path=None,
                     no_below=None, no_above=None, keep_n=None):
    dictionary = Dictionary.load(src_dictionary_path)
    dictionary.filter_extremes(no_below=no_below, no_above=no_above,
                               keep_n=keep_n)

    if dest_dictionary_path:
        dictionary.save(dest_dictionary_path)

    return dictionary


class Corpus(object):
    def __init__(self, analyzed_items_path, dictionary_path):
        self.dictionary = Dictionary.load(dictionary_path)
        self.analyzed_items_path = analyzed_items_path

    def get_analyzed_items(self):
        for tarred_item_file in self.analyzed_items_path:
            with tarfile.open(tarred_item_file, 'r:gz') as tar:
                for f_item in tar:
                    item = tar.extractfile(f_item)

                    tokens = []
                    for token in item:
                        tokens.append(token[:-1].decode('utf-8'))

                    yield tokens

                    tar.members = []


    def __iter__(self):
        pass



def create_corpus():
    pass