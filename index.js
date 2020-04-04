const PORT = process.env.PORT || 5000;
const uuid = require('uuid');
const io = require('socket.io')(PORT);
const fs = require('fs'); 

let rooms = [];
let users = [];
let whiteCards = [];
let blackCards = [];

fs.readFile('./inc/whiteCards.json', 'utf8', function(err, data) {
    if (err) throw err;
    whiteCards = JSON.parse(data);
});

fs.readFile('./inc/blackCards.json', 'utf8', function(err, data) {
    if (err) throw err;
    blackCards = JSON.parse(data);
});

function getRandomWhiteCards() {
    const randomCards = [];
    let i = 0;
    while(i < 10) {
        randomCards.push(whiteCards[parseInt(Math.random() * 471 - 1)]);
        i += 1;
    }
    return randomCards;
}

function getRandomBlackCard() {
    return blackCards[parseInt(Math.random() * 76 - 1)].text;
}


io.on('connection', (socket) => {
    socket.on('new-room', (nickname) => {
        const key = uuid.v4();
        rooms.push({
            key,
            users: [{
                nickname,
                socketId: socket.id,
                admin: true,
                score: 0,
                hasPicked: false,
                currentPick: ''
            }],
            czar: 0,
            playing: false,
            picks: [],
            currentBlackCard: ''
        });
        users.push({socketId: socket.id, key, admin: true});
        socket.emit('room-created', key, nickname);
    });

    socket.on('join-room', (nickname, key) => {
        let isValid = false;
        rooms.forEach(r => {
            if(r.key === key)
                isValid = true;
        });
        if(isValid) {
            rooms.forEach(r => {
                if(r.key === key) {
                    r.users.forEach(u => socket.to(u.socketId).emit('user-joined', nickname));
                    r.users.push({nickname, socketId: socket.id, admin: false, score: 0});
                    if(r.users.length === 2) {
                        r.currentBlackCard = getRandomBlackCard();
                    }
                    r.playing = true;
                }
            });
            users.push({socketId: socket.id, key, admin: false, hasPicked: false, currentPick: ''});
            socket.emit('joined', key, nickname);
        } else {
            socket.emit('error-caused');
        }
    });

    socket.on('get-room-info', (key) => {
        const room = rooms.filter(r => r.key === key)[0];
        if(room)
            socket.emit('got-room-info', room);
        else
            socket.emit('error-get-room-info');
    });

    socket.on('disconnect', () => {
        let key;

        //Remove user from rooms array
        rooms.forEach(r => {
            r.users = r.users.filter(u => u.socketId !== socket.id);
        });

        //Get Key
        users.forEach(u => {
            if(u.socketId === socket.id) {
                if(!u.admin) {
                    key = u.key;
                } else {
                    rooms.forEach(r => {
                        if(r.key === u.key) {
                            r.users.forEach(u => socket.to(u.socketId).emit('game-ended'));
                        }
                    });
                    rooms = rooms.filter(r => r.key !== u.key);
                }
            }
        });

        //Delete User
        users = users.filter(u => u.socketId !== socket.id);

        //Send info to the room
        if(rooms.length > 0 && key) {
            rooms.forEach(r => {
                if(r.key === key) {
                    r.users.forEach(u => socket.to(u.socketId).emit('user-disconnected'));
                }
            });
        }
    });
    
    socket.on('request-cards', () => socket.emit('get-cards', getRandomWhiteCards()));

    socket.on('player-picked', (key, pick) => {
        rooms.forEach(r => {
            if(r.key === key) {
                r.picks.push({socketId: socket.id, pick: pick});
                r.users.forEach(u => {
                    if(u.socketId === socket.id) {
                        u.hasPicked = true;
                        u.currentPick = pick;
                    }
                });
                r.users.forEach(u => socket.to(u.socketId).emit('someone-picked', r));
                socket.emit('someone-picked', r)
            }
        })
    });

    socket.on('round-ended', (gameKey, userSocketId) => {
        rooms.forEach(r => {
            if(r.key === gameKey) {
                let winner = '';
                r.users.forEach(u => {
                    if(u.socketId === userSocketId) {
                        u.score++;
                        winner = u.nickname;
                    }
                    r.hasPicked = false;
                    r.pick = '';
                });
                if(r.czar === r.users.length - 1)
                    r.czar = 0;
                else
                    r.czar = r.czar + 1;
                r.currentBlackCard = getRandomBlackCard();
                r.picks = [];
                r.users.forEach(u => socket.to(u.socketId).emit('new-round', r, winner));
                socket.emit('new-round', r, winner);
            }
        });
    });
});