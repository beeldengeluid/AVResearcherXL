import re

from pattern.nl import parse



# The part-of-speech tags we are interested in
POS_TAGS = re.compile("(NN|NNS|NNP|NNPS|VB|VBD|VBG|VBN|VBP|VBZ|"
                      "JJ|JJR|JJS|RB|RBR|RBS)")

# Regex that only matches a lemma that consists of characters we allow;
# this should filter out lost of the OCR garbage text
LEMMA_CHARS = re.compile(r'^[a-z][a-z.\-/]*[a-z.]$')


def tokenize(text, min_lemma=3, max_lemma=30, allowed_pos_tags=POS_TAGS,
             allowed_lemma_chars=LEMMA_CHARS):
    """
    Tokenize and lemmatize the input text and return a generator that
    yields lemmas.

    :param text: the text to process.
    :param min_lemma: the minimal number of characters a lemma should contain.
    :param max_lemma: the maximal number of characters a lemma should contain.
    :param allowed_pos_tags: a compiled regex containing the POS tags that
                             we are interested in.
    :param allowed_lemma_chars: a compiled regex that matches lemma's we are
                             interested in.
    """
    parsed = parse(text, lemmata=True, collapse=False)
    for sentence in parsed:
        for token, tag, _, _, lemma in sentence:
            if 3 <= len(lemma) <= 30 and lemma and allowed_pos_tags.match(tag):
                if allowed_lemma_chars.match(lemma):
                    yield lemma
