const mongoose = require('mongoose')

const userSchema = new mongoose.Schema({
    username: { type: String, unique: true },
    password: { type: String }
}, { timestamps: true })

const UserModel = mongoose.model('User', userSchema);

module.exports = UserModel;