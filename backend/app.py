# backend/app.py
from flask import Flask, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)  # allows your React dev server (different port) to call this

@app.route('/api/ping')
def ping():
    return jsonify({"message": "hello"})

if __name__ == '__main__':
    app.run(debug=True, port=5000)