const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*", // Cambiar por URL de frontend en producción
    methods: ["GET", "POST"],
  },
});

const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('¡Servidor funcionando!');
});

const usuarios = {}; // socket.id => username

io.on('connection', (socket) => {
  console.log('Usuario conectado:', socket.id);

  // Usuario se une al chat
  socket.on('join', ({ username }) => {
    usuarios[socket.id] = username;
    console.log(`${username} se ha unido al chat`);

    // Avisar a todos menos a él que alguien se unió
    socket.broadcast.emit('user-joined', { username });

    // Enviar lista actualizada a todos
    io.emit('usuarios-conectados', Object.values(usuarios));
  });

  socket.on('disconnect', () => {
    const username = usuarios[socket.id] || 'Anon';
    console.log('Usuario desconectado:', username);
    delete usuarios[socket.id];
    io.emit('usuarios-conectados', Object.values(usuarios));
  });
});


server.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
});
