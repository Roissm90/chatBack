const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
require("dotenv").config();

const User = require("./models/User");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

const PORT = process.env.PORT || 10000;

// 🔌 Conectar MongoDB Atlas
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ Conectado a MongoDB Atlas"))
  .catch((err) => console.error("❌ Error de conexión:", err));

app.get("/", (req, res) => res.send("Servidor funcionando"));

// Guardaremos objetos con { username, id } mapeados por el socket.id
const usuariosActivos = {};

io.on("connection", (socket) => {
  console.log("Usuario conectado:", socket.id);

  socket.on("join", async ({ username }) => {
    try {
      // 1. Buscamos o creamos el usuario por su nombre (Alias)
      let user = await User.findOne({ username });
      if (!user) {
        user = await User.create({ username, conversations: [] });
      }

      // 2. Guardamos en memoria el socket con su ID real de MongoDB
      usuariosActivos[socket.id] = { 
        username: user.username, 
        mongoId: user._id.toString() 
      };

      // 3. Enviamos al frontend SU ID UNICO (init-session)
      socket.emit("init-session", { userId: user._id.toString() });

      // 4. Buscamos su historial. 
      // Por ahora buscamos la conversación "General" para que no vea todo vacío
      const convGeneral = user.conversations.find((c) => c.withUser === "General");
      const historial = convGeneral ? convGeneral.messages : [];

      console.log(`Historial de ${username}: ${historial.length} mensajes encontrados.`);
      socket.emit("historial", historial);

      // 5. Notificamos a todos los usuarios conectados con la lista actualizada
      const listaNombres = Object.values(usuariosActivos).map(u => u.username);
      io.emit("usuarios-conectados", listaNombres);

    } catch (error) {
      console.error("Error en join:", error);
    }
  });

  socket.on("mensaje", async ({ text, fromUserId }) => {
    const infoUsuario = usuariosActivos[socket.id];
    if (!infoUsuario || !text) return;

    const mensajeObj = {
      user: infoUsuario.username,
      text: text,
      timestamp: new Date(),
    };

    try {
      // 1. Guardamos el mensaje en el documento del emisor (bajo "General")
      // Usamos findById porque es más seguro que el nombre
      const emisor = await User.findById(infoUsuario.mongoId);
      if (emisor) {
        let conv = emisor.conversations.find((c) => c.withUser === "General");
        if (!conv) {
          emisor.conversations.push({ withUser: "General", messages: [mensajeObj] });
        } else {
          conv.messages.push(mensajeObj);
        }
        await emisor.save();
      }

      // 2. IMPORTANTE: Enviamos el mensaje a TODOS en tiempo real
      console.log(`[Mensaje] ${infoUsuario.username}: ${text}`);
      io.emit("mensaje", mensajeObj);

    } catch (error) {
      console.error("Error al guardar mensaje:", error);
    }
  });

  socket.on("disconnect", () => {
    if (usuariosActivos[socket.id]) {
      const nombre = usuariosActivos[socket.id].username;
      delete usuariosActivos[socket.id];
      const listaNombres = Object.values(usuariosActivos).map(u => u.username);
      io.emit("usuarios-conectados", listaNombres);
      console.log(`Usuario desconectado: ${nombre}`);
    }
  });
});

server.listen(PORT, () => console.log(`Servidor en puerto ${PORT}`));