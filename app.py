from flask import Flask, render_template, request, jsonify
import sqlite3
import ollama
from datetime import datetime

app = Flask(__name__, static_folder="static", template_folder="templates")

# Database Connection
def get_db_connection():
    conn = sqlite3.connect("aurora.db")
    conn.row_factory = sqlite3.Row  # Ensures results can be accessed like dicts
    return conn

# Initialize Database
def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS chats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        title TEXT DEFAULT 'New Chat'
    )""")

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id INTEGER,
        role TEXT CHECK(role IN ('user', 'assistant')),
        message TEXT,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
    )""")

    conn.commit()
    conn.close()

init_db()  # Ensure database structure exists

# Home Page
@app.route("/")
def index():
    return render_template("index.html")

# Start a New Chat
@app.route("/new_chat", methods=["POST"])
def new_chat():
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        cursor.execute("INSERT INTO chats DEFAULT VALUES")
        chat_id = cursor.lastrowid
        conn.commit()
        conn.close()

        return jsonify({"chat_id": chat_id, "title": "New Chat"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# Get Chat History
@app.route("/history", methods=["GET"])
def get_chat_history():
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        cursor.execute("SELECT id, title FROM chats ORDER BY created_at DESC")
        chats = cursor.fetchall()
        conn.close()

        return jsonify([{"chat_id": chat["id"], "title": chat["title"]} for chat in chats])
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# Get Messages for a Chat
@app.route("/history/<int:chat_id>", methods=["GET"])
def get_chat_messages(chat_id):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        cursor.execute("SELECT role, message FROM messages WHERE chat_id = ?", (chat_id,))
        messages = cursor.fetchall()
        conn.close()

        return jsonify([{"role": m["role"], "message": m["message"]} for m in messages])
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# Handle Chat Messages
@app.route("/chat", methods=["POST"])
def chat():
    data = request.json
    message = data.get("message", "").strip()
    chat_id = data.get("chat_id")

    if not message or chat_id is None:
        return jsonify({"error": "Message and Chat ID are required"}), 400

    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        # Store User Message
        cursor.execute("INSERT INTO messages (chat_id, role, message) VALUES (?, 'user', ?)", (chat_id, message))

        # Generate Assistant Response
        response = ollama.chat(model="mistral", messages=[{"role": "user", "content": message}])
        assistant_response = response.get("message", {}).get("content", "I'm not sure how to respond.")

        # Store Assistant Response
        cursor.execute("INSERT INTO messages (chat_id, role, message) VALUES (?, 'assistant', ?)", (chat_id, assistant_response))

        # Update Chat Title (if it's the first message)
        cursor.execute("SELECT COUNT(*) FROM messages WHERE chat_id = ?", (chat_id,))
        message_count = cursor.fetchone()[0]

        if message_count == 2:  # First user message + assistant response
            # Generate a chat title based on the first message
            chat_title = generate_chat_title(message)
            cursor.execute("UPDATE chats SET title = ? WHERE id = ?", (chat_title, chat_id))

        conn.commit()
    except Exception as e:
        conn.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        conn.close()

    return jsonify({"response": assistant_response})

# Generate Chat Title
def generate_chat_title(message):
    # Use Mistral to generate a short title based on the message
    prompt = f"Generate a short title (2-5 words) for a chat about: {message}"
    response = ollama.generate(model="mistral", prompt=prompt)
    return response["response"].strip().replace('"', '')  # Remove any quotes

# Update Chat Title
@app.route("/update_chat_title", methods=["POST"])
def update_chat_title():
    data = request.json
    chat_id = data.get("chat_id")
    new_title = data.get("title", "").strip()

    if not chat_id or not new_title:
        return jsonify({"error": "Chat ID and Title are required"}), 400

    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        cursor.execute("UPDATE chats SET title = ? WHERE id = ?", (new_title, chat_id))
        conn.commit()
    except Exception as e:
        conn.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        conn.close()

    return jsonify({"success": True})

# Delete a Chat
@app.route("/delete_chat/<int:chat_id>", methods=["DELETE"])
def delete_chat(chat_id):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        # Delete the chat and its associated messages (cascade delete)
        cursor.execute("DELETE FROM chats WHERE id = ?", (chat_id,))
        conn.commit()
        conn.close()

        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    app.run(debug=True)
    