const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app=express(), server=http.createServer(app), io=new Server(server);
const db=new Database('connectnow.sqlite');
const PORT=process.env.PORT||3002;
const uploadDir=path.join(__dirname,'uploads');
fs.mkdirSync(uploadDir,{recursive:true});
db.exec(`CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,username TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL);`);
app.use(express.json({limit:'2mb'}));
app.use(express.urlencoded({extended:true}));
app.use(session({secret:process.env.SESSION_SECRET||'change-this-local-demo-secret',resave:false,saveUninitialized:false,cookie:{httpOnly:true,sameSite:'lax'}}));
app.use(express.static(path.join(__dirname,'public')));
app.use('/uploads',express.static(uploadDir));
function auth(req,res,next){if(!req.session.userId)return res.status(401).json({error:'Please log in first.'});next();}
app.post('/api/register',async(req,res)=>{
 const username=String(req.body.username||'').trim(),password=String(req.body.password||'');
 if(username.length<3||password.length<6)return res.status(400).json({error:'Username must be 3+ characters and password 6+ characters.'});
 try{const r=db.prepare('INSERT INTO users(username,password_hash) VALUES(?,?)').run(username,await bcrypt.hash(password,10));req.session.userId=r.lastInsertRowid;req.session.username=username;res.json({id:r.lastInsertRowid,username});}
 catch{res.status(409).json({error:'That username is already taken.'});}
});
app.post('/api/login',async(req,res)=>{
 const u=db.prepare('SELECT * FROM users WHERE username=?').get(String(req.body.username||'').trim());
 if(!u||!(await bcrypt.compare(String(req.body.password||''),u.password_hash)))return res.status(401).json({error:'Invalid username or password.'});
 req.session.userId=u.id;req.session.username=u.username;res.json({id:u.id,username:u.username});
});
app.post('/api/logout',(req,res)=>req.session.destroy(()=>res.json({ok:true})));
app.get('/api/me',(req,res)=>res.json(req.session.userId?{id:req.session.userId,username:req.session.username}:null));
const rooms=new Map();
function roomKey(s){return String(s||'').trim().replace(/[^a-zA-Z0-9_-]/g,'').slice(0,32)||'lobby';}
io.on('connection',socket=>{
 socket.on('join-room',data=>{
   const room=roomKey(data?.room);socket.data.room=room;socket.data.username=String(data?.username||'Guest').slice(0,30);
   socket.join(room);socket.to(room).emit('peer-joined',{id:socket.id,username:socket.data.username});
   const peers=[...io.sockets.adapter.rooms.get(room)||[]].filter(id=>id!==socket.id).map(id=>({id,username:io.sockets.sockets.get(id)?.data.username||'Guest'}));
   socket.emit('room-peers',peers);io.to(room).emit('system-message',`${socket.data.username} joined room ${room}`);
 });
 socket.on('chat-message',text=>{
   const room=socket.data.room;if(!room)return;
   const safe=String(text||'').trim().slice(0,1000);if(safe)io.to(room).emit('chat-message',{username:socket.data.username||'Guest',text:safe,time:new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})});
 });
 socket.on('webrtc-offer',data=>io.to(data.to).emit('webrtc-offer',{from:socket.id,offer:data.offer,username:socket.data.username}));
 socket.on('webrtc-answer',data=>io.to(data.to).emit('webrtc-answer',{from:socket.id,answer:data.answer}));
 socket.on('webrtc-ice',data=>io.to(data.to).emit('webrtc-ice',{from:socket.id,candidate:data.candidate}));
 socket.on('whiteboard-draw',data=>{if(socket.data.room)socket.to(socket.data.room).emit('whiteboard-draw',data);});
 socket.on('whiteboard-clear',()=>{if(socket.data.room)socket.to(socket.data.room).emit('whiteboard-clear');});
 socket.on('disconnect',()=>{if(socket.data.room)socket.to(socket.data.room).emit('peer-left',{id:socket.id});});
});
app.post('/api/upload',auth,(req,res)=>{
 // Simple JSON/base64 upload keeps this starter dependency-light; limited size is enforced by express.json.
 const name=String(req.body.name||'file').replace(/[^a-zA-Z0-9._-]/g,'_').slice(0,100);
 const data=String(req.body.data||'');
 const match=data.match(/^data:([a-zA-Z0-9.+/-]+);base64,([A-Za-z0-9+/=]+)$/);
 if(!match)return res.status(400).json({error:'Invalid file data.'});
 const buffer=Buffer.from(match[2],'base64');
 if(buffer.length>1_000_000)return res.status(413).json({error:'Files must be smaller than 1 MB in this demo.'});
 const stored=`${Date.now()}-${name}`,dest=path.join(uploadDir,stored);
 fs.writeFile(dest,buffer,err=>{if(err)return res.status(500).json({error:'Could not save file.'});res.json({name,url:'/uploads/'+encodeURIComponent(stored)});});
});
server.listen(PORT,()=>console.log(`ConnectNow running at http://localhost:${PORT}`));
