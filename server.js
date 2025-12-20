const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*", // Cambia a la URL de tu frontend si quieres seguridad
    methods: ["GET", "POST"],
  },
});

const PORT = process.env.PORT || 3000;

// Ruta de prueba
app.get('/', (req, res) => {
  res.send('¡Servidor funcionando!');
});

// Manejo de sockets
io.on('connection', (socket) => {
  console.log('Usuario conectado:', socket.id);

  socket.on('mensaje', (msg) => {
    console.log('Mensaje recibido:', msg);
    io.emit('mensaje', msg); // Enviar a todos los clientes
  });

  socket.on('disconnect', () => {
    console.log('Usuario desconectado:', socket.id);
  });
});

// Arrancar servidor
server.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
});
