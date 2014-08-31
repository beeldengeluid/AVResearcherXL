import os
from glob import iglob
import json

import zmq
from gensim.corpora.dictionary import Dictionary

from tokenizer import tokenize


def tokenize_producer(socket_addr, items_path):
    context = zmq.Context()

    zmq_socket = context.socket(zmq.PUSH)
    zmq_socket.setsockopt(zmq.SNDHWM, 1000)
    zmq_socket.bind(socket_addr)

    for item in iglob(items_path):
        print item
        with open(item, 'r') as item_f:
            try:
                text = json.load(item_f)['text']
            except ValueError:
                continue

        zmq_socket.send_json({'filename': item, 'text': text})


def tokenize_consumer(socket_addr, tokenized_items_path):
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


def create_dictionary(analyzed_items_path):
    dictionary = Dictionary()

    for doc in iglob(analyzed_items_path):
        tokens = []
        with open(doc, 'r') as f:
            for token in f:
                tokens.append(token[:-2].decode('utf-8'))

        dictionary.doc2bow(tokens, allow_update=True)

    return dictionary


def iter_docs(analyzed_items_path, progress_cnt=1000):
    docno = 0
    for doc in iglob(analyzed_items_path):
        print doc
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
