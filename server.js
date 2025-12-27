const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const cors = require("cors");
const multer = require("multer");
const cloudinary = require("cloudinary").v2;
require("dotenv").config();
const User = require("./models/User");
const Message = require("./models/Messaje");

// --- CONFIGURACIÓN DIRECTA DE CLOUDINARY ---
cloudinary.config({
  cloud_name: "do0s2lutu",
  api_key: "225251422681193",
  api_secret: "ZWRK6UXUn0jXgnuuMZqbm026d_M",
});

// Cambiamos a memoryStorage para evitar el error del cloud_name en el handshake inicial
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

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

// --- RUTA PARA SUBIR AVATAR (MODIFICADA PARA SUBIDA DIRECTA) ---
app.post("/upload-avatar", upload.single("avatar"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No hay archivo" });
  }

  // Subida manual a Cloudinary vía Stream para saltarnos el fallo de la librería
  const uploadStream = cloudinary.uploader.upload_stream(
    { folder: "chat_avatars" },
    (error, result) => {
      if (error) {
        console.error("❌ ERROR CLOUDINARY DIRECTO:", error);
        return res.status(500).json({ error: error.message });
      }
      console.log("✅ Imagen subida correctamente:", result.secure_url);
      res.json({ url: result.secure_url });
    }
  );

  uploadStream.end(req.file.buffer);
});

io.on("connection", (socket) => {
  // --- EVENTO JOIN (Registro e Inicio de Sesión) ---
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
          return socket.emit(
            "user-error",
            "Este email ya pertenece a otro alias."
          );
        }
        const esValida = await bcrypt.compare(password, userByEmail.password);
        if (!esValida) {
          return socket.emit("user-error", "Contraseña incorrecta.");
        }
        user = userByEmail;
      } else if (userByUsername) {
        return socket.emit(
          "user-error",
          "Este alias ya está registrado con otro email."
        );
      } else {
        try {
          const passRegex =
            /^(?=.*[A-Za-z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{6,}$/;

          if (!passRegex.test(password)) {
            return socket.emit(
              "user-error",
              "La contraseña debe tener al menos 6 caracteres, una letra, un número y un símbolo (@$!%*?&)."
            );
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
            return socket.emit(
              "user-error",
              validationError.errors.password.message
            );
          }
          throw validationError;
        }
      }

      usuariosConectados[user._id.toString()] = socket.id;
      socket.mongoId = user._id.toString();
      socket.username = user.username;
      io.emit("usuario-estado", {
        userId: user._id.toString(),
        estado: "online",
      });

      socket.emit("init-session", {
        userId: user._id.toString(),
        tempName: user.username,
        tempEmail: user.email,
        tempAvatar: user.avatar,
      });

      const lista = await User.find({}, "username _id avatar");
      io.emit("lista-usuarios-global", lista);
    } catch (e) {
      console.log("Error en Join:", e);
      socket.emit("user-error", "Error interno en el servidor.");
    }
  });

  socket.on("check-online", ({ userId }) => {
    const estado = usuariosConectados[userId] ? "online" : "offline";
    socket.emit("respuesta-online", { userId, estado });
  });

  socket.on("update-avatar", async ({ url }) => {
    try {
      if (!socket.mongoId) return;
      await User.findByIdAndUpdate(socket.mongoId, { avatar: url });
      const lista = await User.find({}, "username _id avatar");
      io.emit("lista-usuarios-global", lista);
      console.log(`✅ Avatar actualizado para el usuario: ${socket.username}`);
    } catch (e) {
      console.error("Error al actualizar avatar en la DB:", e);
    }
  });

  socket.on("get-chat", async ({ withUserId }) => {
    const miId = socket.mongoId; // Tu ID de usuario

    try {
      await Message.updateMany(
        {
          fromUserId: withUserId,
          toUserId: miId,
          visto: false,
        },
        { $set: { visto: true } }
      );

      const mensajes = await Message.find({
        $or: [
          { fromUserId: miId, toUserId: withUserId },
          { fromUserId: withUserId, toUserId: miId },
        ],
      }).sort({ timestamp: 1 });

      socket.emit("historial", mensajes);
    } catch (err) {
      console.error("Error al obtener/actualizar chat:", err);
    }
  });

  socket.on("escribiendo", ({ toUserId }) => {
    const socketDestino = usuariosConectados[toUserId];
    if (socketDestino) {
      io.to(socketDestino).emit("usuario-escribiendo", {
        fromUserId: socket.mongoId,
      });
    }
  });

  socket.on("deja-escribiendo", ({ toUserId }) => {
    const socketDestino = usuariosConectados[toUserId];
    if (socketDestino) {
      io.to(socketDestino).emit("usuario-estado-deja-escribiendo", {
        fromUserId: socket.mongoId,
      });
    }
  });

  socket.on("mensaje", async (data) => {
    const { text, toUserId } = data;
    const fromUserId = socket.mongoId;

    const nuevoMensaje = new Message({
      text,
      fromUserId, // El ID de quien envía
      toUserId, // El ID de quien recibe
      user: socket.username,
      timestamp: new Date(),
      visto: false,
    });

    await nuevoMensaje.save();

    const socketDestino = usuariosConectados[toUserId];
    if (socketDestino) {
      io.to(socketDestino).emit("mensaje", nuevoMensaje);
    }

    socket.emit("mensaje", nuevoMensaje);
  });

  socket.on("marcar-visto", async ({ messageId }) => {
    await Message.findByIdAndUpdate(messageId, { visto: true });
  });

  socket.on("disconnect", () => {
    console.log(
      `Intentando desconectar socket: ${socket.id}, MongoID: ${socket.mongoId}`
    );

    if (socket.mongoId) {
      const idParaBorrar = socket.mongoId;

      delete usuariosConectados[idParaBorrar];

      io.emit("usuario-estado", { userId: idParaBorrar, estado: "offline" });

      console.log(`✅ Usuario ${socket.username} marcado como OFFLINE`);
    }
  });

  socket.on("reset-all-chats", async () => {
    try {
      await User.updateMany({}, { $set: { conversations: [] } });
      console.log("✅ Todos los chats han sido borrados de la DB");
    } catch (e) {
      console.log("Error al resetear chats:", e);
    }
  });
});

// Prueba de diagnóstico al arrancar
const testCloudinary = async () => {
  try {
    const result = await cloudinary.api.ping();
    console.log("✅ Conexión con Cloudinary establecida:", result.status);
  } catch (err) {
    console.error(
      "❌ Cloudinary sigue rechazando las credenciales:",
      err.message
    );
  }
};
testCloudinary();

server.listen(process.env.PORT || 10000, () => {
  console.log(`🚀 Servidor corriendo en puerto ${process.env.PORT || 10000}`);
});
