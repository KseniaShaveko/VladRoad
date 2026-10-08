import sqlite3
import json
import os
import re

from flask import (
    Flask,
    render_template,
    request,
    redirect,
    session,
    flash,
    jsonify,
    url_for
)
from werkzeug.security import generate_password_hash, check_password_hash


app = Flask(__name__)
app.secret_key = "super_secret_key_change_it"

# DATABASE_NAME = "database.db"
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATABASE_NAME = os.path.join(BASE_DIR, "database.db")


# ---------------- DATABASE ----------------

def get_db_connection():
    conn = sqlite3.connect(DATABASE_NAME)
    conn.row_factory = sqlite3.Row
    return conn

def add_column_if_not_exists(cursor, table_name, column_name, column_definition):
    try:
        cursor.execute(f"""
            ALTER TABLE {table_name}
            ADD COLUMN {column_name} {column_definition}
        """)
    except sqlite3.OperationalError:
        pass

def safe_json_loads(value, default=None):
    if default is None:
        default = []

    if not value:
        return default

    try:
        return json.loads(value)
    except Exception:
        return default


def init_db():
    conn = sqlite3.connect(DATABASE_NAME)
    cursor = conn.cursor()

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            email TEXT NOT NULL,
            password TEXT NOT NULL,
            is_admin INTEGER DEFAULT 0
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS routes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            name TEXT,
            points TEXT,
            segment_types TEXT,
            distance REAL DEFAULT 0,
            duration INTEGER DEFAULT 0,
            transport TEXT DEFAULT '',
            favorite INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS pois (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            description TEXT,
            lat REAL,
            lng REAL,
            category TEXT
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS ready_routes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT,
            description TEXT,
            cover_image TEXT,
            points TEXT,
            segment_types TEXT,
            distance REAL DEFAULT 0,
            duration INTEGER DEFAULT 0,
            transport TEXT DEFAULT '',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # Колонки для старых версий базы данных
    add_column_if_not_exists(cursor, "users", "is_admin", "INTEGER DEFAULT 0")

    add_column_if_not_exists(cursor, "routes", "favorite", "INTEGER DEFAULT 0")
    add_column_if_not_exists(cursor, "routes", "distance", "REAL DEFAULT 0")
    add_column_if_not_exists(cursor, "routes", "duration", "INTEGER DEFAULT 0")
    add_column_if_not_exists(cursor, "routes", "transport", "TEXT DEFAULT ''")

    add_column_if_not_exists(cursor, "ready_routes", "distance", "REAL DEFAULT 0")
    add_column_if_not_exists(cursor, "ready_routes", "duration", "INTEGER DEFAULT 0")
    add_column_if_not_exists(cursor, "ready_routes", "transport", "TEXT DEFAULT ''")

    add_column_if_not_exists(cursor, "pois", "image", "TEXT DEFAULT ''")

    conn.commit()
    conn.close()


# ---------------- AUTH HELPERS ----------------

def is_logged_in():
    return "user_id" in session


def is_admin():
    if "user_id" not in session:
        return False

    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT is_admin
        FROM users
        WHERE id = ?
    """, (session["user_id"],))

    user = cursor.fetchone()
    conn.close()

    return bool(user and user["is_admin"] == 1)


def get_admin_count():
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT COUNT(*) AS count
        FROM users
        WHERE is_admin = 1
    """)

    row = cursor.fetchone()
    conn.close()

    return row["count"] if row else 0


def get_route_transport_name(segment_types):
    if not segment_types:
        return "Не определён"

    if all(item == "foot" for item in segment_types):
        return "Пешком"

    if all(item == "driving" for item in segment_types):
        return "Авто"

    return "Смешанный"


def get_ready_route_transport_type(transport):
    value = (transport or "").lower()

    if "пеш" in value:
        return "walk"

    if "смеш" in value:
        return "mixed"

    return "auto"


def normalize_static_image_path(path):
    if not path:
        return "img/routes/default.jpg"

    path = path.strip()

    if path.startswith("/static/"):
        return path.replace("/static/", "", 1)

    if path.startswith("static/"):
        return path.replace("static/", "", 1)

    return path.lstrip("/")


# ---------------- HOME ----------------

@app.route("/")
def index():
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM ready_routes ORDER BY id DESC")
    rows = cursor.fetchall()

    home_routes = []
    for row in rows:
        image_path = normalize_static_image_path(row["cover_image"])
        duration = row["duration"] if "duration" in row.keys() and row["duration"] else 0
        transport = row["transport"] if "transport" in row.keys() and row["transport"] else "Маршрут"
        home_routes.append({
            "id": row["id"],
            "image": url_for("static", filename=image_path),
            "location": "Готовый маршрут",
            "title": row["title"],
            "transport": transport,
            "durationText": f"{duration} мин" if duration else "Не указано",
        })

    cursor.execute("SELECT * FROM pois WHERE category = 'attraction' ORDER BY id DESC")
    attraction_rows = cursor.fetchall()
    conn.close()

    attractions = []
    for row in attraction_rows:
        image = row["image"] if "image" in row.keys() and row["image"] else ""
        attractions.append({
            "id": row["id"],
            "name": row["name"],
            "lat": row["lat"],
            "lng": row["lng"],
            "image": url_for("static", filename=normalize_static_image_path(image)) if image else "",
        })

    return render_template(
        "index.html",
        hero_title="ГЛАВНАЯ",
        hero_image="img/hero/main-page-banner.jpg",
        is_logged_in=is_logged_in(),
        is_admin=is_admin(),
        home_routes=home_routes,
        attractions=attractions
    )


# ---------------- ABOUT ----------------

@app.route("/about")
def about():
    return render_template(
        "about.html",
        is_logged_in=is_logged_in(),
        is_admin=is_admin()
    )


# ---------------- READY TOURS PAGE ----------------

@app.route("/ready_tours")
def ready_tours():
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT *
        FROM ready_routes
        ORDER BY id DESC
    """)

    rows = cursor.fetchall()
    conn.close()

    routes = []

    for row in rows:
        image_path = normalize_static_image_path(row["cover_image"])

        duration = row["duration"] if "duration" in row.keys() and row["duration"] else 0
        transport = row["transport"] if "transport" in row.keys() and row["transport"] else "Маршрут"

        routes.append({
            "id": row["id"],
            "image": url_for("static", filename=image_path),
            "location": "Готовый маршрут",
            "title": row["title"],
            "description": row["description"],
            "transport": transport,
            "transportType": get_ready_route_transport_type(transport),
            "durationText": f"{duration} мин" if duration else "Не указано",
            "durationMinutes": duration
        })

    return render_template(
        "ready_tours.html",
        routes=routes,
        is_logged_in=is_logged_in(),
        is_admin=is_admin()
    )


# ---------------- MAP PAGE ----------------

@app.route("/map")
def map_page():
    return render_template(
        "map.html",
        is_logged_in=is_logged_in(),
        is_admin=is_admin()
    )


# ---------------- REGISTER ----------------

@app.route("/register", methods=["GET", "POST"])
def register():
    if request.method == "POST":
        username = request.form.get("username", "").strip()
        email = request.form.get("email", "").strip()
        password = request.form.get("password", "").strip()
        password_repeat = request.form.get("password_repeat", "").strip()

        def render_error(message):
            return render_template(
                "register.html",
                error=message,
                form_username=username,
                form_email=email,
                is_logged_in=is_logged_in(),
                is_admin=is_admin()
            )

        if not username or not email or not password:
            return render_error("Заполните все поля")
        
        email_pattern = re.compile(r'^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$')
        if not email_pattern.match(email):
            return render_error("Почта может содержать только латинские буквы, цифры и спецсимволы (. _ % + -), и обязана содержать @")

        if password != password_repeat:
            return render_error("Пароли не совпадают")

        password_hash = generate_password_hash(password)

        conn = get_db_connection()
        cursor = conn.cursor()

        cursor.execute("""
            SELECT COUNT(*) AS count
            FROM users
        """)

        users_count = cursor.fetchone()["count"]

        # Первый пользователь автоматически становится администратором.
        is_admin_value = 1 if users_count == 0 or request.form.get("is_admin") else 0

        try:
            cursor.execute("""
                INSERT INTO users (
                    username,
                    email,
                    password,
                    is_admin
                )
                VALUES (?, ?, ?, ?)
            """, (
                username,
                email,
                password_hash,
                is_admin_value
            ))

            conn.commit()

            user_id = cursor.lastrowid

            session["user_id"] = user_id
            session["username"] = username
            session["is_admin"] = bool(is_admin_value)

            conn.close()

            return redirect("/")

        except sqlite3.IntegrityError:
            conn.close()
            return render_error("Пользователь уже существует")

    return render_template(
        "register.html",
        is_logged_in=is_logged_in(),
        is_admin=is_admin()
    )


# ---------------- LOGIN ----------------

@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        username = request.form.get("username", "").strip()
        password = request.form.get("password", "").strip()

        conn = get_db_connection()
        cursor = conn.cursor()

        cursor.execute("""
            SELECT id, username, is_admin, password
            FROM users
            WHERE username = ?
        """, (username,))

        user = cursor.fetchone()

        password_ok = False

        if user:
            stored_password = user["password"]

            # Старые аккаунты: пароль хранился в открытом виде (не хэш werkzeug).
            # Хэши werkzeug всегда начинаются с "pbkdf2:" или "scrypt:".
            is_legacy_plain = not (
                stored_password.startswith("pbkdf2:") or
                stored_password.startswith("scrypt:")
            )

            if is_legacy_plain:
                if stored_password == password:
                    password_ok = True
                    # Миграция: перезаписываем пароль хэшем при успешном входе.
                    new_hash = generate_password_hash(password)
                    cursor.execute("""
                        UPDATE users
                        SET password = ?
                        WHERE id = ?
                    """, (new_hash, user["id"]))
                    conn.commit()
            else:
                password_ok = check_password_hash(stored_password, password)

        conn.close()

        if user and password_ok:
            session["user_id"] = user["id"]
            session["username"] = user["username"]
            session["is_admin"] = bool(user["is_admin"])
            return redirect("/")

        flash("Неверный логин или пароль")
        return redirect("/login")

    return render_template(
        "login.html",
        is_logged_in=is_logged_in(),
        is_admin=is_admin()
    )


# ---------------- LOGOUT ----------------

@app.route("/logout")
def logout():
    session.clear()
    return redirect("/")


# ---------------- PROFILE ----------------

@app.route("/profile")
def profile():
    if "user_id" not in session:
        return redirect("/login")

    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT *
        FROM routes
        WHERE user_id = ?
        ORDER BY created_at DESC
    """, (session["user_id"],))

    rows = cursor.fetchall()

    created_routes = []

    for row in rows:
        points = safe_json_loads(row["points"])

        created_routes.append({
            "id": row["id"],
            "name": row["name"],
            "points_count": len(points),
            "distance": round(row["distance"] or 0),
            "duration": round(row["duration"] or 0),
            "transport": row["transport"] or "Не определён",
            "is_favorite": bool(row["favorite"])
        })

    cursor.execute("""
        SELECT *
        FROM routes
        WHERE user_id = ?
        AND favorite = 1
        ORDER BY created_at DESC
    """, (session["user_id"],))

    rows = cursor.fetchall()

    favorite_routes = []

    for row in rows:
        points = safe_json_loads(row["points"])

        favorite_routes.append({
            "id": row["id"],
            "name": row["name"],
            "points_count": len(points),
            "distance": round(row["distance"] or 0),
            "duration": round(row["duration"] or 0),
            "transport": row["transport"] or "Не определён",
            "is_favorite": True
        })

    cursor.execute("""
        SELECT email
        FROM users
        WHERE id = ?
    """, (session["user_id"],))

    user = cursor.fetchone()
    conn.close()

    return render_template(
        "profile.html",
        username=session["username"],
        email=user["email"] if user else "",
        created_routes=created_routes,
        favorite_routes=favorite_routes,
        is_logged_in=True,
        is_admin=is_admin()
    )


# ---------------- EDIT PROFILE ----------------

@app.route("/edit_profile", methods=["GET", "POST"])
def edit_profile():
    if "user_id" not in session:
        return redirect("/login")

    conn = get_db_connection()
    cursor = conn.cursor()

    user_id = session["user_id"]

    if request.method == "POST":
        username = request.form.get("username", "").strip()
        password = request.form.get("password", "").strip()

        if not username or not password:
            flash("Заполните имя пользователя и пароль")
            conn.close()
            return redirect("/edit_profile")

        try:
            cursor.execute("""
                UPDATE users
                SET username = ?,
                    password = ?
                WHERE id = ?
            """, (
                username,
                password,
                user_id
            ))

            conn.commit()

            session["username"] = username

            conn.close()
            return redirect("/profile")

        except sqlite3.IntegrityError:
            conn.close()
            flash("Такое имя пользователя уже занято")
            return redirect("/edit_profile")

    cursor.execute("""
        SELECT username, email, password
        FROM users
        WHERE id = ?
    """, (user_id,))

    user = cursor.fetchone()
    conn.close()

    if not user:
        session.clear()
        return redirect("/login")

    return render_template(
        "edit_profile.html",
        username=user["username"],
        email=user["email"],
        password=user["password"],
        is_logged_in=True,
        is_admin=is_admin()
    )


# ---------------- DELETE ACCOUNT ----------------

@app.route("/delete_account", methods=["POST"])
def delete_account():
    if "user_id" not in session:
        return redirect("/login")

    user_id = session["user_id"]

    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT is_admin
        FROM users
        WHERE id = ?
    """, (user_id,))

    current_user = cursor.fetchone()

    if current_user and current_user["is_admin"] == 1:
        cursor.execute("""
            SELECT COUNT(*) AS count
            FROM users
            WHERE is_admin = 1
        """)

        admin_count = cursor.fetchone()["count"]

        if admin_count <= 1:
            conn.close()
            flash("Нельзя удалить единственного администратора. Сначала назначьте другого администратора.")
            return redirect("/profile")

    cursor.execute("""
        DELETE FROM routes
        WHERE user_id = ?
    """, (user_id,))

    cursor.execute("""
        DELETE FROM users
        WHERE id = ?
    """, (user_id,))

    conn.commit()
    conn.close()

    session.clear()

    return redirect("/")


# ---------------- USER ROUTES ----------------

@app.route("/save_route", methods=["POST"])
def save_route():
    if "user_id" not in session:
        return jsonify({"error": "not logged in"}), 401

    data = request.json or {}

    name = data.get("name", "Без названия")
    points_list = data.get("points", [])
    segment_list = data.get("segmentTypes", [])

    distance = data.get("distance", 0)
    duration = data.get("duration", 0)
    transport = get_route_transport_name(segment_list)

    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
        INSERT INTO routes (
            user_id,
            name,
            points,
            segment_types,
            distance,
            duration,
            transport
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (
        session["user_id"],
        name,
        json.dumps(points_list),
        json.dumps(segment_list),
        distance,
        duration,
        transport
    ))

    conn.commit()
    conn.close()

    return jsonify({"status": "ok"})


@app.route("/get_routes")
def get_routes():
    if "user_id" not in session:
        return jsonify([])

    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT
            id,
            name,
            favorite,
            created_at
        FROM routes
        WHERE user_id = ?
        ORDER BY favorite DESC, created_at DESC
    """, (session["user_id"],))

    routes = cursor.fetchall()
    conn.close()

    result = []

    for route in routes:
        result.append([
            route["id"],
            route["name"],
            route["favorite"],
            route["created_at"]
        ])

    return jsonify(result)


@app.route("/load_route/<int:route_id>")
def load_route(route_id):
    if "user_id" not in session:
        return jsonify({"error": "not logged in"}), 401

    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT points, segment_types
        FROM routes
        WHERE id = ?
        AND user_id = ?
    """, (
        route_id,
        session["user_id"]
    ))

    row = cursor.fetchone()
    conn.close()

    if not row:
        return jsonify({"error": "not found"}), 404

    return jsonify({
        "points": safe_json_loads(row["points"]),
        "segmentTypes": safe_json_loads(row["segment_types"])
    })


@app.route("/delete_route/<int:route_id>", methods=["POST"])
def delete_route(route_id):
    if "user_id" not in session:
        return jsonify({"error": "not logged in"}), 401

    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
        DELETE FROM routes
        WHERE id = ?
        AND user_id = ?
    """, (
        route_id,
        session["user_id"]
    ))

    conn.commit()
    conn.close()

    return jsonify({"status": "deleted"})

@app.route("/rename_route/<int:route_id>", methods=["POST"])
def rename_route(route_id):
    if "user_id" not in session:
        return jsonify({"error": "not logged in"}), 401

    data = request.json or {}
    name = data.get("name", "").strip()

    if not name:
        return jsonify({"error": "Название не может быть пустым"}), 400

    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
        UPDATE routes
        SET name = ?
        WHERE id = ?
        AND user_id = ?
    """, (name, route_id, session["user_id"]))

    conn.commit()
    conn.close()

    return jsonify({"status": "ok"})

@app.route("/update_route_segments/<int:route_id>", methods=["POST"])
def update_route_segments(route_id):
    if "user_id" not in session:
        return jsonify({"error": "not logged in"}), 401

    data = request.json or {}
    segment_types = data.get("segmentTypes", [])
    transport = get_route_transport_name(segment_types)

    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
        UPDATE routes
        SET segment_types = ?, transport = ?
        WHERE id = ? AND user_id = ?
    """, (json.dumps(segment_types), transport, route_id, session["user_id"]))

    conn.commit()
    conn.close()

    return jsonify({"status": "ok"})

@app.route("/update_route_points/<int:route_id>", methods=["POST"])
def update_route_points(route_id):
    if "user_id" not in session:
        return jsonify({"error": "not logged in"}), 401

    data = request.json or {}
    points_list = data.get("points", [])

    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
        UPDATE routes
        SET points = ?
        WHERE id = ? AND user_id = ?
    """, (json.dumps(points_list), route_id, session["user_id"]))

    conn.commit()
    conn.close()

    return jsonify({"status": "ok"})

@app.route("/toggle_favorite/<int:route_id>", methods=["POST"])
def toggle_favorite(route_id):
    if "user_id" not in session:
        return jsonify({"error": "not logged in"}), 401

    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
        UPDATE routes
        SET favorite =
            CASE
                WHEN favorite = 1 THEN 0
                ELSE 1
            END
        WHERE id = ?
        AND user_id = ?
    """, (
        route_id,
        session["user_id"]
    ))

    conn.commit()
    conn.close()

    return jsonify({"status": "ok"})


# ---------------- ADMIN PAGE ----------------

@app.route("/admin")
def admin():
    if not is_admin():
        return redirect("/")

    return render_template(
        "admin.html",
        current_user_id=session.get("user_id"),
        is_logged_in=is_logged_in(),
        is_admin=True
    )


# ---------------- ADMIN STATS ----------------

@app.route("/admin/stats")
def admin_stats():
    if not is_admin():
        return jsonify({"error": "access denied"}), 403

    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT COUNT(*) AS count FROM users")
    users_count = cursor.fetchone()["count"]

    cursor.execute("SELECT COUNT(*) AS count FROM users WHERE is_admin = 1")
    admins_count = cursor.fetchone()["count"]

    cursor.execute("SELECT COUNT(*) AS count FROM routes")
    user_routes_count = cursor.fetchone()["count"]

    cursor.execute("SELECT COUNT(*) AS count FROM ready_routes")
    ready_routes_count = cursor.fetchone()["count"]

    cursor.execute("SELECT COUNT(*) AS count FROM pois")
    poi_count = cursor.fetchone()["count"]

    cursor.execute("SELECT COUNT(*) AS count FROM pois WHERE category = 'attraction'")
    attractions_count = cursor.fetchone()["count"]

    cursor.execute("SELECT COUNT(*) AS count FROM pois WHERE category = 'cafe'")
    cafes_count = cursor.fetchone()["count"]

    cursor.execute("SELECT COUNT(*) AS count FROM pois WHERE category = 'restaurant'")
    restaurants_count = cursor.fetchone()["count"]

    conn.close()

    return jsonify({
        "users": users_count,
        "admins": admins_count,
        "user_routes": user_routes_count,
        "ready_routes": ready_routes_count,
        "poi": poi_count,
        "attractions": attractions_count,
        "cafes": cafes_count,
        "restaurants": restaurants_count
    })


# ---------------- ADMIN USERS ----------------

@app.route("/admin/users")
def admin_users():
    if not is_admin():
        return jsonify({"error": "access denied"}), 403

    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT
            users.id,
            users.username,
            users.email,
            users.is_admin,
            COUNT(routes.id) AS routes_count
        FROM users
        LEFT JOIN routes ON routes.user_id = users.id
        GROUP BY users.id
        ORDER BY users.is_admin DESC, users.username ASC
    """)

    users = cursor.fetchall()
    conn.close()

    result = []

    for user in users:
        result.append({
            "id": user["id"],
            "username": user["username"],
            "email": user["email"],
            "is_admin": user["is_admin"],
            "routes_count": user["routes_count"]
        })

    return jsonify(result)


@app.route("/admin/make_admin/<int:user_id>", methods=["POST"])
def make_admin(user_id):
    if not is_admin():
        return jsonify({"error": "access denied"}), 403

    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT id
        FROM users
        WHERE id = ?
    """, (user_id,))

    user = cursor.fetchone()

    if not user:
        conn.close()
        return jsonify({"error": "Пользователь не найден"}), 404

    cursor.execute("""
        UPDATE users
        SET is_admin = 1
        WHERE id = ?
    """, (user_id,))

    conn.commit()
    conn.close()

    return jsonify({"status": "ok"})


@app.route("/admin/remove_admin/<int:user_id>", methods=["POST"])
def remove_admin(user_id):
    if not is_admin():
        return jsonify({"error": "access denied"}), 403

    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT id, is_admin
        FROM users
        WHERE id = ?
    """, (user_id,))

    user = cursor.fetchone()

    if not user:
        conn.close()
        return jsonify({"error": "Пользователь не найден"}), 404

    if user["is_admin"] != 1:
        conn.close()
        return jsonify({"status": "ok"})

    cursor.execute("""
        SELECT COUNT(*) AS count
        FROM users
        WHERE is_admin = 1
    """)

    admin_count = cursor.fetchone()["count"]

    if admin_count <= 1:
        conn.close()
        return jsonify({
            "error": "Нельзя снять роль с единственного администратора. Сначала назначьте другого администратора."
        }), 400

    cursor.execute("""
        UPDATE users
        SET is_admin = 0
        WHERE id = ?
    """, (user_id,))

    conn.commit()
    conn.close()

    if session.get("user_id") == user_id:
        session["is_admin"] = False

    return jsonify({"status": "ok"})


# ---------------- POI ----------------

@app.route("/get_pois")
def get_pois():
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT *
        FROM pois
        ORDER BY id DESC
    """)

    rows = cursor.fetchall()
    conn.close()

    result = []

    for row in rows:
        result.append({
            "id": row["id"],
            "name": row["name"],
            "description": row["description"],
            "lat": row["lat"],
            "lng": row["lng"],
            "category": row["category"]
        })

    return jsonify(result)


@app.route("/admin/add_poi", methods=["POST"])
def add_poi():
    if not is_admin():
        return jsonify({"error": "access denied"}), 403

    data = request.json or {}

    name = data.get("name", "").strip()
    description = data.get("description", "").strip()
    category = data.get("category", "attraction")
    lat = data.get("lat")
    lng = data.get("lng")

    if not name:
        return jsonify({"error": "Название POI обязательно"}), 400

    if lat is None or lng is None:
        return jsonify({"error": "Координаты POI не выбраны"}), 400

    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
        INSERT INTO pois (
            name,
            description,
            lat,
            lng,
            category
        )
        VALUES (?, ?, ?, ?, ?)
    """, (
        name,
        description,
        lat,
        lng,
        category
    ))


    image = normalize_static_image_path(data.get("image", ""))

    cursor.execute("""
        INSERT INTO pois (name, description, lat, lng, category, image)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (name, description, lat, lng, category, image))

    conn.commit()
    conn.close()

    return jsonify({"status": "ok"})


@app.route("/admin/edit_poi/<int:poi_id>", methods=["PUT"])
def edit_poi(poi_id):
    if not is_admin():
        return jsonify({"error": "access denied"}), 403

    data = request.json or {}

    name = data.get("name", "").strip()
    description = data.get("description", "").strip()
    category = data.get("category", "attraction")
    lat = data.get("lat")
    lng = data.get("lng")

    if not name:
        return jsonify({"error": "Название POI обязательно"}), 400

    if lat is None or lng is None:
        return jsonify({"error": "Координаты POI не выбраны"}), 400

    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
        UPDATE pois
        SET
            name = ?,
            description = ?,
            lat = ?,
            lng = ?,
            category = ?
        WHERE id = ?
    """, (
        name,
        description,
        lat,
        lng,
        category,
        poi_id
    ))

    image = normalize_static_image_path(data.get("image", ""))

    cursor.execute("""
        UPDATE pois
        SET name = ?, description = ?, lat = ?, lng = ?, category = ?, image = ?
        WHERE id = ?
    """, (name, description, lat, lng, category, image, poi_id))

    conn.commit()
    conn.close()

    return jsonify({"status": "ok"})


@app.route("/admin/delete_poi/<int:poi_id>", methods=["POST"])
def delete_poi(poi_id):
    if not is_admin():
        return jsonify({"error": "access denied"}), 403

    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
        DELETE FROM pois
        WHERE id = ?
    """, (poi_id,))

    conn.commit()
    conn.close()

    return jsonify({"status": "ok"})


# ---------------- READY ROUTES ----------------

@app.route("/admin/save_ready_route", methods=["POST"])
def save_ready_route():
    if not is_admin():
        return jsonify({"error": "access denied"}), 403

    data = request.json or {}

    title = data.get("title", "").strip()
    description = data.get("description", "").strip()
    cover_image = normalize_static_image_path(data.get("cover_image", ""))
    points = data.get("points", [])
    segment_types = data.get("segmentTypes", [])
    distance = data.get("distance", 0)
    duration = data.get("duration", 0)
    transport = data.get("transport", "").strip()

    if not title:
        return jsonify({"error": "Название маршрута обязательно"}), 400

    if len(points) < 2:
        return jsonify({"error": "Маршрут должен содержать минимум две точки"}), 400

    if not transport:
        transport = get_route_transport_name(segment_types)

    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
        INSERT INTO ready_routes (
            title,
            description,
            cover_image,
            points,
            segment_types,
            distance,
            duration,
            transport
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        title,
        description,
        cover_image,
        json.dumps(points),
        json.dumps(segment_types),
        distance,
        duration,
        transport
    ))

    conn.commit()
    conn.close()

    return jsonify({"status": "ok"})


@app.route("/get_ready_routes")
def get_ready_routes():
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT *
        FROM ready_routes
        ORDER BY id DESC
    """)

    rows = cursor.fetchall()
    conn.close()

    result = []

    for row in rows:
        result.append({
            "id": row["id"],
            "title": row["title"],
            "description": row["description"],
            "cover_image": row["cover_image"],
            "points": safe_json_loads(row["points"]),
            "segmentTypes": safe_json_loads(row["segment_types"]),
            "distance": row["distance"] if "distance" in row.keys() else 0,
            "duration": row["duration"] if "duration" in row.keys() else 0,
            "transport": row["transport"] if "transport" in row.keys() else "Маршрут"
        })

    return jsonify(result)


@app.route("/load_ready_route/<int:route_id>")
def load_ready_route(route_id):
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT *
        FROM ready_routes
        WHERE id = ?
    """, (route_id,))

    row = cursor.fetchone()
    conn.close()

    if not row:
        return jsonify({"error": "not found"}), 404

    return jsonify({
        "id": row["id"],
        "title": row["title"],
        "description": row["description"],
        "cover_image": row["cover_image"],
        "points": safe_json_loads(row["points"]),
        "segmentTypes": safe_json_loads(row["segment_types"]),
        "distance": row["distance"] if "distance" in row.keys() else 0,
        "duration": row["duration"] if "duration" in row.keys() else 0,
        "transport": row["transport"] if "transport" in row.keys() else "Маршрут"
    })


@app.route("/admin/delete_ready_route/<int:route_id>", methods=["POST"])
def delete_ready_route(route_id):
    if not is_admin():
        return jsonify({"error": "access denied"}), 403

    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
        DELETE FROM ready_routes
        WHERE id = ?
    """, (route_id,))

    conn.commit()
    conn.close()

    return jsonify({"status": "ok"})


@app.route("/admin/check_ready_routes")
def check_ready_routes():
    if not is_admin():
        return jsonify({"error": "access denied"}), 403

    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT *
        FROM ready_routes
        ORDER BY id DESC
    """)

    rows = cursor.fetchall()
    conn.close()

    result = []

    for row in rows:
        result.append(dict(row))

    return jsonify(result)


# ---------------- START ----------------

# if __name__ == "__main__":
    init_db()
    app.run(debug=True)

init_db()
if __name__ == "__main__":
    app.run(debug=True)