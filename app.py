from flask import Flask, render_template, request
from flask_socketio import SocketIO, send, emit, join_room, leave_room
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime
from collections import deque

app = Flask(__name__)
app.config['SECRET_KEY'] = 'secret!'
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///chat.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)
socketio = SocketIO(app)

# Queue to manage users waiting to be paired
waiting_queue = deque()
user_rooms = {}  # Map user IDs to their rooms

class Message(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    nickname = db.Column(db.String(50), nullable=False)
    content = db.Column(db.String(200), nullable=False)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    room = db.Column(db.String(50), nullable=False)

@app.route('/')
def index():
    return render_template('index.html')

@socketio.on('join')
def handle_join(data):
    timestamp = datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')
    user_id = request.sid
    nickname = data['nickname']
    
    if waiting_queue:
        # Pair the user with the one in the queue
        partner_id = waiting_queue.popleft()
        room = f"room_{user_id}_{partner_id}"
        
        join_room(room, sid=user_id)
        join_room(room, sid=partner_id)
        
        user_rooms[user_id] = room
        user_rooms[partner_id] = room
        
        emit('join', {'nickname': nickname, 'msg': f'{nickname} joined the chat.', 'timestamp': timestamp, 'room': room}, room=room)
        emit('join', {'nickname': 'System', 'msg': 'You are now connected to a partner.', 'timestamp': timestamp, 'room': room}, room=room)
    else:
        # Add the user to the waiting queue
        waiting_queue.append(user_id)
        emit('waiting', {'msg': 'Waiting for a partner to join...', 'timestamp': timestamp}, to=user_id)

@socketio.on('message')
def handle_message(data):
    room = data['room']
    new_message = Message(nickname=data['nickname'], content=data['msg'], room=room)
    db.session.add(new_message)
    db.session.commit()
    send({'nickname': data['nickname'], 'msg': data['msg'], 'timestamp': new_message.timestamp.strftime('%Y-%m-%d %H:%M:%S')}, room=room)

@socketio.on('disconnect')
def handle_disconnect():
    user_id = request.sid
    room = user_rooms.pop(user_id, None)
    
    if user_id in waiting_queue:
        waiting_queue.remove(user_id)
    elif room:
        timestamp = datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')
        emit('message', {'nickname': 'System', 'msg': 'Your partner has disconnected.', 'timestamp': timestamp}, room=room)
        
        partner_id = room.replace(f"room_{user_id}_", "").replace(f"_room_{user_id}", "")
        partner_id = partner_id if partner_id != user_id else None

        if partner_id:
            waiting_queue.append(partner_id)
            emit('waiting', {'msg': 'Waiting for a partner to join...', 'timestamp': timestamp}, to=partner_id)

@socketio.on('offer')
def handle_offer(data):
    emit('offer', {'offer': data['offer']}, room=data['room'])

@socketio.on('answer')
def handle_answer(data):
    emit('answer', {'answer': data['answer']}, room=data['room'])

@socketio.on('ice-candidate')
def handle_ice_candidate(data):
    emit('ice-candidate', {'candidate': data['candidate']}, room=data['room'])

if __name__ == '__main__':
    with app.app_context():
        db.create_all()
    socketio.run(app, debug=True)