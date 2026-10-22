const $=s=>document.querySelector(s);
const socket=io();
let me=null,room='lobby',username='Guest',localStream=null,screenStream=null,joined=false;
const peers=new Map();
async function api(url,options={}){const r=await fetch('/api'+url,{headers:{'Content-Type':'application/json'},...options});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Request failed.');return d;}
function say(t){$('#appMessage').textContent=t||'';}
function escapeHtml(s=''){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
async function refreshAccount(){me=await api('/me');$('#accountArea').innerHTML=me?`<span class="muted">Hi, ${escapeHtml(me.username)}</span> <button id="logoutBtn" class="plain">Log out</button>`:'<button id="accountBtn" class="secondary">Login / Register</button>';if($('#logoutBtn'))$('#logoutBtn').onclick=async()=>{await api('/logout',{method:'POST'});me=null;refreshAccount();};if($('#accountBtn'))$('#accountBtn').onclick=()=>$('#authDialog').showModal();}
function joinRoom(){room=$('#roomInput').value.trim()||'lobby';username=$('#displayName').value.trim()||me?.username||'Guest';socket.emit('join-room',{room,username});joined=true;$('#roomLabel').textContent=room.toUpperCase();$('#connectionStatus').textContent='Connected to room';say('Joined room '+room+'. Share the room name with a teammate.');}
$('#roomForm').onsubmit=e=>{e.preventDefault();joinRoom();};
socket.on('connect',()=>{if(joined)joinRoom();});
socket.on('system-message',text=>addSystem(text));
socket.on('room-peers',list=>{list.forEach(p=>createOffer(p.id));});
socket.on('peer-joined',p=>addSystem(p.username+' is here. Connecting video when media is enabled...'));
socket.on('peer-left',p=>{closePeer(p.id);addSystem('A participant left.');});
function addSystem(text){const p=document.createElement('p');p.className='system-message';p.textContent=text;$('#chatMessages').append(p);$('#chatMessages').scrollTop=$('#chatMessages').scrollHeight;}
function addChat(m){const el=document.createElement('div');el.className='chat-bubble';const b=document.createElement('b');b.textContent=m.username+' ';const time=document.createElement('time');time.textContent=m.time||'';const p=document.createElement('p');p.textContent=m.text;el.append(b,time,p);$('#chatMessages').append(el);$('#chatMessages').scrollTop=$('#chatMessages').scrollHeight;}
$('#chatForm').onsubmit=e=>{e.preventDefault();if(!joined)joinRoom();const text=$('#chatInput').value.trim();if(text)socket.emit('chat-message',text);$('#chatInput').value='';};
socket.on('chat-message',addChat);
async function getMedia(){if(!localStream){localStream=await navigator.mediaDevices.getUserMedia({video:true,audio:true});$('#localVideo').srcObject=localStream;$('#cameraBtn').textContent='Camera enabled';}return localStream;}
function makePeer(id){if(peers.has(id))return peers.get(id);const pc=new RTCPeerConnection({iceServers:[{urls:'stun:stun.l.google.com:19302'}]});peers.set(id,pc);if(localStream)localStream.getTracks().forEach(t=>pc.addTrack(t,localStream));if(screenStream)screenStream.getTracks().forEach(t=>{if(t.kind==='video')pc.addTrack(t,screenStream);});pc.onicecandidate=e=>{if(e.candidate)socket.emit('webrtc-ice',{to:id,candidate:e.candidate});};pc.ontrack=e=>showRemote(id,e.streams[0]);pc.onconnectionstatechange=()=>{if(pc.connectionState==='failed')say('Video connection failed. A TURN server may be needed on this network.');};return pc;}
async function createOffer(id){try{if(!localStream)return;const pc=makePeer(id);const offer=await pc.createOffer();await pc.setLocalDescription(offer);socket.emit('webrtc-offer',{to:id,offer});}catch(e){say('Could not start video: '+e.message);}}
socket.on('webrtc-offer',async d=>{try{const pc=makePeer(d.from);await pc.setRemoteDescription(d.offer);const answer=await pc.createAnswer();await pc.setLocalDescription(answer);socket.emit('webrtc-answer',{to:d.from,answer});}catch(e){say('Video setup issue: '+e.message);}});
socket.on('webrtc-answer',async d=>{try{const pc=peers.get(d.from);if(pc)await pc.setRemoteDescription(d.answer);}catch(e){say(e.message);}});
socket.on('webrtc-ice',async d=>{try{const pc=peers.get(d.from);if(pc)await pc.addIceCandidate(d.candidate);}catch(e){}});
function showRemote(id,stream){let tile=document.querySelector(`[data-peer="${id}"]`);if(!tile){tile=document.createElement('div');tile.className='video-tile';tile.dataset.peer=id;const v=document.createElement('video');v.autoplay=true;v.playsInline=true;const label=document.createElement('span');label.textContent='Teammate';tile.append(v,label);$('#remoteVideos').innerHTML='';$('#remoteVideos').append(tile);}tile.querySelector('video').srcObject=stream;}
function closePeer(id){const pc=peers.get(id);if(pc)pc.close();peers.delete(id);const tile=document.querySelector(`[data-peer="${id}"]`);if(tile)tile.remove();if(!$('#remoteVideos').children.length)$('#remoteVideos').innerHTML='<div class="empty-video"><span>◎</span><p>Waiting for teammate</p></div>';}
$('#cameraBtn').onclick=async()=>{try{await getMedia();if(!joined)joinRoom();for(const [id,pc] of peers){localStream.getTracks().forEach(t=>{if(!pc.getSenders().some(s=>s.track?.kind===t.kind))pc.addTrack(t,localStream);});await createOffer(id);}say('Camera and microphone enabled.');}catch(e){say('Could not access camera/microphone. Check browser permissions and use localhost.');}};
$('#screenBtn').onclick=async()=>{try{screenStream=await navigator.mediaDevices.getDisplayMedia({video:true});const track=screenStream.getVideoTracks()[0];for(const [id,pc] of peers){const sender=pc.getSenders().find(s=>s.track?.kind==='video');if(sender)await sender.replaceTrack(track);else pc.addTrack(track,screenStream);}$('#localVideo').srcObject=screenStream;track.onended=()=>{screenStream=null;$('#localVideo').srcObject=localStream;};say('Screen sharing started.');}catch(e){say('Screen sharing was cancelled or not allowed.');}};
$('#hangupBtn').onclick=()=>{for(const [id] of peers)closePeer(id);if(localStream)localStream.getTracks().forEach(t=>t.stop());if(screenStream)screenStream.getTracks().forEach(t=>t.stop());localStream=null;screenStream=null;$('#localVideo').srcObject=null;$('#cameraBtn').textContent='Enable camera';say('Local media stopped. Room chat stays connected.');};
$('#fileForm').onsubmit=async e=>{e.preventDefault();const file=$('#fileInput').files[0];if(!file)return say('Choose a file first.');if(file.size>1_000_000)return say('Please choose a file smaller than 1 MB.');if(!me){$('#authDialog').showModal();return say('Log in or register to upload files.');}try{const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file);});const result=await api('/upload',{method:'POST',body:JSON.stringify({name:file.name,data})});socket.emit('chat-message',`Shared file: ${result.name} — ${location.origin}${result.url}`);say('File uploaded and link posted to chat.');$('#fileInput').value='';}catch(err){say(err.message);}};
async function authAction(action){const f=Object.fromEntries(new FormData($('#authForm')).entries());try{me=await api('/'+action,{method:'POST',body:JSON.stringify(f)});$('#authDialog').close();await refreshAccount();say('Signed in as '+me.username+'.');}catch(e){$('#authMessage').textContent=e.message;}}
$('#loginAction').onclick=()=>authAction('login');$('#registerAction').onclick=()=>authAction('register');$('#closeAuth').onclick=()=>$('#authDialog').close();
// Shared whiteboard drawing
const canvas=$('#whiteboard'),ctx=canvas.getContext('2d');ctx.lineCap='round';ctx.lineJoin='round';ctx.lineWidth=3;let drawing=false,last=null;
function coords(e){const r=canvas.getBoundingClientRect();return{x:(e.clientX-r.left)*canvas.width/r.width,y:(e.clientY-r.top)*canvas.height/r.height};}
function drawLine(a,b,color){ctx.strokeStyle=color||'#287a5d';ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();}
canvas.addEventListener('pointerdown',e=>{drawing=true;last=coords(e);canvas.setPointerCapture(e.pointerId);});
canvas.addEventListener('pointermove',e=>{if(!drawing||!last)return;const now=coords(e),color=$('#brushColor').value;drawLine(last,now,color);socket.emit('whiteboard-draw',{a:last,b:now,color});last=now;});
canvas.addEventListener('pointerup',()=>{drawing=false;last=null;});canvas.addEventListener('pointercancel',()=>{drawing=false;last=null;});
socket.on('whiteboard-draw',d=>drawLine(d.a,d.b,d.color));
$('#clearBoard').onclick=()=>{ctx.clearRect(0,0,canvas.width,canvas.height);socket.emit('whiteboard-clear');};
socket.on('whiteboard-clear',()=>ctx.clearRect(0,0,canvas.width,canvas.height));
refreshAccount().catch(()=>{});
