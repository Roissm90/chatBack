const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

// Forzamos la configuración con los valores que sabemos que funcionan
cloudinary.config({
  cloud_name: 'roissm90', // Ponlo directamente como string para probar
  api_key: '225251422681193', 
  api_secret: 'ZWRK6UXUn0jXgnuuMZqbm026d_M' 
});

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'chat_avatars',
    allowed_formats: ['jpg', 'png', 'jpeg'],
  },
});

const upload = multer({ storage: storage });

module.exports = { upload, cloudinary };