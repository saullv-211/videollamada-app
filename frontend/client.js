const SIGNALING_SERVER = "https://videollamada-app.onrender.com";
const socket = io(SIGNALING_SERVER);

let localStream;
let peers = {};
let roomId = "sala-demo"; // se puede cambiar o generar automáticamente
let displayName = prompt("Ingresa tu nombre") || "Usuario";

async function initMedia() {
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  document.getElementById("localVideo").srcObject = localStream;
}
initMedia();

socket.emit("join", { roomId, displayName });

socket.on("room-joined", ({ peers: peerIds }) => {
  peerIds.forEach(id => createPeerConnection(id));
});

socket.on("signal", async ({ from, data }) => {
  let pc = peers[from];
  if(!pc) pc = createPeerConnection(from, false);
  if(data.sdp){
    await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
    if(data.sdp.type === "offer"){
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit("signal", { to: from, data: pc.localDescription });
    }
  } else if(data.candidate){
    await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
  }
});

function createPeerConnection(id, isInitiator = true){
  const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
  localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

  pc.onicecandidate = (event) => {
    if(event.candidate) socket.emit("signal", { to: id, data: { candidate: event.candidate } });
  };

  pc.ontrack = (event) => {
    const remoteVideo = document.getElementById("remoteVideo");
    if(remoteVideo.srcObject !== event.streams[0]) remoteVideo.srcObject = event.streams[0];
  };

  if(isInitiator){
    pc.createOffer().then(offer => {
      pc.setLocalDescription(offer);
      socket.emit("signal", { to: id, data: offer });
    });
  }

  peers[id] = pc;
  return pc;
}

socket.on("room-info", (info) => console.log("Info de la sala:", info));

socket.on("chat", (msg) => console.log("Chat:", msg));

socket.on("loadVideo", ({url}) => {
  document.getElementById("videoFrame").src = url;
});

socket.on("controlChanged", ({controllerId}) => {
  const urlInput = document.getElementById("videoURL");
  urlInput.disabled = controllerId !== socket.id;
});
