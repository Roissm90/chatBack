const mongoose = require("mongoose");

const MessageSchema = new mongoose.Schema({
  user: { type: String, required: true },
  text: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
});

const ConversationSchema = new mongoose.Schema({
  withUser: { type: String, required: true },
  messages: [MessageSchema],
});

const UserSchema = new mongoose.Schema({
  username: { type: String, required: true }, // QUITADO unique: true
  email: { type: String, required: true, unique: true, lowercase: true }, 
  password: {type: String, required: true,},
  avatar: { type: String, default: "https://res.cloudinary.com/do0s2lutu/image/upload/v1766779509/user_l8spmu.png" },
  conversations: [ConversationSchema],
});

module.exports = mongoose.model("User", UserSchema);
