// backend/server.js

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

// Configuración de CORS
const io = new Server(server, {
  cors: {
    origin: "*", // Cambia esto a la URL de tu frontend en producción
    methods: ["GET", "POST"],
  },
});

const PORT = process.env.PORT || 3000;

// Ruta de prueba
app.get('/', (req, res) => {
  res.send('¡Servidor funcionando!');
});

// Almacenar usuarios conectados
const usuarios = {}; // socket.id => username

io.on('connection', (socket) => {
  console.log('Usuario conectado:', socket.id);

  // Cuando un usuario entra al chat con su username
  socket.on('join', ({ username }) => {
    usuarios[socket.id] = username;
    console.log(`${username} se ha unido al chat`);

    // Avisar a todos menos a él que alguien se unió
    socket.broadcast.emit('user-joined', { username });
  });

  // Cuando un usuario envía un mensaje
  socket.on('mensaje', (msg) => {
    const username = usuarios[socket.id] || 'Anon';
    io.emit('mensaje', { user: username, text: msg });
  });

  // Cuando un usuario se desconecta
  socket.on('disconnect', () => {
    const username = usuarios[socket.id] || 'Anon';
    console.log('Usuario desconectado:', username);
    delete usuarios[socket.id];

    // Avisar a los demás que alguien se desconectó
    socket.broadcast.emit('user-left', { username });
  });
});

// Iniciar servidor
server.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
});
