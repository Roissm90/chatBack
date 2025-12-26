const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

// Configura tus credenciales (ponlas en tu .env)
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Configuramos dónde y cómo se guardan las fotos
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'chat_avatars', // Nombre de la carpeta en tu Cloudinary
    allowed_formats: ['jpg', 'png', 'jpeg'],
    transformation: [{ width: 200, height: 200, crop: 'fill' }] // La recorta a cuadrado automáticamente
  },
});

const upload = multer({ storage: storage });

module.exports = { upload, cloudinary };