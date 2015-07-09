from base64 import urlsafe_b64decode, urlsafe_b64encode
from hashlib import sha1
import re
import uuid
import json

from flask import (Blueprint, current_app, render_template, abort, request,
                   jsonify, url_for)
from flask.ext.login import login_user, logout_user, login_required, current_user
from flask.ext.mail import Message

from .extensions import db, mail, bcrypt
from .models import Query, User


views = Blueprint('views', __name__)

R_EMAIL = re.compile(r'^.+@[^.].*\.[a-z]{2,10}$', re.IGNORECASE)


@views.route('/', methods=['GET'])
def index():
    exposed_settings = [
        'DEBUG', 'HITS_PER_PAGE', 'ALLOWED_INTERVALS', 'DATE_AGGREGATION',
        'COLLECTIONS_CONFIG', 'ENABLED_COLLECTIONS', 'MINIMUM_CLOUD_FONTSIZE',
        'MAXIMUM_CLOUD_FONTSIZE', 'BARCHART_BARS', 'BARCHART_BAR_HEIGHT',
        'HIT_HIGHLIGHT_FIELDS', 'HIT_HIGHLIGHT_FRAGMENTS',
        'HIT_HIGHLIGHT_FRAGMENT_SIZE', 'LOG_EVENTS', 'ENABLE_USAGE_LOGGING',
        'DATE_STATS_AGGREGATION'
    ]

    settings = {}
    for setting in exposed_settings:
        settings[setting] = current_app.config[setting]

    # Check if user authentication is disabled
    login_disabled = current_app.config.get('LOGIN_DISABLED', False)

    settings['LOGIN_DISABLED'] = login_disabled
    if not login_disabled and current_user.is_authenticated():
        settings['AUTHENTICATED_USER'] = True
        settings['USER'] = {
            'name': current_user.name,
            'organization': current_user.organization,
            'email': current_user.email
        }
    else:
        settings['AUTHENTICATED_USER'] = False
        settings['USER'] = None

    return render_template('index.html', settings=settings)


@views.route('/verify_email/<int:user_id>/<token>')
def verify_email(user_id, token):
    """When visited with a valid `user_id` and `token` combination,
    the user's mailaddress is marked as 'verified'. The person
    responsible for approving accounts will receive an email about the
    new registration with a link to approve the account."""
    user = db.session.query(User)\
        .filter_by(id=user_id, email_verification_token=token).first()

    # If the user_id <-> token combination does not exist, return a 401
    if not user:
        abort(401)

    # Mark mail address as verified
    user.email_verified = True
    db.session.add(user)
    db.session.commit()

    # Send email to mail address responsible for approving accounts
    approve_url = url_for('.approve_user', user_id=user.id,
                          token=user.approval_token, _external=True)

    MESSAGES = current_app.config['MESSAGES']

    msg = Message(MESSAGES['email_approval_subject'],
                  sender=current_app.config['MAIL_DEFAULT_SENDER'],
                  recipients=[current_app.config['MAIL_ACCOUNT_APPROVAL_ADDRESS']])

    msg.body = MESSAGES['email_approval_body'] % (user.name, user.organization,
                                                  user.email, approve_url)
    mail.send(msg)

    messages = {
        'email_verified_title': MESSAGES['email_verified_title'] % user.name,
        'email_verified_content': MESSAGES['email_verified_content']
    }

    return render_template('verify_email.html', **messages)


@views.route('/approve_user/<int:user_id>/<token>')
def approve_user(user_id, token):
    """When visited with a valid `user_id` and `token` combination, the
    user's account is marked as 'approved'. An email notification of
    this approval will be send to the user."""
    user = db.session.query(User)\
                     .filter_by(id=user_id, approval_token=token, email_verified=True)\
                     .first()

    if not user:
        abort(401)

    # Mark account as approved
    user.approved = True
    db.session.add(user)
    db.session.commit()

    MESSAGES = current_app.config['MESSAGES']

    # Notify the user of approval by email
    msg = Message(MESSAGES['email_approved_subject'],
                  sender=current_app.config['MAIL_DEFAULT_SENDER'],
                  recipients=[user.email])

    index_url = url_for('.index', _external=True)
    msg.body = MESSAGES['email_approved_body'] % (user.name, index_url)

    mail.send(msg)

    return render_template('approve_user.html', user=user,
                           user_approved_title=MESSAGES['user_approved_title']
                           % user.name)


@views.route('/api/register', methods=['POST'])
def register():
    """Register a new user account."""
    errors = []

    MESSAGES = current_app.config['MESSAGES']

    # Return errors when required fields are not provided or empty
    required_field = ['name', 'email', 'password']
    for field in required_field:
        if field not in request.form or len(request.form[field].strip()) < 1:
            errors.append(MESSAGES['missing_%s' % field])

    # Verify if the email address is valid
    if not R_EMAIL.match(request.form['email']):
        errors.append(MESSAGES['invalid_email'])

    # Check if there is not already a user with the same mail address
    dupe_mail = db.session.query(User).filter_by(
        email=request.form['email']).first()
    if dupe_mail:
        errors.append(MESSAGES['account_already_exists'])

    if errors:
        return jsonify({'success': False, 'errors': errors})

    # Hash the provided password
    password = bcrypt.generate_password_hash(request.form['password'], 12)

    # Create the user record
    user = User(
        email=request.form['email'],
        password=password,
        name=request.form['name'],
        email_verification_token=str(uuid.uuid4()),
        approval_token=str(uuid.uuid4())
    )

    # Add the user's org., if provided
    if 'organization' in request.form and\
            len(request.form['organization'].strip()) > 1:
        user.organization = request.form['organization'].strip()

    db.session.add(user)
    db.session.commit()

    # Send account activation e-mail
    verification_url = url_for('.verify_email', user_id=user.id,
                               token=user.email_verification_token,
                               _external=True)

    msg = Message(MESSAGES['email_verification_subject'],
                  sender=current_app.config['MAIL_DEFAULT_SENDER'],
                  recipients=[request.form['email']])
    msg.body = MESSAGES['email_verification_body']\
        % (request.form['name'], verification_url)
    mail.send(msg)

    return jsonify({'success': True})


@views.route('/api/login', methods=['POST'])
def login():
    """Login the user."""
    errors = []

    MESSAGES = current_app.config['MESSAGES']

    # Return errors when required fields are not provided or empty
    required_field = ['email', 'password']
    for field in required_field:
        if field not in request.form or len(request.form[field].strip()) < 1:
            errors.append(MESSAGES['missing_%s' % field])

    if errors:
        return jsonify({'success': False, 'errors': errors})

    # Fetch the user from the db
    user = db.session.query(User).filter_by(email=request.form['email']).first()
    if not user:
        return jsonify({'success': False, 'errors': [MESSAGES['login_failed']]})

    # Validate password
    if not bcrypt.check_password_hash(user.password, request.form['password']):
        return jsonify({
            'success': False,
            'errors': [MESSAGES['login_failed']]
        })

    # Check if the user has verified his email address
    if not user.email_verified:
        return jsonify({
            'success': False,
            'errors': [MESSAGES['email_not_verified']]
        })

    # Check if staff already approved this account
    if not user.approved:
        return jsonify({
            'success': False,
            'errors': [MESSAGES['account_not_approved']]
        })

    # This must be a valid user, log the user in!
    login_user(user)

    return jsonify({
        'success': True,
        'user': {
            'name': user.name,
            'organization': user.organization,
            'email': user.email
        }
    })


@views.route('/api/logout', methods=['GET'])
@login_required
def logout():
    """Logs out the user by deleting the session."""
    logout_user()

    return jsonify({'success': True})


@views.route('/api/loadquery', methods=['POST'])
@login_required
def load():
    """Load saved query.

    Takes a base-64-encoded SHA1.
    """
    h = request.form['hash']
    if isinstance(h, unicode):
        h = h.encode('ascii')   # urlsafe_b64decode won't handle unicode
    h = urlsafe_b64decode(h)
    query = db.session.query(Query).filter_by(hash=h).first()
    return query.payload


@views.route('/api/savequery', methods=['POST'])
@login_required
def save():
    """Save a query for later replay.

    Accepts the query in the same format as search().
    Returns the SHA1 of the query after some minor normalization, in base-64
    encoding. This encoding is slightly shorter than the usual hex encoding
    (28 vs. 40 bytes), making for shorter URLs.
    """
    payload = json.loads(request.form['payload'])
    payload = json.dumps(payload, sort_keys=True)   # Normalize
    h = sha1(payload).digest()

    # If a query with the given hash has already been saved, assume it's the
    # same query and return without trying to save.
    if db.session.query(Query).filter_by(hash=h).first() is None:
        new = Query(hash=h, payload=payload, user_id=current_user.get_id())
        db.session.add(new)
        db.session.commit()

    return urlsafe_b64encode(h)


@views.route('/api/search', methods=['POST'])
@login_required
def search():
    payload = json.loads(request.form['payload'])

    if type(payload) is dict:
        index = current_app.config['COLLECTIONS_CONFIG'].get(payload.pop('index'))['index_name']
        results = current_app.es_search.search(index=index, body=payload)
    elif type(payload) is list:
        body = []
        for query in payload:
            body.append({'index': current_app.config['COLLECTIONS_CONFIG'].get(query.pop('index'))['index_name']})
            body.append(query)

        results = current_app.es_search.msearch(body=body)

    return jsonify(results)


@views.route('/api/count', methods=['POST'])
@login_required
def count():
    payload = json.loads(request.form['payload'])

    index = current_app.config['COLLECTIONS_CONFIG'].get(payload.pop('index'))['index_name']
    query = payload.get('query')

    results = current_app.es_search.count(index=index, body=query)

    return jsonify(results)


@views.route('/api/log_usage', methods=['POST'])
@login_required
def log_usage():
    events = json.loads(request.form['events'])
    user_id = current_user.id

    bulkrequest = ''
    # Add the user's ID to each event
    for event in events:
        event['user_id'] = user_id
        bulkrequest = bulkrequest + '\n' + '{ "create" : { "_index" : "' + current_app.config['ES_LOG_INDEX'] + '", "_type" : "event" } }'
        bulkrequest = bulkrequest + '\n' + json.dumps(event)

    current_app.es_log.bulk(body=bulkrequest)

    return jsonify({'success': True})
