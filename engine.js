/* Moon Colony Bloodbath rules engine. No DOM, network, or storage dependencies.
 * Every decision is yielded; seeded randomness plus the decision journal provides
 * portable saves and deterministic replay. Card instances retain unique IDs.
 */
(function(G){
'use strict';
const D=G.MCB_DATA, ACTIONS=['BUILD','RESTOCK','MINE','FARM','RESEARCH'];
class Game {
 constructor(config={}) {
  this.config={players:5,humans:1,seed:Date.now()>>>0,simple:true,endless:false,...config};
  this.rng=this.config.seed>>>0||1;this.serial=0;this.journal=[];this.log=[];
  this.players=Array.from({length:this.config.players},(_,id)=>({id,name:(config.names||[])[id]||['Dr. Kaneko','Dr. Dibson','Dr. Brain','Dr. Banerjee','Dr. White'][id],people:30,money:4,food:4,hand:[],built:[],forced:[],survey:[],perks:['money','people','supplies','cards','food'],chits:0}));
  this.buildings=this.shuffle(D.Buildings.flatMap(c=>[this.copy(c),this.copy(c)]));this.buildDiscard=[];
  this.robots=this.shuffle(D.Robots.map(c=>this.copy(c)));this.twists=this.shuffle(D.Twists.map(c=>this.copy(c)));
  this.events=D.Events.map(c=>this.copy(c));this.developments=D.Developments.flatMap(c=>[this.copy(c),this.copy(c)]);
  let initial=[];for(let i=0;i<2;i++){let ix=this.config.simple?this.twists.findIndex(c=>c.difficulty==='Simple'):0;initial.push(this.twists.splice(ix,1)[0]);}
  this.initialTwists=initial.map(c=>c.name);
  this.progress=this.shuffle([...initial,...Array.from({length:4},()=>this.copy({kind:'Starting',name:'Work',text:'Do any Action: Build, Restock, Mine, Farm, or Research.'})),...Array.from({length:2},()=>this.copy({kind:'Starting',name:'Trouble',text:'Add the next Event.'})),...(this.players.length===1?[this.copy({kind:'Starting',name:'Loneliness',text:'+3 people per fellowship symbol, then −3 people per burst symbol on your Buildings.'})]:[])]);
  this.discard=[];this.added=[];this.cycle=1;this.turn=0;this.highestEvent=0;this.extraRobots=0;this.pendingDoors=false;this.pendingRepairs=false;this.muted=false;this.inWork=false;this.over=false;
  this.players.forEach(p=>this.draw(p,4));this.iterator=this.run();this.prompt=this.iterator.next().value;
 }
 random(){let t=this.rng+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;}
 shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(this.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
 copy(c){return {...c,id:'c'+(++this.serial),boxes:0};}
 note(t){this.log.push(t);}
 total(p){return p.people+p.built.reduce((n,c)=>n+c.people,0);}
 count(p,name){return this.muted?0:p.built.filter(c=>c.name===name).length;}
 boxes(p){return p.built.reduce((n,c)=>n+c.boxes,0);}
 gain(p,k,n){if(n<=0||p.failed)return;p[k]+=n;if(k==='food')p.people+=this.count(p,'Moon Hotel');this.note(`${p.name}: +${n} ${k}.`);}
 draw(p,n){for(let i=0;i<n;i++){if(!this.buildings.length)this.buildings=this.shuffle(this.buildDiscard.splice(0));if(this.buildings.length)p.hand.push(this.buildings.pop());}}
 *ask(p,title,options){while(true){let list=typeof options==='function'?options():options;if(!list.length)return null;let result=yield {player:p?.id??null,title,options:list.map(o=>typeof o==='string'?{id:o,label:o}:o)};if(result?.refresh)continue;return result;}}
 opt(c,label){return {id:c.id,label:label||c.name,card:c};}
 *yes(p,title){return (yield* this.ask(p,title,[{id:'yes',label:'Yes'},{id:'no',label:'Decline'}]))==='yes';}
 choose(id){if(!this.prompt||!this.prompt.options.some(o=>o.id===id))throw Error('That choice is not available.');this.journal.push({choice:id});this.prompt=this.iterator.next(id).value;return this.prompt;}
 save(){return {version:1,config:this.config,journal:this.journal};}
 static restore(save){
  if(!save||save.version!==1)throw Error('Unsupported save version');
  // Realtime Database omits empty arrays and may return numeric-keyed objects.
  // Normalize both representations before replaying the deterministic journal.
  let entries;
  if(save.journal==null)entries=[];
  else if(Array.isArray(save.journal))entries=save.journal;
  else if(typeof save.journal==='object'){
   const keys=Object.keys(save.journal);
   if(keys.some(k=>!/^(0|[1-9][0-9]*)$/.test(k)))throw Error('Invalid save journal');
   entries=keys.sort((a,b)=>Number(a)-Number(b)).map(k=>save.journal[k]);
  }else throw Error('Invalid save journal');
  const g=new Game(save.config);
  for(const entry of entries){
   if(!entry||typeof entry!=='object')throw Error('Invalid save journal entry');
   if(entry.choice!==undefined)g.choose(entry.choice);
   else g.anytime(entry.player,entry.card);
  }
  return g;
 }
 anytime(pid,cid){const p=this.players[pid],c=p.built.find(c=>c.id===cid);if(this.over||this.muted||!c||c.name!=='R&D Storage'||c.boxes<1)throw Error('R&D Storage is unavailable.');c.boxes--;this.draw(p,1);this.journal.push({player:pid,card:cid});this.note(p.name+': R&D Storage draws a card.');this.prompt=this.iterator.next({refresh:true}).value;}
 *discardCards(p,n){for(let i=0;i<n&&p.hand.length;i++){const id=yield* this.ask(p,'Choose a Building card to discard',()=>p.hand.map(c=>this.opt(c)));const ix=p.hand.findIndex(c=>c.id===id);this.buildDiscard.push(...p.hand.splice(ix,1));this.gain(p,'money',this.count(p,'Recycling'));}}
 *supply(p,n,only=null){for(let i=0;i<n;i++){let targets=only?[only]:p.built;if(!targets.length)return;const id=yield* this.ask(p,'Place a supply box',targets.map(c=>this.opt(c,`${c.name} · ${c.boxes} boxes`)));targets.find(c=>c.id===id).boxes++;}}
 *spendBoxes(p,n=1,only=null){if((only?only.boxes:this.boxes(p))<n)return false;for(let i=0;i<n;i++){const targets=(only?[only]:p.built).filter(c=>c.boxes>0);const id=yield* this.ask(p,'Choose where to spend a supply box',targets.map(c=>this.opt(c,`${c.name} · ${c.boxes} boxes`)));targets.find(c=>c.id===id).boxes--;}return true;}
 cash(p){return p.money+(this.count(p,'Potato Farm')?p.food:0);}
 *pay(p,n){if(this.cash(p)<n)return false;let food=0;if(this.count(p,'Potato Farm')&&p.food&&n){const low=Math.max(0,n-p.money),high=Math.min(n,p.food);const id=yield* this.ask(p,`Pay ${n} money · Potato Farm permits food`,Array.from({length:high-low+1},(_,i)=>({id:String(i+low),label:`${n-i-low} money + ${i+low} food`})));food=Number(id);}p.money-=n-food;p.food-=food;return true;}
 add(card,p){if(!card)return;this.added.push(card);if(p)this.gain(p,'money',2*this.count(p,'Trading Post'));this.note(`${p?p.name:'Progress'} added ${card.name}.`);}
 addEvent(p){if(this.highestEvent>=12&&this.config.endless&&this.players.length===1){let r=this.robots.pop();if(r){this.extraRobots++;this.add(r,p);}return;}let c=this.events.shift();if(c){this.highestEvent=c.number;this.add(c,p);}}
 *perk(p){if(!p.perks.length)return;let k=yield* this.ask(p,'Choose a personal Perk to add',p.perks.map(k=>({id:k,label:`+${['money','people','food'].includes(k)?2:1} ${k}`})));p.perks.splice(p.perks.indexOf(k),1);this.add(this.copy({name:p.name+' · '+k,kind:'Perks',owner:p.id,resource:k,text:`Only ${p.name}: +${['money','people','food'].includes(k)?2:1} ${k}.`}),p);}
 *addNamed(p,name){if(name==='Perk'){yield* this.perk(p);return;}if(name==='Robot'){this.add(this.robots.pop(),p);return;}if(name==='Event'){this.addEvent(p);return;}let ix=this.developments.findIndex(c=>c.name===name);if(ix>=0)this.add(this.developments.splice(ix,1)[0],p);}
 *order(p,title,tasks){while(tasks.length&&!p.failed){let id=yield* this.ask(p,title,tasks.map((t,i)=>({id:String(i),label:t.label,card:t.card})));let t=tasks.splice(Number(id),1)[0];yield* t.fn();}}
 *loseBuilding(p,c,toHand=false){const ix=p.built.indexOf(c);if(ix<0)return;const boxes=c.boxes;p.built.splice(ix,1);c.boxes=0;p.people+=c.people;
  if(toHand||(!this.muted&&c.name==='Geo Lab'))p.hand.push(c);else this.buildDiscard.push(c);
  this.note(`${p.name} loses ${c.name}; ${c.people} people move to the mat.`);
  if(this.muted)return;
  const tasks=[];const self=this;
  for(const b of p.built.filter(b=>b.name==='Hydroponics'))tasks.push({label:'Hydroponics: +1 money',fn:function*(){self.gain(p,'money',1);}});
  const lost=['Animal Lab','Assembly Line','Reactor','Cargo Bay','Dust Mine','Silica Mine','Crater Homes','Makeshift Lab','Cave'];
  if(lost.includes(c.name))tasks.push({label:c.name+' · LOST',card:c,fn:function*(){switch(c.name){case 'Animal Lab':yield* self.perk(p);break;case 'Assembly Line':if(yield* self.yes(p,'Use Assembly Line to BUILD?'))yield* self.action(p,'BUILD');break;case 'Reactor':yield* self.addNamed(p,'Radiation');break;case 'Cargo Bay':yield* self.supply(p,2);break;case 'Dust Mine':self.gain(p,'money',3*boxes);break;case 'Silica Mine':self.gain(p,'money',4);break;case 'Crater Homes':self.gain(p,'food',4);break;case 'Makeshift Lab':self.draw(p,2);break;case 'Cave':yield* self.action(p,'MINE');break;}}});
  yield* this.order(p,'Resolve Building loss effects',tasks);
 }
 *lose(p,n){if(n<=0)return;this.note(`${p.name}: must lose ${n} people.`);while(p.people<n&&p.built.length){let id=yield* this.ask(p,`Need ${n} people; ${p.people} on mat. Lose a Building.`,p.built.map(c=>this.opt(c,`${c.name} · release ${c.people} people`)));yield* this.loseBuilding(p,p.built.find(c=>c.id===id));}p.people=Math.max(0,p.people-n);if(this.total(p)===0)p.failed=true;}
 cost(p,c){return Math.max(0,c.cost-2*this.count(p,'Lunacrete Factory')-this.count(p,'Assembly Line')-(c.cost>=6?3*this.count(p,'Reactor'):0));}
 buildable(p,limit){return(p.forced.length?p.forced:p.hand).filter(c=>(!limit||limit(c))&&this.cash(p)>=this.cost(p,c));}
 *build(p,limit=null,committed=null){let choices=this.buildable(p,limit);if(!choices.length){this.note(p.name+': no affordable Building.');return;}let id=committed|| (yield* this.ask(p,'Choose a Building to BUILD',choices.map(c=>this.opt(c,`${c.name} · pay ${this.cost(p,c)} · ${c.people} people`))));let c=choices.find(c=>c.id===id);if(!c)return;yield* this.pay(p,this.cost(p,c));let from=p.forced.includes(c)?p.forced:p.hand;from.splice(from.indexOf(c),1);let existing=p.built.slice();p.built.push(c);this.note(`${p.name} builds ${c.name}.`);if(this.muted)return;
  const self=this,tasks=[];if(this.hasPlay(c))tasks.push({label:c.name+' · PLAY',card:c,fn:function*(){yield* self.play(p,c);}});
  for(const b of existing){if(['Spaceport','Solar Panels','Cargo Bay'].includes(b.name))tasks.push({label:b.name+' · another Building played',card:b,fn:function*(){if(!p.built.includes(b))return;if(b.name==='Cargo Bay')yield* self.supply(p,1,c);if(b.name==='Solar Panels')self.gain(p,'people',Math.floor(b.boxes/2));if(b.name==='Spaceport'&&self.cash(p)>=3&&(yield* self.yes(p,'Spaceport: pay 3 for a Perk or 3 people?'))){yield* self.pay(p,3);if((yield* self.ask(p,'Spaceport bonus',['Perk','3 people']))==='Perk')yield* self.perk(p);else self.gain(p,'people',3);}}});}
  yield* this.order(p,'Resolve Build effects in any order',tasks);
 }
 hasPlay(c){return c.text.includes('PLAY:');}
 *play(p,c){const name=c.name;const adds={'Nursery':'Perk','Restaurant':'Perk','Market':'Trade','Warehouse':'Maintain','Kitchen':'Vending Machines','Titanium Mine':'Innovation','Iron Mine':'Perk','Aluminum Mine':'Budget Cuts','Helium-3 Mine':'Moon Buggy','Hacker Lair':'Perk','Moon Hotel':'Tourists','Dome':'Event','Recycling':'Gardens','Bunker':'Robot','Radio Antennae':'Repairs','Organ Banks':'Perk'};
  if(adds[name]){yield* this.addNamed(p,adds[name]);return;}
  switch(name){case 'Chem Lab':this.gain(p,'food',2);yield* this.supply(p,1);this.draw(p,1);break;case 'Kale Farm':yield* this.action(p,'FARM');break;case 'Lunacrete Factory':this.draw(p,2);break;case 'Generator':yield* this.action(p,yield* this.ask(p,'Generator: choose an Action',['MINE','FARM','RESEARCH']));break;
   case 'Launch Pad':{let cs=p.built.filter(b=>b.name!=='Launch Pad'&&this.hasPlay(b));if(cs.length){let id=yield* this.ask(p,'Repeat a PLAY ability',cs.map(b=>this.opt(b)));yield* this.play(p,cs.find(b=>b.id===id));}break;}
   case 'R&D Storage':yield* this.supply(p,3,c);break;case 'Flag':this.gain(p,'money',6);break;
   case 'Crater Homes':{let n=Number(yield* this.ask(p,'Spend boxes for 2 money each',Array.from({length:this.boxes(p)+1},(_,i)=>({id:String(i),label:`Spend ${i} → ${2*i} money`}))));yield* this.spendBoxes(p,n);this.gain(p,'money',2*n);break;}
   case 'Greenhouses':yield* this.supply(p,1);break;case 'Complex':this.gain(p,'people',Math.floor(p.built.length/2));break;case 'Makeshift Lab':yield* this.supply(p,2);break;case 'Cave':if(yield* this.yes(p,'Cave: BUILD another Building?'))yield* this.action(p,'BUILD');break;case 'Trading Post':this.draw(p,2);yield* this.discardCards(p,2);break;
  }
 }
 *action(p,a,limit=null,committed=null){const self=this;const tasks=[{label:a+' · base action',fn:function*(){if(a==='MINE')self.gain(p,'money',4);if(a==='FARM')self.gain(p,'food',4);if(a==='RESEARCH')self.draw(p,2);if(a==='RESTOCK')yield* self.supply(p,2);if(a==='BUILD')yield* self.build(p,limit,committed);}}];
  if(!this.muted&&a!=='BUILD')for(const c of p.built.filter(c=>c.action===a))tasks.push({label:c.name+' · '+a,card:c,fn:function*(){if(p.built.includes(c))yield* self.ability(p,c);}});
  yield* this.order(p,`Resolve ${a} in your chosen order`,tasks);
 }
 *optional(p,label,resource,amount,fn,only=null){let available=resource==='boxes'?(only?only.boxes:this.boxes(p)):resource==='money'?this.cash(p):resource==='cards'?p.hand.length:resource==='people'?this.total(p):p[resource];if(available<amount)return;if(!(yield* this.yes(p,label)))return;
  if(resource==='boxes')yield* this.spendBoxes(p,amount,only);else if(resource==='money')yield* this.pay(p,amount);else if(resource==='cards')yield* this.discardCards(p,amount);else if(resource==='people')yield* this.lose(p,amount);else p[resource]-=amount;yield* fn();
 }
 *ability(p,c){let self=this;switch(c.name){
  case 'Geo Lab':case 'Chem Lab':this.draw(p,1);break;case 'Clone Banks':this.gain(p,'people',2);break;case 'Telescope':this.draw(p,2);break;case 'Animal Lab':if(p.money>=10)this.gain(p,'people',2);break;case 'Research Station':yield* this.optional(p,'Spend 3 food to add a Perk?','food',3,function*(){yield* self.perk(p);});break;
  case 'Kale Farm':this.gain(p,'food',1);break;case 'Hydroponics':this.gain(p,'people',1);break;case 'Potato Farm':this.gain(p,'food',2);break;case 'Nursery':yield* this.optional(p,'Spend a box from Nursery for 4 people?','boxes',1,function*(){self.gain(p,'people',4);},c);break;case 'Restaurant':yield* this.optional(p,'Spend 1 food for 4 money?','food',1,function*(){self.gain(p,'money',4);});break;
  case 'Market':{let opts=[{id:'skip',label:'Decline'}];if(p.food>=2)opts.push({id:'food',label:'Spend 2 food → 4 money'});if(p.hand.length)opts.push({id:'card',label:'Discard 1 card → 4 money'});let k=yield* this.ask(p,'Market',opts);if(k==='food'){p.food-=2;this.gain(p,'money',4);}if(k==='card'){yield* this.discardCards(p,1);this.gain(p,'money',4);}break;}
  case 'Warehouse':this.gain(p,'money',2);yield* this.moveBox(p,false,true);break;case 'Fuel Cells':yield* this.optional(p,'Spend a Fuel Cells box for 4 money, draw 1, discard 1?','boxes',1,function*(){self.gain(p,'money',4);self.draw(p,1);yield* self.discardCards(p,1);},c);break;
  case 'Tunnels':{let k=yield* this.ask(p,'Tunnels bonus',['2 food','1 supply','2 money']);if(k==='2 food')this.gain(p,'food',2);if(k==='2 money')this.gain(p,'money',2);if(k==='1 supply')yield* this.supply(p,1);break;}
  case 'Generator':case 'Launch Pad':case 'Iron Mine':yield* this.supply(p,1);break;case 'Kitchen':yield* this.optional(p,'Spend a Kitchen box for 4 food?','boxes',1,function*(){self.gain(p,'food',4);},c);break;
  case 'Titanium Mine':this.gain(p,'money',4);this.draw(p,1);yield* this.discardCards(p,1);break;case 'Dust Mine':yield* this.supply(p,1,c);break;case 'Aluminum Mine':this.gain(p,'money',p.money===0?5:2);break;case 'Helium-3 Mine':this.gain(p,'money',c.boxes);break;case 'Silica Mine':this.gain(p,'money',2);break;
 }}
 *moveBox(p,more=false,optional=false){let pairs=[];for(let a of p.built)for(let b of p.built)if(a!==b&&a.boxes>0&&(!more||b.boxes>a.boxes))pairs.push({id:a.id+':'+b.id,label:`${a.name} (${a.boxes}) → ${b.name} (${b.boxes})`,a,b});if(!pairs.length)return;let opts=pairs.map(({id,label})=>({id,label}));if(optional)opts.push({id:'skip',label:'Do not move a box'});let id=yield* this.ask(p,'Move a supply box',opts);let pair=pairs.find(x=>x.id===id);if(pair){pair.a.boxes--;pair.b.boxes++;}}
 *work(){this.inWork=true;this.muted=this.pendingDoors;const noBuild=this.pendingRepairs;this.pendingDoors=false;this.pendingRepairs=false;
  for(const p of this.players){if(!p.hand.length)this.draw(p,this.count(p,'Radio Antennae'));}
  const selections=[];
  for(const p of this.players){let a=yield* this.ask(p,'Choose your Work action',ACTIONS.filter(a=>a!=='BUILD'||!noBuild).map(a=>({id:a,label:a})));let card=null;if(a==='BUILD'&&this.buildable(p).length)card=yield* this.ask(p,'Commit a Building (revealed after everyone chooses)',this.buildable(p).map(c=>this.opt(c,`${c.name} · pay ${this.cost(p,c)}`)));selections.push({p,a,card});}
  for(const {p,a,card} of selections){this.note(p.name+' chose '+a+'.');yield* this.action(p,a,null,card);p.chits++;}
  this.muted=false;this.inWork=false;
 }
 *event(c){if(c.name==='Instruction Manual'){this.over=true;this.reason='Instruction Manual reached';return;}if(c.name==='Glitch'){this.add(this.robots.pop());return;}
  for(const p of this.players){if(c.name==='Paperwork'){if(!this.count(p,'Hacker Lair')){this.draw(p,1);yield* this.discardCards(p,2);}continue;}
   if(c.name==='Hunger'){let needed=p.built.filter(b=>b.name!=='Flag'&&!(this.count(p,'Greenhouses')&&b.boxes)).length;let paid=Math.min(p.food,needed);p.food-=paid;let loss=needed-paid;if(loss)yield* this.lose(p,loss);else{this.gain(p,'people',2);this.gain(p,'people',3*this.count(p,'Clone Banks'));}continue;}
   if(c.name==='Accident!'){let organs=p.built.filter(b=>b.name==='Organ Banks'&&b.boxes);if(organs.length&&(yield* this.yes(p,'Use Organ Banks to ignore this Accident?'))){let id=yield* this.ask(p,'Spend an Organ Banks box',organs.map(b=>this.opt(b)));organs.find(b=>b.id===id).boxes--;continue;}}
   const n={'Leak':4,'Tempers Flare':2,'Accident!':3,'Airlock Test':5,'Moonquake':6,'Power Failure':7}[c.name];yield* this.lose(p,n||0);
  }
 }
 *robot(c){const losses={'Construction Robot':5,'Kitchen Robot':4,'Warehouse Robot':7,'Repairs Robot':4,'Delivery Drone':5,'Efficiency Robot':5,'Helpful Robot':7,'Robot Waiter':4,'Mining Robot':6,'Robot Doctor':5,'Drilling Robot':5,'Stacking Robot':6,'Research Robot':5,'Cleaning Robot':6,'Military Robot':7,'Automatic Doors':5,'Sentient AI':8,'Robot Butler':4,'Robot Companion':7};
  const security=Math.max(...this.players.map(p=>p.built.length));for(const p of this.players){let n=c.name==='Security Robot'?security:losses[c.name];if(c.name==='Stacking Robot'&&this.boxes(p)){let k=Number(yield* this.ask(p,'Stacking Robot: each box prevents 2 losses',Array.from({length:this.boxes(p)+1},(_,i)=>({id:String(i),label:`Spend ${i} boxes · lose ${Math.max(0,6-2*i)} people`}))));yield* this.spendBoxes(p,k);n=Math.max(0,6-2*k);}yield* this.lose(p,n);}
  if(this.players.some(p=>p.failed))return;
  if(c.name==='Automatic Doors')this.pendingDoors=true;if(c.name==='Repairs Robot')this.pendingRepairs=true;if(c.name==='Sentient AI')this.add(this.twists.pop());
  const passed=[];this.transit=passed;
  for(const p of this.players){const self=this;switch(c.name){
   case 'Construction Robot':if(p.hand.length){let id=yield* this.ask(p,'Reserve a card: you must BUILD reserved cards first',p.hand.map(c=>this.opt(c)));p.forced.push(...p.hand.splice(p.hand.findIndex(c=>c.id===id),1));}break;
   case 'Kitchen Robot':if(p.food<8)yield* this.lose(p,3);break;case 'Warehouse Robot':{let cs=p.built.filter(b=>b.boxes===0);if(cs.length){let id=yield* this.ask(p,'Place a box on an empty Building',cs.map(b=>this.opt(b)));cs.find(b=>b.id===id).boxes++;}break;}
   case 'Delivery Drone':if(p.hand.length){let id=yield* this.ask(p,'Choose a card to pass left',p.hand.map(c=>this.opt(c)));passed.push({to:(p.id+1)%this.players.length,c:p.hand.splice(p.hand.findIndex(c=>c.id===id),1)[0]});}break;
   case 'Efficiency Robot':if(this.boxes(p)&&(yield* this.yes(p,'Spend a box to avoid losing 2 money?')))yield* this.spendBoxes(p);else p.money=Math.max(0,p.money-2);break;case 'Helpful Robot':this.draw(p,1);break;case 'Robot Waiter':p.food=Math.max(0,p.food-2);break;case 'Mining Robot':this.gain(p,'money',p.built.filter(b=>b.action==='MINE').length);break;
   case 'Robot Doctor':yield* this.optional(p,'Spend a box for 2 food?','boxes',1,function*(){self.gain(p,'food',2);});break;case 'Drilling Robot':yield* this.radiation(p);break;case 'Research Robot':if(p.hand.length>=5)yield* this.discardCards(p,1);break;case 'Cleaning Robot':yield* this.moveBox(p,true);break;case 'Military Robot':this.gain(p,'money',2);break;case 'Robot Butler':if(this.boxes(p))yield* this.spendBoxes(p);break;
   case 'Robot Companion':yield* this.optional(p,'Spend a box to do any Action?','boxes',1,function*(){yield* self.action(p,yield* self.ask(p,'Robot Companion action',ACTIONS));});break;
  }}for(const {to,c} of passed)this.players[to].hand.push(c);this.transit=[];
 }
 *radiation(p){if(p.built.length&&(yield* this.yes(p,'Lose a Building instead of 3 people?'))){let id=yield* this.ask(p,'Choose a Building to lose',p.built.map(c=>this.opt(c)));yield* this.loseBuilding(p,p.built.find(c=>c.id===id));}else yield* this.lose(p,3);}
 *development(p,c){const self=this;switch(c.name){case 'Tourists':yield* this.optional(p,'Spend 2 food for 3 people?','food',2,function*(){self.gain(p,'people',3);});break;case 'Maintain':yield* this.optional(p,'Spend 2 money for 2 supplies?','money',2,function*(){yield* self.supply(p,2);});break;case 'Radiation':yield* this.radiation(p);break;case 'Vending Machines':yield* this.optional(p,'Spend 2 food for 4 money?','food',2,function*(){self.gain(p,'money',4);});break;case 'Moon Buggy':this.draw(p,1);yield* this.discardCards(p,1);break;case 'Budget Cuts':p.money=Math.max(0,p.money-2);break;case 'Gardens':yield* this.optional(p,'Discard 1 card for 4 food?','cards',1,function*(){self.gain(p,'food',4);});break;case 'Repairs':if(this.boxes(p))yield* this.spendBoxes(p);break;case 'Innovation':yield* this.optional(p,'Discard 2 cards to BUILD?','cards',2,function*(){yield* self.action(p,'BUILD');});break;case 'Trade':yield* this.optional(p,'Spend 1 box to draw 2 cards?','boxes',1,function*(){self.draw(p,2);});break;}}
 *twist(p,c){const self=this;switch(c.name){
  case 'Flexible Plan':{let k=yield* this.ask(p,'Flexible Plan',['1 card','2 money','1 supply','2 food']);if(k==='1 card')this.draw(p,1);if(k==='2 money')this.gain(p,'money',2);if(k==='1 supply')yield* this.supply(p,1);if(k==='2 food')this.gain(p,'food',2);break;}
  case 'University':this.gain(p,'money',Math.floor(p.hand.length/3));break;case 'Investments':this.gain(p,'money',Math.floor(p.money/4));break;case 'Emergency Fund':if(p.money<5)this.gain(p,'money',3);break;
  case 'Favored Status':yield* this.optional(p,'Pay 3 money to add a Perk?','money',3,function*(){yield* self.perk(p);});break;case 'Risky Research':yield* this.optional(p,'Spend 2 people to RESEARCH?','people',2,function*(){yield* self.action(p,'RESEARCH');});break;case 'Isolation':if(p.built.length<=4){this.draw(p,1);this.gain(p,'food',2);}break;case 'Mining Fever':yield* this.optional(p,'Spend 2 food to MINE?','food',2,function*(){yield* self.action(p,'MINE');});break;case 'Intensive Farming':yield* this.optional(p,'Spend 1 box to FARM?','boxes',1,function*(){yield* self.action(p,'FARM');});break;case 'Regular Shipments':yield* this.optional(p,'Spend 2 money to RESTOCK?','money',2,function*(){yield* self.action(p,'RESTOCK');});break;case 'Blueprints':yield* this.optional(p,'Pay 5 money for 4 cards?','money',5,function*(){self.draw(p,4);});break;case 'Ancillary Products':yield* this.optional(p,'Spend 1 box for 5 money?','boxes',1,function*(){self.gain(p,'money',5);});break;
  case 'Animal Research':p.money=Math.max(0,p.money-p.hand.length);this.draw(p,2);break;case 'Construction Kits':yield* this.optional(p,'Spend 1 box to BUILD a card costing up to 4?','boxes',1,function*(){yield* self.action(p,'BUILD',b=>b.cost<=4);});break;case 'New Recruits':if(p.hand.length>p.built.length)this.gain(p,'people',3);break;
  case 'Diversify':if(p.built.some(b=>b.action==='RESEARCH'))this.draw(p,1);if(p.built.some(b=>b.action==='RESTOCK'))yield* this.supply(p,1);if(p.built.some(b=>b.action==='FARM'))this.gain(p,'food',2);if(!p.built.some(b=>b.action==='MINE'))p.money=Math.max(0,p.money-2);break;
  case 'Reality Show':if(this.boxes(p)>=6||p.hand.length>=6||p.built.length>=6)this.gain(p,'money',3);break;case 'Defunding':{let k=p.money>p.food?'money':p.food>p.money?'food':yield* this.ask(p,'Defunding: choose the tied resource',['money','food']);p[k]-=Math.floor(p[k]/2);break;}
  case 'Focus':{let cs=p.built.filter(b=>['MINE','FARM','RESTOCK','RESEARCH'].includes(b.action));if(cs.length){let id=yield* this.ask(p,'Resolve one Building action ability',cs.map(b=>this.opt(b)));yield* this.ability(p,cs.find(b=>b.id===id));}break;}
  case 'Overtime':yield* this.optional(p,`Pay ${p.built.length} money to BUILD?`,'money',p.built.length,function*(){yield* self.action(p,'BUILD');});break;case 'Grand Plan':yield* this.optional(p,'Discard a card to BUILD a card costing at least 5?','cards',1,function*(){yield* self.action(p,'BUILD',b=>b.cost>=5);});break;case 'Underground City':this.gain(p,'money',p.built.filter(b=>b.boxes>0).length);break;
  case 'Surveying':{let opts=[{id:'skip',label:'Decline'},{id:'cash',label:`Discard ${p.survey.length} surveyed cards → ${p.survey.length*8} money`}];if(p.hand.length)opts.push({id:'tuck',label:'Set aside a card for Surveying'});let k=yield* this.ask(p,'Surveying',opts);if(k==='tuck'){let id=yield* this.ask(p,'Set aside a card under the mat',p.hand.map(b=>this.opt(b)));p.survey.push(...p.hand.splice(p.hand.findIndex(b=>b.id===id),1));}if(k==='cash'){let n=p.survey.length;this.buildDiscard.push(...p.survey.splice(0));this.gain(p,'money',n*(8+this.count(p,'Recycling')));}break;}
  case 'Synthetic Meat':{this.gain(p,'money',2);let n=Number(yield* this.ask(p,'Pay money for the same amount of food',Array.from({length:this.cash(p)+1},(_,i)=>({id:String(i),label:`Pay ${i} → ${i} food`}))));yield* this.pay(p,n);this.gain(p,'food',n);break;}
  case 'Engineers':if(p.built.length&&(yield* this.yes(p,'Lose a Building and return it to your hand?'))){let id=yield* this.ask(p,'Choose a Building to return',p.built.map(b=>this.opt(b)));yield* this.loseBuilding(p,p.built.find(b=>b.id===id),true);}break;
 }}
 *run(){yield* this.ask(null,'Review the two starting Twists, then begin',[{id:'begin',label:'Begin game'}]);while(!this.over){
  if(!this.progress.length){this.progress=this.shuffle(this.discard.splice(0));this.cycle++;this.players.forEach(p=>p.chits=0);this.pendingDoors=false;this.pendingRepairs=false;this.note('Progress reshuffled. Action chits reset.');}
  if(!this.progress.length){this.over=true;this.reason='No Progress cards remain';break;}
  this.current=this.progress.pop();this.discard.push(this.current);this.turn++;this.note(`Turn ${this.turn}: ${this.current.name}.`);
  yield* this.ask(null,'Progress revealed · '+this.current.name,[{id:'resolve',label:'Resolve card'}]);
  const c=this.current;if(c.kind==='Starting'){if(c.name==='Work')yield* this.work();else if(c.name==='Trouble')this.addEvent();else{let p=this.players[0];this.gain(p,'people',3*p.built.filter(b=>b.solo===1).length);yield* this.lose(p,3*p.built.filter(b=>b.solo===-1).length);}}
  if(c.kind==='Events')yield* this.event(c);if(c.kind==='Robots')yield* this.robot(c);if(c.kind==='Twists')for(const p of this.players)yield* this.twist(p,c);if(c.kind==='Developments')for(const p of this.players)yield* this.development(p,c);
  if(c.kind==='Perks'){const p=this.players[c.owner];if(c.resource==='cards')this.draw(p,1);else if(c.resource==='supplies')yield* this.supply(p,1);else this.gain(p,c.resource,2);}
  if(this.added.length)this.progress.push(...this.shuffle(this.added.splice(0)));
  if(this.players.some(p=>this.total(p)===0)){this.over=true;this.reason='A colony has no surviving people';}
  if(!this.over)yield* this.ask(null,'All players finished · reveal the next Progress card',[{id:'next',label:'Next Progress card'}]);
 }this.result={reason:this.reason,scores:this.players.map(p=>({name:p.name,people:this.total(p)})),solo:this.players.length===1,won:this.reason==='Instruction Manual reached',highestEvent:this.highestEvent,extraRobots:this.extraRobots};this.note('Game over: '+this.reason);return {title:'Game over',options:[]};}
}
G.MCB={Game,ACTIONS};if(typeof module!=='undefined')module.exports=G.MCB;
})(globalThis);
