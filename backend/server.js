// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: ["*"], methods: ["GET","POST"] }
});

const rooms = {}; // { roomId: { members: Set(socketId), controller: socketId, info: {displayName map}} }

io.on('connection', (socket) => {
  console.log('conn', socket.id);

  socket.on('join', ({roomId, displayName, createAsPrivate}) => {
    socket.join(roomId);
    if(!rooms[roomId]) rooms[roomId] = { members: new Set(), controller: null, names: {} };
    rooms[roomId].members.add(socket.id);
    rooms[roomId].names[socket.id] = displayName || socket.id;

    // assign controller if none
    if(!rooms[roomId].controller) rooms[roomId].controller = socket.id;

    // build list of other peers
    const peers = Array.from(rooms[roomId].members).filter(id => id !== socket.id);
    socket.emit('room-joined', { peers });
    // notify room of updated info
    io.to(roomId).emit('room-info', {
      roomId,
      controllerId: rooms[roomId].controller,
      controllerName: rooms[roomId].names[rooms[roomId].controller],
      members: Array.from(rooms[roomId].members).map(id => ({id,name:rooms[roomId].names[id]}))
    });
    console.log(`${socket.id} joined ${roomId}`);
  });

  socket.on('signal', ({to, data}) => {
    if(!to) return;
    io.to(to).emit('signal', { from: socket.id, data });
  });

  socket.on('chat', ({roomId, msg}) => {
    io.to(roomId).emit('chat', msg);
  });

  socket.on('loadVideo', ({roomId, url}) => {
    io.to(roomId).emit('loadVideo', {url, by: socket.id});
  });

  socket.on('reaction', ({roomId, emoji, from}) => {
    io.to(roomId).emit('reaction', {emoji, from});
  });

  socket.on('change-control', ({roomId, to, name}) => {
    if(!rooms[roomId]) return;
    if(rooms[roomId].members.has(to)){
      rooms[roomId].controller = to;
      io.to(roomId).emit('controlChanged', {controllerId: to, controllerName: rooms[roomId].names[to]});
    }
  });

  socket.on('leave', ({roomId})=>{
    leaveRoom(socket, roomId);
  });

  socket.on('disconnect', ()=>{
    // remove from all rooms
    for(const roomId of Object.keys(rooms)){
      if(rooms[roomId].members.has(socket.id)){
        leaveRoom(socket, roomId);
      }
    }
  });
});

function leaveRoom(socket, roomId){
  if(!rooms[roomId]) return;
  rooms[roomId].members.delete(socket.id);
  delete rooms[roomId].names[socket.id];
  io.to(roomId).emit('peer-left', socket.id);
  // if controller left -> assign new
  if(rooms[roomId].controller === socket.id){
    const next = rooms[roomId].members.values().next().value || null;
    rooms[roomId].controller = next;
    io.to(roomId).emit('controlChanged', {controllerId: next, controllerName: next ? rooms[roomId].names[next] : null});
  }
  if(rooms[roomId].members.size === 0){
    delete rooms[roomId];
  } else {
    io.to(roomId).emit('room-info', {
      roomId,
      controllerId: rooms[roomId].controller,
      controllerName: rooms[roomId].names[rooms[roomId].controller],
      members: Array.from(rooms[roomId].members).map(id => ({id,name:rooms[roomId].names[id]}))
    });
  }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, ()=> console.log('signaling server listening on', PORT));
