const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const cors = require("cors");
require("dotenv").config();
const User = require("./models/User");


const app = express();
app.use(cors({ origin: "*" })); 
app.use(express.json()); 

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ Atlas Conectado"))
  .catch((err) => console.error("❌ Error Mongo:", err));

const usuariosConectados = {};

const { upload } = require("./utils/cloudinary");

app.post("/upload-avatar", upload.single("avatar"), (req, res) => {
  try {
    if (!req.file) {
        console.log("❌ No se recibió archivo en el servidor");
        return res.status(400).json({ error: "No hay archivo" });
    }
    console.log("✅ Archivo subido a Cloudinary:", req.file.path);
    res.json({ url: req.file.path });
  } catch (error) {
    console.error("❌ Error CRÍTICO en /upload-avatar:", error);
    res.status(500).json({ error: error.message || "Error al subir a Cloudinary" });
  }
});

io.on("connection", (socket) => {
  socket.on("join", async ({ username, email, password, avatar }) => { 
    try {
      if (!email || !username || !password) {
        return socket.emit("user-error", "Todos los campos son obligatorios.");
      }

      const cleanEmail = email.toLowerCase().trim();
      const cleanUsername = username.trim();

      let userByEmail = await User.findOne({ email: cleanEmail });
      let userByUsername = await User.findOne({ username: cleanUsername });

      let user;

      if (userByEmail) {
        if (userByEmail.username !== cleanUsername) {
          return socket.emit("user-error", "Este email ya pertenece a otro alias.");
        }
        const esValida = await bcrypt.compare(password, userByEmail.password);
        if (!esValida) {
          return socket.emit("user-error", "Contraseña incorrecta.");
        }
        user = userByEmail;
      } else if (userByUsername) {
        return socket.emit("user-error", "Este alias ya está registrado con otro email.");
      } else {
        try {
          const passRegex = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{6,}$/;

          if (!passRegex.test(password)) {
            return socket.emit("user-error", "La contraseña debe tener al menos 6 caracteres, una letra, un número y un símbolo (@$!%*?&).");
          }

          const salt = await bcrypt.genSalt(10);
          const passwordHasheada = await bcrypt.hash(password, salt);

          user = new User({
            username: cleanUsername,
            email: cleanEmail,
            password: passwordHasheada,
            avatar: avatar || undefined,
            conversations: [],
          });

          await user.save({ validateBeforeSave: false });
        } catch (validationError) {
          if (validationError.errors && validationError.errors.password) {
            return socket.emit("user-error", validationError.errors.password.message);
          }
          throw validationError;
        }
      }

      usuariosConectados[user._id.toString()] = socket.id;
      socket.mongoId = user._id.toString();
      socket.username = user.username;

      socket.emit("init-session", {
        userId: user._id.toString(),
        tempName: user.username,
        tempEmail: user.email,
        tempAvatar: user.avatar
      });

      const lista = await User.find({}, "username _id avatar"); 
      io.emit("lista-usuarios-global", lista);
    } catch (e) {
      console.log("Error:", e);
      socket.emit("user-error", "Error interno en el servidor.");
    }
  });

  socket.on("update-avatar", async ({ url }) => {
    try {
      if (!socket.mongoId) return;
      
      await User.findByIdAndUpdate(socket.mongoId, { avatar: url });
      
      const lista = await User.find({}, "username _id avatar"); 
      io.emit("lista-usuarios-global", lista);
      
      console.log(`✅ Avatar actualizado para ${socket.username}`);
    } catch (e) {
      console.error("Error al actualizar avatar:", e);
    }
  });

  socket.on("get-chat", async ({ withUserId }) => {
    try {
      if (!socket.mongoId) return;
      const user = await User.findById(socket.mongoId);
      const conv = user.conversations.find((c) => c.withUser === withUserId);
      socket.emit("historial", conv ? conv.messages : []);
    } catch (e) {
      console.log(e);
    }
  });

  socket.on("mensaje", async ({ text, toUserId }) => {
    if (!socket.mongoId || !toUserId || !text) return;

    const mensajeObj = {
      user: socket.username,
      text,
      timestamp: new Date(),
    };

    try {
      for (let id of [socket.mongoId, toUserId]) {
        const targetId = id === socket.mongoId ? toUserId : socket.mongoId;
        const persona = await User.findById(id);
        if (!persona) continue;

        let c = persona.conversations.find((conv) => conv.withUser === targetId);
        if (!c) {
          persona.conversations.push({
            withUser: targetId,
            messages: [mensajeObj],
          });
        } else {
          c.messages.push(mensajeObj);
        }
        await persona.save();
      }

      socket.emit("mensaje", mensajeObj);
      const receptorSocketId = usuariosConectados[toUserId];
      if (receptorSocketId) {
        io.to(receptorSocketId).emit("mensaje", mensajeObj);
      }
    } catch (e) {
      console.log(e);
    }
  });

  socket.on("disconnect", () => {
    if (socket.mongoId) delete usuariosConectados[socket.mongoId];
  });

  socket.on("reset-all-chats", async () => {
    try {
      await User.updateMany({}, { $set: { conversations: [] } });
      console.log("✅ Chats reseteados");
    } catch (e) {
      console.log("Error reset:", e);
    }
  });
});

server.listen(process.env.PORT || 10000);