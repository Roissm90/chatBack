const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

// Datos extraídos de tus capturas. Configuración directa.
cloudinary.config({
  cloud_name: 'roissm90',
  api_key: '225251422681193',
  api_secret: 'ZWRK6UXUn0jXgnuuMZqbm026d_M'
});

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'chat_avatars',
    allowed_formats: ['jpg', 'png', 'jpeg'],
    transformation: [{ width: 200, height: 200, crop: 'thumb', gravity: 'face' }]
  },
});

const upload = multer({ storage: storage });

module.exports = { upload, cloudinary };