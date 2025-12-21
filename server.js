const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*", // Cambia por la URL de tu frontend en producción
    methods: ["GET", "POST"],
  },
});

const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("¡Servidor funcionando!");
});

// Usuarios conectados: socket.id => username
const usuarios = {};

io.on("connection", (socket) => {
  console.log("Usuario conectado:", socket.id);

  // Usuario se une al chat
  socket.on("join", ({ username }) => {
    usuarios[socket.id] = username;
    console.log(`${username} se ha unido al chat`);

    // Avisar a todos menos a él
    socket.broadcast.emit("user-joined", { username });

    // Enviar lista actualizada a todos
    io.emit("usuarios-conectados", Object.values(usuarios));
  });

  // Usuario envía un mensaje
  socket.on("mensaje", (msg) => {
    const username = usuarios[socket.id] || "User";
    const mensajeObj = {
      user: username,
      text: msg.text,         // Asegúrate de que msg es objeto con { text }
      timestamp: msg.timestamp || Date.now(),
    };
    io.emit("mensaje", mensajeObj);
  });

  // Usuario se desconecta
  socket.on("disconnect", () => {
    const username = usuarios[socket.id] || "Anon";
    console.log("Usuario desconectado:", username);
    delete usuarios[socket.id];

    // Actualizar lista de usuarios conectados
    io.emit("usuarios-conectados", Object.values(usuarios));

    // Avisar a los demás
    socket.broadcast.emit("user-left", { username });
  });
});

server.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
});
