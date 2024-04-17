const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const User = require('./models/Users');
const MessageModel = require('./models/Message');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const bycript = require('bcryptjs');
const ws = require('ws')
const fs = require('fs')

const jwtSecret = process.env.JWT_SECRET_KEY;
mongoose.connect(process.env.MONGO_URL);

const app = express();
app.use('/uploads', express.static(__dirname + '/uploads'))
app.use(express.json());
app.use(cookieParser())
app.use(cors({
    credentials: true,
    origin: process.env.HOST
}));
const byptSalt = bycript.genSaltSync(10);

async function getUserDataFromRequest(req) {
    return new Promise((resolve, reject) => {
        const token = req.cookies?.token;
        if (token) {
            jwt.verify(token, jwtSecret, {}, (err, userData) => {
                if (err) throw err;
                resolve(userData)
            })
        }
        else {
            reject('No Token')
        }
    })
}


app.get('/test', (req, res) => {
    res.json({ message: 'Test ok' });
});

app.get('/messages/:userId', async (req, res) => {
    const { userId } = req.params
    const userData = await getUserDataFromRequest(req)
    const ourId = userData.userId;
    const messages = await MessageModel.find({
        sender: { $in: [ourId, userId] },
        recepient: { $in: [ourId, userId] }
    }).sort({ createdAt: 1 })

    res.json(messages)
})

app.get('/people', async (req, res) => {
    const Users = await User.find({}, { "_id": 1, username: 1 });
    res.json(Users)
})

app.get('/profile', (req, res) => {
    const token = req.cookies?.token;
    if (token) {
        jwt.verify(token, jwtSecret, {}, (err, userData) => {
            if (err) throw err;
            res.json(userData)
        })
    }
    else {
        res.status(401).json('No Token')
    }
})


app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const foundUser = await User.findOne({ username });
    if (foundUser) {
        const passOk = bycript.compare(password, foundUser.password);
        if (passOk) {
            console.log({ userId: foundUser._id, username });
            jwt.sign({ userId: foundUser._id, username }, jwtSecret, {}, (err, token) => {
                if (err) throw err;
                res.cookie('token', token, { sameSite: 'none', secure: true }).status(201).json({
                    id: foundUser._id,
                });
            })
        }
    }
})

app.post('/logout', (req, res) => {
    res.cookie('token', '', { sameSite: 'none', secure: true }).json('ok')
})


app.post('/register', async (req, res) => {
    const { username, password } = req.body;
    try {
        const createdUser = await User.create({
            username,
            password: bycript.hashSync(password, byptSalt)
        });
        jwt.sign({ userId: createdUser._id, username: username }, jwtSecret, {}, (err, token) => {

            if (err) throw err;

            res.cookie('token', token, { sameSite: 'none', secure: true }).status(201).json({
                id: createdUser._id,
            });
        });
    } catch (error) {
        console.error(error);
    }
});

const port = process.env.PORT || 4040;
const server = app.listen(port);    /*it returns an object, so we can use it to establish a connection btw   the server and websocket */



const wss = new ws.WebSocketServer({ server });


wss.on('connection', (connection, req) => {

    function notifyAboutOnlinePeople() {
        [...wss.clients].forEach((client) => {
            client.send(JSON.stringify({
                online: [...wss.clients].map(u => ({ userId: u.userId, username: u.username }))
            }))
        })
    }
    connection.isAlive = true;
    connection.timer = setInterval(() => {
        connection.ping();
        connection.deathTimer = setTimeout(() => {
            connection.isALice = false;
            connection.terminate();
            notifyAboutOnlinePeople()
        }, 1000)
    }, 5000);

    connection.on('pong', () => {
        clearTimeout(connection.deathTimer);
    });

    const cookie = req.headers.cookie;

    //read the username and userId from the cookie for this connection
    if (cookie) {
        const tokenCookieString = cookie.split(';').find(str => str.startsWith('token='))
        if (tokenCookieString) {
            const token = tokenCookieString.split('=')[1];
            if (token) {
                jwt.verify(token, jwtSecret, {}, (err, userData) => {
                    if (err) throw err;
                    const { userId, username } = userData;
                    connection.userId = userId;
                    connection.username = username;
                })
            }
        }
    }

    connection.on('message', async (message) => {
        const messageData = JSON.parse(message.toString())
        console.log(messageData);
        let filename = null;
        if (messageData.message.file) {
            const parts = messageData.message.file.name.split('.');
            const ext = parts[parts.length - 1];
            filename = Date.now() + '.'+ext;
            const path = __dirname + '/uploads/' + filename;
            const bufferData = new Buffer(messageData.message.file.data.split(',')[1], 'base64')
            fs.writeFile(path, bufferData, (err) => {
                if (err) {
                    console.error('Error saving file:', err);
                } else {
                    console.log('File saved:', path);
                }
            });            
        }
        if (messageData.message.recepient && (messageData.message.text || messageData.message.file )) {
            const messageDoc = await MessageModel.create({
                sender: messageData.message.sender,
                recepient: messageData.message.recepient,
                text: messageData.message.text,
                file: messageData.message.file ? filename: null,
            })
            console.log('message created');
            const text = messageData.message.text;
            [...wss.clients].filter(c => c.userId === messageData.message.recepient)
                .forEach(c => c.send(JSON.stringify({
                    text,
                    sender: connection.userId,
                    recepient: messageData.message.recepient,
                    file: messageData.message.file ? filename: null,
                    _id: messageDoc._id
                })))
        }
    });
    //notify everyone about online people
    notifyAboutOnlinePeople()
})

wss.on('close', (data) => {
    console.log(data);
})