const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// Servir archivos estáticos si los tienes
app.use(express.static('public'));

// Ruta de prueba
app.get('/', (req, res) => {
  res.send('¡Servidor funcionando!');
});

// Manejo de sockets
io.on('connection', (socket) => {
  console.log('Un usuario se ha conectado');

  socket.on('mensaje', (msg) => {
    console.log('Mensaje recibido: ', msg);
    io.emit('mensaje', msg);
  });

  socket.on('disconnect', () => {
    console.log('Un usuario se ha desconectado');
  });
});

// Arrancar servidor
server.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
});
