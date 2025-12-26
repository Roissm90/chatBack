const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

cloudinary.config({
  cloud_name: 'roissm90',
  api_key: '225251422681193',
  api_secret: 'ZWRK6UXUn0jXgnuuMZqbm026d_M'
});

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {
    return {
      folder: 'chat_avatars',
      allowed_formats: ['jpg', 'png', 'jpeg'],
      public_id: `avatar-${Date.now()}`
    };
  },
});

const upload = multer({ storage: storage });

module.exports = { upload, cloudinary };