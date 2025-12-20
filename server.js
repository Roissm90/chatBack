const express = require("express");
const app = express();
const http = require("http").createServer(app);
const PORT = process.env.PORT || 3000;

const io = require("socket.io")(http, {
  cors: {
    origin: "*",
  },
});

io.on("connection", (socket) => {
  console.log("Usuario conectado");

  socket.on("chat-message", (msg) => {
    io.emit("chat-message", msg);
  });
});

http.listen(PORT, () => {
  console.log(`Backend escuchando en puerto ${PORT}`);
});