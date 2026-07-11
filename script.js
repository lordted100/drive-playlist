const CLIENT_ID="680156678883-s7f5c805ibivvonop8mblm4cine63trr.apps.googleusercontent.com";
const SCOPE="https://www.googleapis.com/auth/drive.readonly";
const TOKEN_KEY="driveAccessToken", EXPIRY_KEY="driveTokenExpiry";

let tokenClient,accessToken="";
let videos=JSON.parse(localStorage.getItem("videos")||"[]");
let current=Number(localStorage.getItem("current")||0);
let shuffle=localStorage.getItem("shuffle")==="true";
let gapless=localStorage.getItem("gapless")!=="false";
let repeat=localStorage.getItem("repeat")==="true";
let shuffleQueue=JSON.parse(localStorage.getItem("shuffleQueue")||"[]");
const cache=new Map(),loading=new Map();

const A=document.getElementById("playerA"),B=document.getElementById("playerB");
let active=A,standby=B,standbyIndex=-1,standbyReady=false;
const nowPlaying=document.getElementById("nowPlaying"),statusBox=document.getElementById("status"),bufferStatus=document.getElementById("bufferStatus"),playlistBox=document.getElementById("playlist"),folderInput=document.getElementById("folderInput"),connectBtn=document.getElementById("connectBtn"),loadBtn=document.getElementById("loadBtn"),prevBtn=document.getElementById("prevBtn"),nextBtn=document.getElementById("nextBtn"),shuffleBtn=document.getElementById("shuffleBtn"),gaplessBtn=document.getElementById("gaplessBtn"),repeatBtn=document.getElementById("repeatBtn"),autoConnect=document.getElementById("autoConnect");
folderInput.value=localStorage.getItem("folderLink")||"";
autoConnect.checked=localStorage.getItem("autoConnect")!=="false";

window.onload=()=>{
 tokenClient=google.accounts.oauth2.initTokenClient({client_id:CLIENT_ID,scope:SCOPE,callback:onToken,error_callback:()=>statusBox.textContent="Automatic reconnect was blocked. Tap Connect once."});
 restoreToken(); attach(A); attach(B); updateButtons(); render();
 if(accessToken){connected(); if(folderInput.value) loadFolder(false)}
 else if(autoConnect.checked){statusBox.textContent="Trying to reconnect automatically…";setTimeout(()=>{try{tokenClient.requestAccessToken({prompt:""})}catch{statusBox.textContent="Tap Connect to reconnect."}},500)}
 else statusBox.textContent="Connect to Google Drive.";
};

function onToken(r){if(!r.access_token){statusBox.textContent="Google connection failed.";return} accessToken=r.access_token;localStorage.setItem(TOKEN_KEY,accessToken);localStorage.setItem(EXPIRY_KEY,String(Date.now()+Number(r.expires_in||3500)*1000-60000));connected();if(folderInput.value)loadFolder(false)}
function restoreToken(){const t=localStorage.getItem(TOKEN_KEY),e=Number(localStorage.getItem(EXPIRY_KEY)||0);if(t&&e>Date.now())accessToken=t;else{localStorage.removeItem(TOKEN_KEY);localStorage.removeItem(EXPIRY_KEY)}}
function connected(){connectBtn.textContent="Google Drive connected";statusBox.textContent="Connected."}
connectBtn.onclick=()=>tokenClient.requestAccessToken({prompt:""});
autoConnect.onchange=()=>localStorage.setItem("autoConnect",String(autoConnect.checked));
loadBtn.onclick=()=>loadFolder(true); prevBtn.onclick=previousVideo; nextBtn.onclick=()=>advance(false);
shuffleBtn.onclick=()=>{shuffle=!shuffle;localStorage.setItem("shuffle",String(shuffle));buildQueue();updateButtons();prepareNext();render()};
gaplessBtn.onclick=()=>{gapless=!gapless;localStorage.setItem("gapless",String(gapless));updateButtons();if(gapless)prepareNext()};
repeatBtn.onclick=()=>{repeat=!repeat;localStorage.setItem("repeat",String(repeat));updateButtons()};
function updateButtons(){shuffleBtn.textContent=`True shuffle: ${shuffle?"On":"Off"}`;gaplessBtn.textContent=`Gapless: ${gapless?"On":"Off"}`;repeatBtn.textContent=`Repeat current: ${repeat?"On":"Off"}`}

function attach(p){p.addEventListener("ended",()=>{if(p!==active)return;if(repeat){active.currentTime=0;active.play()}else advance(true)});p.addEventListener("timeupdate",()=>{if(p!==active||!videos[current])return;localStorage.setItem("lastVideoId",videos[current].id);localStorage.setItem("lastTime",String(active.currentTime||0));if(active.duration&&active.currentTime/active.duration>.03)prepareNext()})}
function folderId(s){const m=s.match(/folders\/([^?]+)/);return m?m[1]:s.trim()}
async function authFetch(url){const r=await fetch(url,{headers:{Authorization:`Bearer ${accessToken}`}});if(r.status===401){accessToken="";localStorage.removeItem(TOKEN_KEY);localStorage.removeItem(EXPIRY_KEY);statusBox.textContent="Connection expired. Tap Connect once."}return r}

async function loadFolder(play=true){const link=folderInput.value.trim();if(!link)return alert("Paste your folder link first.");if(!accessToken)return alert("Tap Connect first.");localStorage.setItem("folderLink",link);statusBox.textContent="Loading playlist…";try{const q=encodeURIComponent(`'${folderId(link)}' in parents and trashed=false and mimeType contains 'video/'`),f=encodeURIComponent("files(id,name,mimeType,size)");const r=await authFetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=${f}&orderBy=name&pageSize=1000`);if(!r.ok)throw new Error(await r.text());const d=await r.json();videos=(d.files||[]).map(x=>({id:x.id,name:x.name,mimeType:x.mimeType||"video/mp4",size:Number(x.size||0)}));localStorage.setItem("videos",JSON.stringify(videos));const saved=localStorage.getItem("lastVideoId"),i=videos.findIndex(v=>v.id===saved);current=i>=0?i:Math.min(current,Math.max(0,videos.length-1));validateQueue();statusBox.textContent=`${videos.length} videos loaded.`;render();if(play&&videos.length)playIndex(current,true);else prepareNext()}catch(e){console.error(e);statusBox.textContent="Could not load the folder."}}

function buildQueue(){if(!shuffle||videos.length<2){shuffleQueue=[];saveQueue();return}shuffleQueue=videos.filter((_,i)=>i!==current).map(v=>v.id);for(let i=shuffleQueue.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[shuffleQueue[i],shuffleQueue[j]]=[shuffleQueue[j],shuffleQueue[i]]}saveQueue()}
function validateQueue(){if(!shuffle){shuffleQueue=[];saveQueue();return}const valid=new Set(videos.map(v=>v.id));shuffleQueue=shuffleQueue.filter(id=>valid.has(id)&&id!==videos[current]?.id);if(!shuffleQueue.length)buildQueue();saveQueue()}
function saveQueue(){localStorage.setItem("shuffleQueue",JSON.stringify(shuffleQueue))}
function peekNext(){if(!videos.length)return-1;if(!shuffle)return(current+1)%videos.length;validateQueue();return videos.findIndex(v=>v.id===shuffleQueue[0])}
function takeNext(){if(!shuffle)return(current+1)%videos.length;validateQueue();const id=shuffleQueue.shift();saveQueue();return videos.findIndex(v=>v.id===id)}

async function getBlob(v){if(cache.has(v.id))return cache.get(v.id);if(loading.has(v.id))return loading.get(v.id);const promise=(async()=>{const r=await authFetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(v.id)}?alt=media`);if(!r.ok)throw new Error(await r.text());const blob=await r.blob(),obj={url:URL.createObjectURL(blob),size:blob.size};cache.set(v.id,obj);loading.delete(v.id);trimCache();return obj})();loading.set(v.id,promise);return promise}

async function playIndex(i,restore=false){if(i<0||!videos[i]||!accessToken)return;current=i;standbyReady=false;standbyIndex=-1;localStorage.setItem("current",String(current));nowPlaying.textContent=videos[current].name;statusBox.textContent="Preparing video…";render();try{const b=await getBlob(videos[current]);active.src=b.url;active.load();active.onloadedmetadata=()=>{if(restore&&localStorage.getItem("lastVideoId")===videos[current].id){const t=Number(localStorage.getItem("lastTime")||0);if(t>5&&t<active.duration-5)active.currentTime=t}};await active.play().catch(()=>statusBox.textContent="Ready. Tap play once.");statusBox.textContent="Playing.";prepareNext();render()}catch(e){console.error(e);statusBox.textContent="Could not prepare this video."}}

async function prepareNext(){if(!gapless||!accessToken||!videos.length)return;const i=peekNext();if(i<0||i===current||standbyIndex===i&&standbyReady)return;try{const b=await getBlob(videos[i]);standby.src=b.url;standby.load();standbyIndex=i;await new Promise(res=>{if(standby.readyState>=2)return res();standby.addEventListener("canplay",res,{once:true});setTimeout(res,2500)});standbyReady=standby.readyState>=2;bufferStatus.textContent=standbyReady?`Next video ready: ${videos[i].name}`:`Next video downloaded: ${videos[i].name}`;render()}catch(e){console.warn(e)}}

async function advance(){const i=takeNext();if(i<0)return;localStorage.setItem("lastTime","0");if(gapless&&standbyReady&&standbyIndex===i){const old=active,newP=standby;current=i;localStorage.setItem("current",String(current));nowPlaying.textContent=videos[current].name;newP.className="video-player active-player";old.className="video-player standby-player";active=newP;standby=old;standbyReady=false;standbyIndex=-1;active.currentTime=0;await active.play().catch(()=>statusBox.textContent="Tap play to continue.");standby.pause();standby.removeAttribute("src");standby.load();statusBox.textContent="Playing.";prepareNext();render()}else playIndex(i,false)}
function previousVideo(){if(!videos.length)return;playIndex((current-1+videos.length)%videos.length,false)}
function trimCache(){const keep=new Set([videos[current]?.id,videos[peekNext()]?.id]);for(const[id,b]of cache)if(!keep.has(id)){URL.revokeObjectURL(b.url);cache.delete(id)}}
function render(){playlistBox.innerHTML="";if(!videos.length){playlistBox.innerHTML='<div class="track">No playlist loaded yet.</div>';return}const n=peekNext();videos.forEach((v,i)=>{const row=document.createElement("div");row.className="track"+(i===current?" active":"")+(i===n?" queued":"");row.innerHTML=`<strong>${escapeHtml(v.name)}</strong><br><small>${i+1} of ${videos.length}${i===n?" · Next":""}</small>`;row.onclick=()=>{if(shuffle)buildQueue();playIndex(i,false)};playlistBox.appendChild(row)})}
function escapeHtml(s){const d=document.createElement("div");d.textContent=s;return d.innerHTML}
