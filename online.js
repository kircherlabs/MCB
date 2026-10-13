/* Moon Colony Bloodbath room transport: Firebase Authentication + Realtime Database.
   Rules are executed in the unchanged deterministic engine on each client.
   Optimistic revision-checked database transactions prevent competing moves.
   This is a casual/trusted game: the public deterministic seed/journal does NOT
   cryptographically conceal hands or validate rules on a trusted server. */
(function(G) {
'use strict';
const ALPHABET='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
let app, auth, db, uid='', roomCode='', room=null, seat=-1, stopListening=null;
let revision=-1, busy=false, onChange=()=>{}, onFailure=()=>{};
const config=G.MCB_FIREBASE_CONFIG;
const configured=!!(config && config.apiKey && !config.apiKey.includes('REPLACE_') &&
  config.databaseURL && !config.databaseURL.includes('REPLACE_') && config.projectId && !config.projectId.includes('REPLACE_'));
const key = code => `rooms/${code}`;
let sdkPromise=null;
function loadFirebaseSdk(){
 if(G.firebase)return Promise.resolve();
 if(!sdkPromise)sdkPromise=(async()=>{
  for(const name of ['firebase-app-compat','firebase-auth-compat','firebase-database-compat']){
   await new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    script.src=`https://www.gstatic.com/firebasejs/10.14.1/${name}.js`;
    script.onload=resolve;
    script.onerror=()=>reject(Error('Could not load Firebase. Check your network and browser content blockers.'));
    document.head.appendChild(script);
   });
  }
 })().catch(err=>{sdkPromise=null;throw err;});
 return sdkPromise;
}
const ref = path => db.ref(path);
function shareUrl(code=roomCode) { let url=new URL(location.href);url.searchParams.set('room',code);url.hash='';return url.toString(); }
function shortError(e) {return e?.code==='PERMISSION_DENIED'?'Database rules denied the request. Check the included firebase-rules.json and your Firebase setup.': (e?.message||String(e));}
function randomCode(){const buf=new Uint32Array(7);crypto.getRandomValues(buf);return [...buf].map(x=>ALPHABET[x%ALPHABET.length]).join('');}
async function init(){
 if(!configured)throw Error('Firebase has not been configured. Follow SETUP.md and edit firebase-config.js before using online rooms.');
 await loadFirebaseSdk();
 if(!G.firebase)throw Error('Firebase could not load. Check your internet connection or any script blockers.');
 if(!app){app=firebase.apps.length?firebase.app():firebase.initializeApp(config);auth=firebase.auth(app);db=firebase.database(app);}
 if(!auth.currentUser)await auth.signInAnonymously();
 uid=auth.currentUser.uid;return uid;
}
function disconnect(){if(stopListening)stopListening();stopListening=null;roomCode='';room=null;seat=-1;revision=-1;busy=false;onChange();}
function watch(code){if(stopListening)stopListening();roomCode=code;room=null;seat=-1;revision=-1;
 const node=ref(key(code));const cb= snap=>{
  const next=snap.val();if(!next){onFailure('Room no longer exists.');disconnect();return;}
  room=next;
  seat=Object.keys(next.seats||{}).map(Number).find(i=>next.seats[i]?.uid===uid)??-1;
  if(next.game && next.game.revision!==revision){
   try{const restored=MCB.Game.restore(next.game.save);revision=next.game.revision;onChange({room:next,seat,game:restored,code});}
   catch(e){onFailure('The shared game could not be restored: '+shortError(e));}
  } else onChange({room:next,seat,code});
 };
 const fail=e=>onFailure('Room connection: '+shortError(e));
 node.on('value',cb,fail);stopListening=()=>node.off('value',cb);
}
async function create({humans,seed,simple,nickname}){
 await init();if(!Number.isInteger(humans)||humans<1||humans>5)throw Error('Choose between 1 and 5 humans.');
 for(let attempt=0;attempt<6;attempt++){
  const code=randomCode();const value={v:1,createdAt:firebase.database.ServerValue.TIMESTAMP,
   hostUid:uid,status:'lobby',humans,seed:seed>>>0,simple:!!simple,
   seats:{0:{uid,nickname:nickname.slice(0,24),joinedAt:Date.now()}}};
  const result=await ref(key(code)).transaction(current=>current===null?value:undefined,undefined,false);
  if(result.committed){watch(code);return code;}
 }
 throw Error('Unable to reserve a room code. Please try again.');
}
async function join(rawCode,nickname){await init();const code=String(rawCode||'').trim().toUpperCase().replace(/[^A-Z0-9]/g,'');
 if(!/^[A-HJ-NP-Z2-9]{7}$/.test(code))throw Error('Room code must have seven letters or digits.');
 const snap=await ref(key(code)).once('value');const found=snap.val();if(!found)throw Error('Room not found. Check the code.');
 const existing=Object.keys(found.seats||{}).map(Number).find(i=>found.seats[i]?.uid===uid);
 if(existing===undefined){
  if(found.status!=='lobby')throw Error('This mission has already started. Only its original players can reconnect.');
  let taken=false;for(let i=0;i<found.humans;i++){
   const seatRef=ref(key(code)+'/seats/'+i);
   const result=await seatRef.transaction(current=>current===null?{uid,nickname:nickname.slice(0,24),joinedAt:Date.now()}:undefined,undefined,false);
   if(result.committed){taken=true;break;}
  }
  if(!taken)throw Error('All human seats are occupied.');
 }
 watch(code);return code;
}
async function start(){if(!room||room.hostUid!==uid||seat!==0)throw Error('Only the host can launch.');
 if(room.status!=='lobby')throw Error('Mission already started.');
 const seats=room.seats||{};if(Object.keys(seats).length!==room.humans)throw Error(`Waiting for ${room.humans-Object.keys(seats).length} more player(s).`);
 for(let i=0;i<room.humans;i++)if(!seats[i])throw Error('A player seat is missing.');
 const game=new MCB.Game({players:5,humans:room.humans,seed:room.seed,simple:room.simple});
 // status and game are written atomically; Firebase rules independently authorize each.
 await ref(key(roomCode)).update({status:'playing',game:{revision:0,save:game.save(),activeSeat:-1}});
}
function allowedActor(g){if(!room||seat<0)return false;const pid=g.prompt?.player;
 return pid===null||pid===undefined||pid>=room.humans ? room.hostUid===uid : pid===seat;
}
async function submit(ops){
 if(!room||room.status!=='playing'||!room.game)throw Error('No running mission.');
 if(busy)throw Error('A previous action is still syncing.');
 const base=room.game;
 if(!Array.isArray(ops)||!ops.length||ops.length>3)throw Error('Invalid action batch.');
 let g=MCB.Game.restore(base.save);
 if(!allowedActor(g))throw Error('It is another colony’s turn.');
 for(const op of ops){
  if(op.type==='choice')g.choose(op.id);
  else if(op.type==='anytime'){
   if(op.seat!==seat)throw Error('You can only use your own R&D Storage.');
   g.anytime(op.seat,op.card);
  }else throw Error('Unknown action.');
 }
 const after={revision:base.revision+1,save:g.save(),activeSeat:g.prompt?.player??-1};
 busy=true;
 try{
  // No local writes: other devices receive a complete authoritative journal only
  // after a single successful revision-checked transaction.
  const result=await ref(key(roomCode)+'/game').transaction(cur=>{
   if(!cur||cur.revision!==base.revision)return;
   return after;
  },undefined,false);
  if(!result.committed)throw Error('Another move arrived first. The latest game has been reloaded; choose again.');
 }finally{busy=false;}
 // The transaction may have triggered its listener while busy=true. Re-render once
 // after the lock is released so the host can continue bots/neutral steps.
 if(room && room.game && room.game.revision<=after.revision){
  if(room.game.revision<after.revision)room={...room,game:after};
  revision=after.revision;onChange({room,seat,code:roomCode,game:g});
 }
}
const api={get configured(){return configured;},get active(){return !!roomCode;},get code(){return roomCode;},get room(){return room;},get seat(){return seat;},get host(){return !!room&&room.hostUid===uid;},get busy(){return busy;},
 setHandlers(changed,failed){onChange=changed;onFailure=failed;},init,create,join,start,submit,disconnect,shareUrl};
G.MCBNet=api;
})(globalThis);
