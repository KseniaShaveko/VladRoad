from flask import render_template, request, redirect, session, jsonify, flash
from functools import wraps
import sqlite3
import json
from datetime import datetime

# Декоратор для проверки авторизации
def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if "user_id" not in session:
            return redirect("/login")
        return f(*args, **kwargs)
    return decorated_function

def get_db_connection():
    return sqlite3.connect("database.db")

def register_profile_routes(app):
    
    @app.route("/profile")
    @login_required
    def profile():
        user_id = session["user_id"]
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Получаем данные пользователя
        cursor.execute("SELECT username, email, created_at, notifications_enabled FROM users WHERE id = ?", (user_id,))
        user = cursor.fetchone()
        
        # Получаем избранные маршруты
        cursor.execute("""
            SELECT id, name, points, segment_types, favorite, created_at, distance, duration
            FROM routes 
            WHERE user_id = ? AND favorite = 1
            ORDER BY created_at DESC
        """, (user_id,))
        favorite_routes = cursor.fetchall()
        
        # Получаем созданные маршруты
        cursor.execute("""
            SELECT id, name, points, segment_types, favorite, created_at, distance, duration
            FROM routes 
            WHERE user_id = ?
            ORDER BY created_at DESC
        """, (user_id,))
        created_routes = cursor.fetchall()
        
        # Статистика
        cursor.execute("SELECT COUNT(*) FROM routes WHERE user_id = ?", (user_id,))
        total_routes = cursor.fetchone()[0]
        
        cursor.execute("SELECT SUM(distance), SUM(duration) FROM routes WHERE user_id = ?", (user_id,))
        totals = cursor.fetchone()
        total_distance = round(totals[0] or 0, 1)
        total_duration = totals[1] or 0
        
        # Среднее количество точек
        cursor.execute("SELECT AVG(json_array_length(points)) FROM routes WHERE user_id = ?", (user_id,))
        avg_points_raw = cursor.fetchone()[0]
        avg_points = round(avg_points_raw or 0)
        
        # Дней с нами
        created_at = datetime.strptime(user[2], '%Y-%m-%d %H:%M:%S') if isinstance(user[2], str) else user[2]
        member_days = (datetime.now() - created_at).days
        
        # Форматируем маршруты для шаблона
        favorite_list = []
        for route in favorite_routes:
            points_count = len(json.loads(route[2])) if route[2] else 0
            favorite_list.append({
                'id': route[0],
                'name': route[1],
                'points_count': points_count,
                'distance': route[6] or 0,
                'created_at': route[5][:10] if route[5] else ''
            })
        
        created_list = []
        for route in created_routes:
            points_count = len(json.loads(route[2])) if route[2] else 0
            created_list.append({
                'id': route[0],
                'name': route[1],
                'points_count': points_count,
                'distance': route[6] or 0,
                'created_at': route[5][:10] if route[5] else ''
            })
        
        # Получаем активность пользователя
        cursor.execute("""
            SELECT action, details, created_at 
            FROM user_activity 
            WHERE user_id = ? 
            ORDER BY created_at DESC 
            LIMIT 10
        """, (user_id,))
        activities = cursor.fetchall()
        
        activity_list = []
        icons = {
            'create_route': '📍',
            'save_route': '💾',
            'favorite_route': '⭐',
            'login': '🔓',
            'edit_profile': '✏️',
            'delete_route': '🗑'
        }
        for act in activities:
            activity_list.append({
                'icon': icons.get(act[0], '📌'),
                'text': act[1] or act[0],
                'time': act[2][:10] if act[2] else ''
            })
        
        conn.close()
        
        return render_template('profile.html',
                             username=user[0],
                             email=user[1],
                             favorite_routes=favorite_list,
                             created_routes=created_list,
                             favorite_routes_count=len(favorite_list),
                             created_routes_count=len(created_list),
                             total_routes=total_routes,
                             favorite_count=len(favorite_list),
                             total_distance=total_distance,
                             total_duration=total_duration,
                             avg_points=avg_points,
                             member_days=member_days,
                             recent_activity=activity_list,
                             notifications_enabled=bool(user[3]))

    @app.route("/update_profile", methods=["POST"])
    @login_required
    def update_profile():
        user_id = session["user_id"]
        username = request.form.get("username")
        email = request.form.get("email")
        
        conn = get_db_connection()
        cursor = conn.cursor()
        
        try:
            cursor.execute("UPDATE users SET username = ?, email = ? WHERE id = ?", 
                          (username, email, user_id))
            conn.commit()
            session["username"] = username
            
            # Добавляем активность
            cursor.execute("INSERT INTO user_activity (user_id, action, details) VALUES (?, ?, ?)",
                          (user_id, "edit_profile", "Обновлён профиль"))
            conn.commit()
            flash("Профиль обновлён")
        except sqlite3.IntegrityError:
            flash("Имя пользователя уже занято")
        finally:
            conn.close()
        
        return redirect("/profile")

    @app.route("/change_password", methods=["POST"])
    @login_required
    def change_password():
        user_id = session["user_id"]
        data = request.json
        
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("SELECT password FROM users WHERE id = ?", (user_id,))
        current_hash = cursor.fetchone()[0]
        
        if data['current_password'] != current_hash:
            return jsonify({"error": "Неверный текущий пароль"}), 400
        
        cursor.execute("UPDATE users SET password = ? WHERE id = ?", 
                      (data['new_password'], user_id))
        conn.commit()
        conn.close()
        
        return jsonify({"success": True})

    @app.route("/toggle_notifications", methods=["POST"])
    @login_required
    def toggle_notifications():
        user_id = session["user_id"]
        data = request.json
        
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("UPDATE users SET notifications_enabled = ? WHERE id = ?", 
                      (1 if data['enabled'] else 0, user_id))
        conn.commit()
        conn.close()
        
        return jsonify({"success": True})

    @app.route("/remove_favorite/<int:route_id>", methods=["POST"])
    @login_required
    def remove_favorite(route_id):
        user_id = session["user_id"]
        
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("UPDATE routes SET favorite = 0 WHERE id = ? AND user_id = ?", 
                      (route_id, user_id))
        conn.commit()
        conn.close()
        
        return jsonify({"success": True})