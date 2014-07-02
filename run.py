from quamerdes import create_app

app = create_app()

if __name__ == '__main__':
    print app.run(host='0.0.0.0', use_reloader=True)
