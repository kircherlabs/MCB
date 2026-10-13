/* Deterministic local opponents. They use their own hand, public colony state,
 * current legal choices and next Event; never inspect shuffled decks or opponents' hands. */
(function(G){
function value(g,p,c){const cost=g.cost(p,c);let v=c.people-cost*.65;
 if(['Kale Farm','Potato Farm'].includes(c.name)&&p.food<p.built.length*3+5)v+=9;
 if(['Silica Mine','Aluminum Mine'].includes(c.name)&&p.money<10)v+=7;
 if(['Assembly Line','Reactor','Lunacrete Factory'].includes(c.name))v+=Math.max(0,10-p.built.length);
 if(['Clone Banks','Hydroponics','Moon Hotel'].includes(c.name))v+=7;
 if(c.name==='Bunker')v-=7;if(c.name==='Dome'&&g.highestEvent>=8)v-=5;
 if(c.name==='Flag'&&p.money<8)v+=10;return v;
}
function choose(g,q){if(q.options.length===1)return q.options[0].id;const p=g.players[q.player??0],opts=q.options;const has=id=>opts.some(o=>o.id===id);const label=(s)=>opts.find(o=>o.label.includes(s));
 if(q.title==='Choose your Work action'){
  const hungry=p.built.filter(c=>c.name!=='Flag'&&!(g.count(p,'Greenhouses')&&c.boxes)).length;
  if(p.food<hungry&&has('FARM'))return 'FARM';
  const affordable=g.buildable(p);if(affordable.length&&has('BUILD')&&(p.built.length<10||p.people<12))return 'BUILD';
  if(p.hand.length<3)return 'RESEARCH';
  if(g.boxes(p)<2&&p.built.some(c=>['Kitchen','Nursery','Fuel Cells','Organ Banks'].includes(c.name)))return 'RESTOCK';
  if(p.food<hungry*2+1)return 'FARM';return 'MINE';
 }
 if(q.title.startsWith('Choose a personal Perk'))return has('people')?'people':has('money')?'money':opts[0].id;
 if(q.title.includes('Stacking Robot'))return String(Math.min(3,g.boxes(p)));
 if(q.title.startsWith('Pay ')&&q.title.includes('Potato Farm'))return opts[0].id;
 if(q.title.startsWith('Pay money for the same'))return String(Math.min(Math.max(0,p.built.length*2-p.food),p.money));
 if(q.title==='Spend boxes for 2 money each')return String(Math.min(g.boxes(p),p.money<8?2:0));
 if(has('yes')){if(q.title.includes('Spend 2 people')&&g.total(p)<12)return 'no';if(q.title.includes('Lose a Building')&&p.people>7)return 'no';if(q.title.includes('Spaceport')&&g.cash(p)<7)return 'no';return 'yes';}
 if(q.title==='Surveying')return p.survey.length?'cash':p.hand.length>5&&has('tuck')?'tuck':'skip';
 if(opts[0]?.card){let cs=opts.filter(o=>o.card);if(q.title.includes('discard')||q.title.includes('pass left')||q.title.includes('Lose a Building')||q.title.includes('Choose a Building to lose')||q.title.includes('Need '))return cs.sort((a,b)=>value(g,p,a.card)-value(g,p,b.card))[0].id;
  if(q.title.includes('Place')||q.title.includes('empty Building'))return cs.sort((a,b)=>{const score=c=>(['Nursery','Kitchen','Organ Banks','Fuel Cells'].includes(c.name)?10:0)+(c.name==='Solar Panels'?5:0)-c.boxes*2;return score(b.card)-score(a.card);})[0].id;
  if(q.title.includes('spend a supply'))return cs.sort((a,b)=>value(g,p,a.card)-value(g,p,b.card))[0].id;
  if(q.title.includes('BUILD')||q.title.includes('Commit'))return cs.sort((a,b)=>value(g,p,b.card)-value(g,p,a.card))[0].id;
 }
 if(q.title.startsWith('Resolve MINE')&&p.money===0&&label('Aluminum Mine'))return label('Aluminum Mine').id;
 if(q.title==='Market')return has('food')&&p.food>p.built.length+1?'food':has('card')&&p.hand.length>3?'card':'skip';
 if(has('2 food')&&p.food<p.built.length+3)return '2 food';if(has('2 money'))return '2 money';if(has('3 people'))return '3 people';
 return opts[0].id;
}
G.MCB_BOT={choose,value};if(typeof module!=='undefined')module.exports=G.MCB_BOT;
})(globalThis);

