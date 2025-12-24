const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
require("dotenv").config();
const User = require("./models/User");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] } });
const PORT = process.env.PORT || 10000;

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ Conectado a MongoDB Atlas"))
  .catch((err) => console.error("❌ Error:", err));

app.get("/", (req, res) => res.send("Servidor Live"));

const usuariosActivos = {}; 

io.on("connection", (socket) => {
  socket.on("join", async ({ username }) => {
    try {
      let user = await User.findOne({ username });
      if (!user) {
        user = await User.create({ username, conversations: [{ withUser: "General", messages: [] }] });
      }

      usuariosActivos[socket.id] = { username: user.username, mongoId: user._id.toString() };

      socket.emit("init-session", { userId: user._id.toString() });

      // Enviamos el historial que tiene ESTE usuario en su campo "General"
      const conv = user.conversations.find(c => c.withUser === "General");
      socket.emit("historial", conv ? conv.messages : []);

      io.emit("usuarios-conectados", Object.values(usuariosActivos).map(u => u.username));
    } catch (error) { console.error(error); }
  });

  socket.on("mensaje", async ({ text }) => {
    const info = usuariosActivos[socket.id];
    if (!info || !text) return;

    const mensajeObj = {
      user: info.username, // Nombre real del emisor
      text: text,
      timestamp: new Date(),
    };

    try {
      // 🔥 LA SOLUCIÓN: Guardamos el mensaje en el historial de TODOS los usuarios
      // Así, cuando cualquiera recargue, el mensaje estará ahí.
      await User.updateMany(
        { "conversations.withUser": "General" },
        { $push: { "conversations.$.messages": mensajeObj } }
      );

      // Emitimos a todos en tiempo real
      io.emit("mensaje", mensajeObj);
      console.log(`Guardado y emitido: [${info.username}]: ${text}`);
    } catch (error) { console.error("Error guardando:", error); }
  });

  socket.on("disconnect", () => {
    delete usuariosActivos[socket.id];
    io.emit("usuarios-conectados", Object.values(usuariosActivos).map(u => u.username));
  });
});

server.listen(PORT, () => console.log(`Puerto ${PORT}`));