const socket = io();

const chatForm = document.getElementById('chat-form');
const messageInput = document.getElementById('message');
const chat = document.getElementById('chat');

chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const message = messageInput.value;
    socket.send(message);
    messageInput.value = '';
});

socket.on('message', (msg) => {
    const messageElement = document.createElement('div');
    messageElement.textContent = msg;
    chat.appendChild(messageElement);
});