const socket = io();

const nicknameForm = document.getElementById('nickname-form');
const nicknameInput = document.getElementById('nickname');
const chatContainer = document.getElementById('chat-container');
const chatForm = document.getElementById('chat-form');
const messageInput = document.getElementById('message');
const chatBox = document.getElementById('chat-box');
const waitingMessage = document.getElementById('waiting-message');
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');

let nickname = '';
let room = '';
let localStream;
let remoteStream;
let peerConnection;

const config = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' }
    ]
};

nicknameForm.addEventListener('submit', (e) => {
    e.preventDefault();
    nickname = nicknameInput.value;
    if (nickname.trim()) {
        nicknameForm.style.display = 'none';
        chatContainer.style.display = 'block';
        socket.emit('join', { nickname: nickname });
        startVideo();
    }
});

chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const message = messageInput.value;
    if (message.trim()) {
        socket.emit('message', { nickname: nickname, msg: message, room: room });
        messageInput.value = '';
        messageInput.focus();
    }
});

socket.on('message', (data) => {
    const messageElement = document.createElement('div');
    messageElement.textContent = `${data.timestamp} - ${data.nickname}: ${data.msg}`;
    messageElement.classList.add('chat-message');
    if (data.nickname === nickname) {
        messageElement.classList.add('me');
    } else {
        messageElement.classList.add('other');
    }
    chatBox.appendChild(messageElement);
    chatBox.scrollTop = chatBox.scrollHeight;
});

socket.on('join', async (data) => {
    room = data.room;
    const joinElement = document.createElement('div');
    joinElement.textContent = `${data.timestamp} - ${data.nickname}: ${data.msg}`;
    joinElement.classList.add('chat-message', 'other');
    chatBox.appendChild(joinElement);
    chatBox.scrollTop = chatBox.scrollHeight;

    if (peerConnection) {
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        socket.emit('offer', { room: room, offer: peerConnection.localDescription });
    }
});

socket.on('waiting', (data) => {
    const waitingElement = document.createElement('div');
    waitingElement.textContent = `${data.timestamp} - ${data.msg}`;
    waitingElement.classList.add('chat-message');
    chatBox.appendChild(waitingElement);
    chatBox.scrollTop = chatBox.scrollHeight;
});

socket.on('offer', async (data) => {
    if (!peerConnection) {
        createPeerConnection();
    }
    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    socket.emit('answer', { room: room, answer: peerConnection.localDescription });
});

socket.on('answer', async (data) => {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
});

socket.on('ice-candidate', (data) => {
    const candidate = new RTCIceCandidate(data.candidate);
    peerConnection.addIceCandidate(candidate);
});

function startVideo() {
    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        .then(stream => {
            localVideo.srcObject = stream;
            localStream = stream;
            createPeerConnection();
        })
        .catch(error => {
            console.error('Error accessing media devices.', error);
        });
}

function createPeerConnection() {
    peerConnection = new RTCPeerConnection(config);

    peerConnection.onicecandidate = ({ candidate }) => {
        if (candidate) {
            socket.emit('ice-candidate', { room: room, candidate: candidate });
        }
    };

    peerConnection.ontrack = ({ streams: [stream] }) => {
        remoteVideo.srcObject = stream;
        remoteStream = stream;
    };

    localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
    });
}
