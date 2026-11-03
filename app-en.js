/* English build of app.js. Keep in sync when app.js changes. */
(function(){
"use strict";
var ROOT=document.getElementById("root");
var EDIT=/(^|[?&])edit\b/.test(location.search.slice(1));
var state=null, savedJSON="";
var zoom="day", msg="", pasteOpen=false, C=null;
var TABS=EDIT?[["gantt","Gantt"],["estimate","Estimate"],["team","Team & settings"],["load","Workload"],["budget","Budget"]]:[["gantt","Gantt"],["load","Team workload"]];


/* ---------- utils ---------- */
function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c];});}
function pad(n){return String(n).padStart(2,"0");}
function iso(d){return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());}
function toIso(s){s=String(s||"").trim();var m=/^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);if(m)return m[1]+"-"+pad(m[2])+"-"+pad(m[3]);m=/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})$/.exec(s);if(m)return m[3]+"-"+pad(m[2])+"-"+pad(m[1]);return null;}
function parseD(s){var i=toIso(s);if(!i)return null;var p=i.split("-");return new Date(+p[0],+p[1]-1,+p[2]);}
var MS=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function fmt(d){return d?d.getDate()+" "+MS[d.getMonth()]:"—";}
function fmtY(d){return d?fmt(d)+" "+d.getFullYear():"—";}
var WD=["Su","Mo","Tu","We","Th","Fr","Sa"];
var MON=["January","February","March","April","May","June","July","August","September","October","November","December"];
function money(n){return Math.round(n).toLocaleString("en-US")+" "+(state.currency||"$");}
function num(n){return Math.round(n*10)/10;}
function mondayKey(d){var x=new Date(d);var wd=(x.getDay()+6)%7;x.setDate(x.getDate()-wd);return iso(x);}
function roleColor(r){for(var i=0;i<state.roles.length;i++)if(state.roles[i].role===r)return state.roles[i].color||"#777";return "#8a8f99";}
function plural(n,a,b,c){return n===1?a:b;}

function buildDays(n){
  var off={};String(state.daysOff||"").split(/[\s,;]+/).forEach(function(s){var i=toIso(s);if(i)off[i]=1;});
  var d=parseD(state.start)||new Date();d=new Date(d.getFullYear(),d.getMonth(),d.getDate());
  var out=[];var guard=0;
  while(out.length<n&&guard<5000){guard++;var w=d.getDay();if(w!==0&&w!==6&&!off[iso(d)])out.push(new Date(d));d.setDate(d.getDate()+1);}
  return out;
}

/* ---------- scheduling ---------- */
function compute(){
  var W=[], hpd=Math.max(1,+state.hpd||6);
  var tasks=state.tasks.filter(function(t){return (t.name&&String(t.name).trim())||+t.hours;}).map(function(t,i){
    return {id:String(t.id||"").trim()||("R"+(i+1)),phase:String(t.phase||"No phase").trim()||"No phase",name:String(t.name||"").trim()||"(untitled)",role:String(t.role||"").trim()||"?",hours:Math.max(0,+t.hours||0),depsRaw:t.deps};
  });
  var byId={};tasks.forEach(function(t){if(byId[t.id]){W.push(["crit","ID “"+t.id+"” is used twice: rename one of the tasks."]);t.id=t.id+"_"+Math.random().toString(36).slice(2,5);}byId[t.id]=t;});
  tasks.forEach(function(t){
    t.deps=String(t.depsRaw||"").split(/[\s,;]+/).filter(Boolean).filter(function(d){
      if(d===t.id)return false;
      if(!byId[d]){W.push(["warn",t.id+": dependency “"+d+"” not found and was skipped."]);return false;}
      return true;});
    t.dur=Math.max(0.25,t.hours);
  });
  var color={},cyc=null;
  function dfs(id,stack){color[id]=1;var ds=byId[id].deps;for(var i=0;i<ds.length;i++){var d=ds[i];if(color[d]===1){cyc=stack.concat(d);return true;}if(!color[d]&&dfs(d,stack.concat(d)))return true;}color[id]=2;return false;}
  for(var i=0;i<tasks.length&&!cyc;i++)if(!color[tasks[i].id])dfs(tasks[i].id,[tasks[i].id]);
  if(cyc)return {error:"Circular dependency: "+cyc.join(" → ")+". Remove one of these dependencies.",warnings:W,tasks:[]};

  var persons={};
  state.roles.forEach(function(r){var n=Math.max(0,Math.floor(+r.count||0));persons[r.role]=[];for(var k=1;k<=n;k++)persons[r.role].push(n>1?r.role+" "+k:r.role);});
  var missing={};
  tasks.forEach(function(t){if(!persons[t.role]||!persons[t.role].length){if(!missing[t.role]){missing[t.role]=1;W.push(["crit","Role “"+t.role+"” is in the estimate but not in the team. Counting it as 1 person for now; add it under Team & settings."]);}persons[t.role]=[t.role];}});

  var succ={};tasks.forEach(function(t){t.deps.forEach(function(d){(succ[d]=succ[d]||[]).push(t.id);});});
  var memo={};
  function tail(id){if(memo[id]==null){var m=0;(succ[id]||[]).forEach(function(s){m=Math.max(m,tail(s));});memo[id]=byId[id].dur+m;}return memo[id];}
  var free={};Object.keys(persons).forEach(function(r){persons[r].forEach(function(p){free[p]=0;});});
  var done={},pending=tasks.map(function(t){return t.id;});
  while(pending.length){
    var ready=pending.filter(function(id){return byId[id].deps.every(function(d){return done[d]!=null;});});
    ready.sort(function(a,b){return tail(b)-tail(a);});
    var id=ready[0],t=byId[id];
    var est=0;t.deps.forEach(function(d){est=Math.max(est,done[d]);});
    var best=null,bs=1e9;persons[t.role].forEach(function(p){var s=Math.max(free[p],est);if(s<bs){bs=s;best=p;}});
    t.person=best;t.start=bs;t.end=bs+t.dur;free[best]=t.end;done[id]=t.end;
    pending.splice(pending.indexOf(id),1);
  }
  var endH=0;tasks.forEach(function(t){endH=Math.max(endH,t.end);});
  var total=Math.max(1,Math.ceil(endH/hpd-1e-9));
  var buf=Math.max(0,+state.buffer||0);
  var totalBuf=Math.ceil(total*(1+buf/100));
  var dlIso=toIso(state.deadline);
  var days=buildDays(Math.max(totalBuf,total,1)+260);
  tasks.forEach(function(t){t.s=t.start/hpd;t.e=t.end/hpd;t.d0=days[Math.floor(t.s+1e-9)];t.d1=days[Math.max(0,Math.ceil(t.e-1e-9)-1)];});

  // critical path
  var resourceDriven=false;
  if(tasks.length){
    var cur=tasks.reduce(function(a,b){return b.end>a.end?b:a;});
    while(cur){
      cur.crit=true;
      if(cur.start<1e-6)break;
      var c0=cur;
      var preds=tasks.filter(function(x){return Math.abs(x.end-c0.start)<1e-6&&(c0.deps.indexOf(x.id)>=0||x.person===c0.person);});
      if(!preds.length)break;
      var dp=preds.filter(function(x){return c0.deps.indexOf(x.id)>=0;});
      var nxt=(dp.length?dp:preds).reduce(function(a,b){return b.hours>a.hours?b:a;});
      if(c0.deps.indexOf(nxt.id)<0)resourceDriven=true;
      cur=nxt;
    }
  }
  var phases=[];tasks.forEach(function(t){if(phases.indexOf(t.phase)<0)phases.push(t.phase);});
  var miles={};phases.forEach(function(p){var e=0;tasks.forEach(function(t){if(t.phase===p)e=Math.max(e,t.e);});miles[p]=e;});

  // deadline
  var dl=null;
  if(dlIso){
    var idx=-1;for(var j=0;j<days.length;j++){if(iso(days[j])>=dlIso){idx=iso(days[j])===dlIso?j:j-1;break;}}
    if(idx<0&&days.length&&iso(days[days.length-1])<dlIso)idx=days.length-1;
    dl={iso:dlIso,date:parseD(dlIso),idx:idx,slack:idx-(total-1),slackBuf:idx-(totalBuf-1)};
  }

  // estimate review
  var sumH=0;tasks.forEach(function(t){sumH+=t.hours;});
  tasks.forEach(function(t){if(t.hours>40)W.push(["warn",t.id+" “"+t.name+"”: "+t.hours+" h. Split tasks over 40 h for a more accurate estimate."]);if(!t.hours)W.push(["warn",t.id+" “"+t.name+"”: no hours estimated."]);});
  var has=function(re){return tasks.some(function(t){return re.test(t.name)||re.test(t.role);});};
  if(tasks.length){
    if(!has(/qa|тест|test/i))W.push(["crit","The estimate has no testing. QA is usually 25–35% of development hours."]);
    if(!has(/баг|стабіл|bug|fix|hardening/i))W.push(["warn","No time for stabilization and bug fixing. Plan 10–15% of development."]);
    if(!has(/деплой|реліз|deploy|release|ci\/cd|ci |devops|середовищ/i))W.push(["info","No tasks for CI/CD, environments or release. Check that they are covered."]);
    if(!has(/review|рев'ю|ревю/i))W.push(["info","Code review is not planned separately. It is often 5–10% of development if not included in the estimates."]);
  }

  // load
  var people=[];Object.keys(persons).forEach(function(r){persons[r].forEach(function(p){people.push({p:p,role:r});});});
  var weekDays={};for(var q=0;q<Math.max(total,1);q++){var k=mondayKey(days[q]);weekDays[k]=(weekDays[k]||0)+1;}
  var weeks=Object.keys(weekDays).sort();
  var load={};people.forEach(function(x){load[x.p]={};});
  tasks.forEach(function(t){if(!t.hours)return;var pos=t.start,end=t.start+t.hours;while(pos<end-1e-9){var di=Math.floor(pos/hpd+1e-9);var ch=Math.min(end,(di+1)*hpd)-pos;var k=mondayKey(days[di]);load[t.person][k]=(load[t.person][k]||0)+ch;pos+=ch;}});
  var hoursBy={};tasks.forEach(function(t){hoursBy[t.person]=(hoursBy[t.person]||0)+t.hours;});
  var critH={};tasks.forEach(function(t){if(t.crit)critH[t.person]=(critH[t.person]||0)+t.hours;});
  var bott=null;people.forEach(function(x){if((critH[x.p]||0)>0&&(!bott||(critH[x.p]||0)>(critH[bott.p]||0)))bott=x;});
  if(bott)bott.critDays=critH[bott.p];

  // budget
  var roleH={};tasks.forEach(function(t){roleH[t.role]=(roleH[t.role]||0)+t.hours;});
  var pmPct=Math.max(0,+state.pmPct||0);
  var budgetRows=[];var rateOf={};state.roles.forEach(function(r){rateOf[r.role]=+r.rate||0;});
  Object.keys(roleH).forEach(function(r){budgetRows.push({role:r,hours:roleH[r],rate:rateOf[r]||0});});
  var pmRole=state.roles.filter(function(r){return /^pm$|project|менеджер/i.test(r.role);})[0];
  var pmHours=Math.round(sumH*pmPct/100);
  if(pmHours){budgetRows.push({role:(pmRole?pmRole.role:"PM")+" · management "+pmPct+"%",hours:pmHours,rate:pmRole?(+pmRole.rate||0):0});}
  var bTotalH=0,bTotal=0;budgetRows.forEach(function(r){r.sum=r.hours*r.rate;bTotalH+=r.hours;bTotal+=r.sum;});

  return {endH:endH,tasks:tasks,byId:byId,W:W,total:total,totalBuf:totalBuf,days:days,phases:phases,miles:miles,dl:dl,resourceDriven:resourceDriven,
    people:people,weeks:weeks,weekDays:weekDays,load:load,hoursBy:hoursBy,bott:bott,sumH:sumH,hpd:hpd,buf:buf,
    budgetRows:budgetRows,bTotalH:bTotalH,bTotal:bTotal,release:days[total-1],releaseBuf:days[totalBuf-1]};
}

/* ---------- rendering ---------- */
function currentTab(){var h=(location.hash||"").slice(1);for(var i=0;i<TABS.length;i++)if(TABS[i][0]===h)return h;return "gantt";}

function renderAll(){
  C=compute();
  var tab=currentTab();
  var html='<div class="wrap">'+
    '<header class="top"><div><h1>'+esc(state.project||"Project")+'</h1><div class="sub">Gantt plan · start '+fmtY(parseD(state.start))+' · '+C.hpd+' effective hours/day per person</div></div>'+
    '<div class="legend" id="legend"></div></header>'+
    (state.demo?'<div class="demo">This is a sample estimate. Paste your own on the Estimate tab.</div>':'')+
    '<div class="tiles" id="tiles"></div>'+
    '<div class="panel"><nav class="tabs" aria-label="Sections">'+TABS.map(function(t){return '<a href="#'+t[0]+'"'+(t[0]===tab?' aria-current="page"':'')+'>'+t[1]+'</a>';}).join("")+'</nav>'+
    '<div class="tabbody" id="tabbody"></div></div></div><div id="savebar"></div>';
  ROOT.innerHTML=html;
  renderComputed();
  renderTab(tab);
  renderSaveBar();
}

function renderComputed(){
  C=compute();
  var L=document.getElementById("legend");
  if(L)L.innerHTML=state.roles.map(function(r){return '<span><i style="background:'+esc(r.color)+'"></i>'+esc(r.role)+'</span>';}).join("")+'<span><i class="cp"></i>Critical path</span>';
  var T=document.getElementById("tiles");
  if(T){
    if(C.error){T.innerHTML='<div class="tile" style="grid-column:1/-1"><span class="pill crit">Error</span><div>'+esc(C.error)+'</div></div>';}
    else{
      var dlTile="";
      if(C.dl){
        var s=C.dl.slack,sb=C.dl.slackBuf;
        var cls=s<0?"crit":(sb<0?"warn":"ok");
        var txt=s<0?("Late by "+(-s)+" working "+plural(-s,"day","days","days")):(sb<0?"On time, no risk margin":"On time with "+sb+" working "+plural(sb,"day","days","days")+" to spare");
        dlTile='<div class="tile"><span class="k">Deadline '+fmtY(C.dl.date)+'</span><span><span class="pill '+cls+'">'+esc(txt)+'</span></span><span class="n">'+(s>=0?"margin without buffer: "+s+" d":"reduce scope or add people")+'</span></div>';
      }
      var bott=C.bott?'<div class="tile"><span class="k">Bottleneck</span><span class="v">'+esc(C.bott.p)+'</span><span class="n">'+num(C.bott.critDays)+' of '+num(C.endH)+' h on the critical path · '+(C.resourceDriven?"release is limited by capacity; another person would shorten it":"release is limited by dependencies; more people won’t help much")+'</span></div>':"";
      T.innerHTML=
        '<div class="tile"><span class="k">Release</span><span class="v">'+fmtY(C.release)+'</span><span class="n">'+C.total+' working '+plural(C.total,"day","days","days")+' · ≈'+num(C.total/5)+' wks</span></div>'+
        '<div class="tile"><span class="k">Release with '+C.buf+'% buffer</span><span class="v">'+fmtY(C.releaseBuf)+'</span><span class="n">'+C.totalBuf+' working days</span></div>'+
        dlTile+
        '<div class="tile"><span class="k">Total effort</span><span class="v">'+num(C.sumH)+' h</span><span class="n">'+C.tasks.length+' '+plural(C.tasks.length,"task","tasks","tasks")+' · '+num(C.sumH*(1+C.buf/100))+' h with buffer</span></div>'+
        (!EDIT?'':C.bTotal>0?'<div class="tile"><span class="k">Budget with buffer</span><span class="v">'+money(C.bTotal*(1+C.buf/100))+'</span><span class="n">without buffer '+money(C.bTotal)+'</span></div>':'<div class="tile"><span class="k">Budget</span><span class="v">—</span><span class="n">Set rates on the Team & settings tab</span></div>')+
        bott;
    }
  }
  var tab=currentTab();
  if(tab==="gantt"||tab==="load"||tab==="budget")renderTab(tab);
  if(tab==="estimate"){var ch=document.getElementById("checks");if(ch)ch.innerHTML=checksHTML();}
}

function checksHTML(){
  if(!C.W.length)return '<li><span class="pill ok">OK</span><span>No obvious gaps in the estimate.</span></li>';
  var order={crit:0,warn:1,info:2},lab={crit:"Critical",warn:"Warning",info:"Tip"};
  return C.W.slice().sort(function(a,b){return order[a[0]]-order[b[0]];}).map(function(w){return '<li><span class="pill '+(w[0]==="info"?"ok":w[0])+'">'+lab[w[0]]+'</span><span>'+esc(w[1])+'</span></li>';}).join("");
}

function renderTab(tab){
  var B=document.getElementById("tabbody");if(!B)return;
  if(tab==="gantt")B.innerHTML=ganttHTML();
  else if(tab==="estimate")B.innerHTML=estimateHTML();
  else if(tab==="team")B.innerHTML=teamHTML();
  else if(tab==="load")B.innerHTML=loadHTML();
  else if(tab==="budget")B.innerHTML=budgetHTML();
}

function ganttHTML(){
  if(C.error)return '<p class="note">'+esc(C.error)+'</p>';
  if(!C.tasks.length)return '<p class="note">No tasks yet. Add them on the Estimate tab.</p>';
  var dw=zoom==="day"?(C.total<=12?96:(C.total<=25?48:26)):(C.total<=12?40:10);
  var N=C.total+3;
  if(C.dl&&C.dl.idx>=0)N=Math.max(N,Math.min(C.dl.idx+3,C.days.length));
  N=Math.min(N,C.days.length);
  var Wd=N*dw,days=C.days;
  // header
  var hm="",hw="",hd="",lines="";
  var lastM=-1;
  for(var i=0;i<N;i++){
    var d=days[i];
    if(d.getMonth()!==lastM){lastM=d.getMonth();hm+='<span class="hm" style="left:'+(i*dw)+'px">'+MON[d.getMonth()]+' '+d.getFullYear()+'</span>';}
    var newWeek=i===0||mondayKey(d)!==mondayKey(days[i-1]);
    if(newWeek){hw+='<span class="hw" style="left:'+(i*dw)+'px">'+fmt(d)+'</span>';lines+='<div class="vl wk" style="left:'+(i*dw)+'px"></div>';}
    else if(zoom==="day")lines+='<div class="vl" style="left:'+(i*dw)+'px"></div>';
    if(zoom==="day")hd+='<span class="hd" style="left:'+(i*dw)+'px;width:'+dw+'px">'+WD[d.getDay()]+'<br>'+d.getDate()+'</span>';
  }
  var headH=zoom==="day"?64:42;
  var todayIso=iso(new Date());var ti=-1;for(var k=0;k<N;k++){if(iso(days[k])===todayIso){ti=k;break;}}
  if(ti>=0)lines+='<div class="vl today" style="left:'+(ti*dw+dw/2)+'px"><span class="vlab today">Today</span></div>';
  if(C.dl&&C.dl.idx>=0&&C.dl.idx<N)lines+='<div class="vl dl" style="left:'+((C.dl.idx+1)*dw)+'px"><span class="vlab dl">Deadline '+fmt(C.dl.date)+'</span></div>';
  var rows="";
  C.phases.forEach(function(ph){
    var ts=C.tasks.filter(function(t){return t.phase===ph;});
    var s=1e9,e=0,h=0;ts.forEach(function(t){s=Math.min(s,t.s);e=Math.max(e,t.e);h+=t.hours;});var eD=days[Math.max(0,Math.ceil(e-1e-9)-1)];
    rows+='<div class="grow phase"><div class="gleft"><span class="nm">'+esc(ph)+'</span><span class="hr">'+num(h)+' h</span></div><div class="gtrack" style="width:'+Wd+'px">'+
      '<div class="pbar" style="left:'+(s*dw)+'px;width:'+Math.max(4,(e-s)*dw)+'px"></div>'+
      '<div class="ms" style="left:'+(e*dw-7)+'px" title="Milestone: '+esc(ph)+' — '+fmtY(eD)+'"></div>'+
      '<span class="mslab" style="left:'+(e*dw+10)+'px">'+fmt(eD)+'</span></div></div>';
    ts.slice().sort(function(a,b){return a.start-b.start||a.end-b.end;}).forEach(function(t){
      var w=Math.max(4,(t.e-t.s)*dw-2);
      var tip=t.id+" · "+t.name+"\n"+t.person+" · "+t.hours+" h (≈"+num(t.hours/C.hpd)+" working days)\n"+fmtY(t.d0)+" — "+fmtY(t.d1)+(t.deps.length?"\nAfter: "+t.deps.join(", "):"")+(t.crit?"\nOn the critical path":"");
      rows+='<div class="grow'+(t.crit?" crit":"")+'"><div class="gleft" title="'+esc(tip)+'"><span class="id">'+esc(t.id)+'</span><span class="nm">'+esc(t.name)+'</span><span class="hr">'+num(t.hours)+'h</span></div>'+
        '<div class="gtrack" style="width:'+Wd+'px"><div class="bar'+(t.crit?" crit":"")+'" style="left:'+(t.s*dw+1)+'px;width:'+w+'px;background:'+esc(roleColor(t.role))+'" title="'+esc(tip)+'">'+(w>90?esc(t.person)+" · "+num(t.hours)+" h":(w>34?num(t.hours)+"h":""))+'</div></div></div>';
    });
  });
  return '<div class="toolbar"><button type="button" data-act="zoom" data-z="day" class="'+(zoom==="day"?"on":"")+'">Days</button><button type="button" data-act="zoom" data-z="week" class="'+(zoom==="week"?"on":"")+'">Weeks</button>'+
    '<span class="sp"></span><span class="msg" id="copymsg"></span><button type="button" data-act="copy">Copy schedule for Excel</button></div>'+
    '<div class="gscroll"><div class="grow ghead" style="height:'+headH+'px"><div class="gleft">Task</div><div class="gtrack" style="width:'+Wd+'px;height:'+headH+'px">'+hm+hw+hd+'</div></div>'+
    '<div class="gbody"><div class="overlay" style="width:'+Wd+'px">'+lines+'</div>'+rows+'</div></div>'+
    '<p class="note">Hover over a task for details. A red outline marks the critical path: any delay there moves the release. Diamonds mark the end of each phase.</p>';
}

function estimateHTML(){
  var roles=state.roles.map(function(r){return '<option value="'+esc(r.role)+'"></option>';}).join("");
  var phs={};state.tasks.forEach(function(t){if(t.phase)phs[t.phase]=1;});
  var phOpts=Object.keys(phs).map(function(p){return '<option value="'+esc(p)+'"></option>';}).join("");
  var rows=state.tasks.map(function(t,i){
    var ct=C.byId&&C.byId[t.id];
    return '<tr><td><input class="w-id" id="e-'+i+'-id" data-i="'+i+'" data-f="id" value="'+esc(t.id)+'" aria-label="ID"></td>'+
      '<td><input class="w-ph" id="e-'+i+'-phase" data-i="'+i+'" data-f="phase" list="dl-ph" value="'+esc(t.phase)+'" aria-label="Phase"></td>'+
      '<td><input id="e-'+i+'-name" data-i="'+i+'" data-f="name" value="'+esc(t.name)+'" aria-label="Task"></td>'+
      '<td><input class="w-role" id="e-'+i+'-role" data-i="'+i+'" data-f="role" list="dl-roles" value="'+esc(t.role)+'" aria-label="Role"></td>'+
      '<td><input class="w-h" id="e-'+i+'-hours" data-i="'+i+'" data-f="hours" type="number" min="0" step="0.5" value="'+esc(t.hours)+'" aria-label="Hours"></td>'+
      '<td><input class="w-dep" id="e-'+i+'-deps" data-i="'+i+'" data-f="deps" value="'+esc(t.deps)+'" placeholder="T1, T2" aria-label="Depends on"></td>'+
      '<td><button type="button" class="ghost" data-act="del" data-i="'+i+'" title="Delete task" aria-label="Delete task">✕</button></td></tr>';
  }).join("");
  return '<div class="cols"><div><h2>Estimate check</h2><ul class="checks" id="checks">'+checksHTML()+'</ul></div>'+
    '<div><h2>How to paste your estimate</h2><p class="note">Copy rows from Excel or Google Sheets and use “Paste from table”. Columns are matched by header: <b>ID, Phase, Task, Role, Hours, Depends on</b>. Without headers the order is: Task, Role, Hours, Phase, Depends on. List dependencies as comma-separated IDs of earlier tasks.</p></div></div>'+
    '<div class="toolbar" style="margin-top:14px"><button type="button" data-act="add">Add task</button><button type="button" data-act="paste" class="'+(pasteOpen?"on":"")+'">Paste from table</button><span class="sp"></span><span class="note">'+state.tasks.length+' '+plural(state.tasks.length,"row","rows","rows")+'</span></div>'+
    (pasteOpen?'<div class="paste"><label class="f" for="pastebox">Paste rows from Excel / Google Sheets (tab-separated) or CSV</label><textarea id="pastebox" placeholder="ID	Phase	Task	Role	Hours	Depends on&#10;T1	MVP	Project setup	BE	8	&#10;T2	MVP	DB schema	BE	12	T1"></textarea><div class="toolbar" style="margin:0"><button type="button" class="primary" data-act="paste-replace">Replace all tasks</button><button type="button" data-act="paste-append">Append to existing</button><span class="msg" id="pastemsg"></span></div></div>':'')+
    '<div class="tscroll"><table><thead><tr><th>ID</th><th>Phase</th><th>Task</th><th>Role</th><th class="num">Hours</th><th>Depends on</th><th></th></tr></thead><tbody>'+rows+'</tbody></table></div>'+
    '<datalist id="dl-roles">'+roles+'</datalist><datalist id="dl-ph">'+phOpts+'</datalist>';
}

function teamHTML(){
  var rows=state.roles.map(function(r,i){
    return '<tr><td><input id="r-'+i+'-role" data-r="'+i+'" data-f="role" value="'+esc(r.role)+'" aria-label="Role"></td>'+
      '<td><input id="r-'+i+'-count" data-r="'+i+'" data-f="count" type="number" min="0" step="1" value="'+esc(r.count)+'" aria-label="Number of people"></td>'+
      '<td><input id="r-'+i+'-rate" data-r="'+i+'" data-f="rate" type="number" min="0" step="1" value="'+esc(r.rate)+'" aria-label="Rate"></td>'+
      '<td><input id="r-'+i+'-color" data-r="'+i+'" data-f="color" type="color" value="'+esc(r.color)+'" aria-label="Color"></td>'+
      '<td><button type="button" class="ghost" data-act="delrole" data-i="'+i+'" aria-label="Delete role">✕</button></td></tr>';
  }).join("");
  function f(id,label,type,val,extra){return '<label class="f" for="p-'+id+'">'+label+'<input id="p-'+id+'" data-p="'+id+'" type="'+type+'" value="'+esc(val)+'"'+(extra||"")+'></label>';}
  return '<div class="cols"><div><h2>Team</h2><p class="note">Change the headcount and the Gantt recalculates instantly. Handy for “what if we add another FE” scenarios.</p>'+
    '<div class="tscroll"><table><thead><tr><th>Role</th><th>People</th><th>Rate / h</th><th>Color</th><th></th></tr></thead><tbody>'+rows+'</tbody></table></div>'+
    '<div class="toolbar" style="margin-top:10px"><button type="button" data-act="addrole">Add role</button></div></div>'+
    '<div><h2>Settings</h2><div class="grid2">'+
      f("project","Project name","text",state.project)+
      f("start","Start date","date",toIso(state.start)||"")+
      f("deadline","Deadline (optional)","date",toIso(state.deadline)||"")+
      f("hpd","Effective hours per day","number",state.hpd,' min="1" max="12" step="0.5"')+
      f("buffer","Risk buffer, %","number",state.buffer,' min="0" max="100" step="5"')+
      f("pmPct","Project management, % of hours","number",state.pmPct,' min="0" max="50" step="1"')+
      f("currency","Currency","text",state.currency)+
    '</div><label class="f" for="p-daysOff" style="margin-top:12px">Days off for the whole team (comma-separated dates, e.g. 25.12.2026, 01.01.2027)<input id="p-daysOff" data-p="daysOff" type="text" value="'+esc(state.daysOff||"")+'"></label>'+
    '<p class="note">Weekends are skipped automatically. Public holidays are not counted until you add them here.</p></div></div>';
}

function heatStyle(p){
  if(p>100)return "background:var(--crit-soft);color:var(--crit)";
  if(p>=80)return "background:var(--ok-soft);color:var(--ok)";
  if(p>=40)return "background:var(--accent-soft);color:var(--accent)";
  if(p>0)return "background:var(--warn-soft);color:var(--warn)";
  return "color:var(--muted)";
}
function loadHTML(){
  if(C.error||!C.tasks.length)return '<p class="note">'+esc(C.error||"No tasks.")+'</p>';
  var head='<tr><th>Person</th><th class="num">Total</th>'+C.weeks.map(function(w){return '<th class="num">'+fmt(parseD(w))+'</th>';}).join("")+'</tr>';
  var rows=C.people.map(function(x){
    return '<tr><td><i style="display:inline-block;width:10px;height:10px;border-radius:2px;background:'+esc(roleColor(x.role))+';margin-right:6px"></i>'+esc(x.p)+'</td><td class="num">'+num(C.hoursBy[x.p]||0)+' h</td>'+
      C.weeks.map(function(w){var cap=C.hpd*C.weekDays[w];var h=(C.load[x.p]||{})[w]||0;var p=Math.round(h/cap*100);return '<td><div class="heat" style="'+heatStyle(p)+'" title="'+num(h)+' of '+num(cap)+' h">'+(p?p+"%":"—")+'</div></td>';}).join("")+'</tr>';
  }).join("");
  return '<p class="note" style="margin-top:0">Weekly workload as a % of available hours. Yellow means a person is mostly free, red means overloaded. Idle time before a person’s first task shows here too.</p><div class="tscroll"><table><thead>'+head+'</thead><tbody>'+rows+'</tbody></table></div>';
}

function budgetHTML(){
  if(C.error||!C.tasks.length)return '<p class="note">'+esc(C.error||"No tasks.")+'</p>';
  var rows=C.budgetRows.map(function(r){return '<tr><td>'+esc(r.role)+'</td><td class="num">'+num(r.hours)+'</td><td class="num">'+money(r.rate)+'</td><td class="num">'+money(r.sum)+'</td></tr>';}).join("");
  var b=C.buf/100;
  return '<div class="tscroll"><table><thead><tr><th>Role</th><th class="num">Hours</th><th class="num">Rate</th><th class="num">Amount</th></tr></thead><tbody>'+rows+'</tbody>'+
    '<tfoot><tr><td>Total</td><td class="num">'+num(C.bTotalH)+'</td><td></td><td class="num">'+money(C.bTotal)+'</td></tr>'+
    '<tr><td>Risk buffer '+C.buf+'%</td><td class="num">'+num(C.bTotalH*b)+'</td><td></td><td class="num">'+money(C.bTotal*b)+'</td></tr>'+
    '<tr><td>Total with buffer</td><td class="num">'+num(C.bTotalH*(1+b))+'</td><td></td><td class="num">'+money(C.bTotal*(1+b))+'</td></tr></tfoot></table></div>'+
    '<p class="note">Base a fixed price on the total with buffer. For T&amp;M, clients usually see the total without buffer as a guide, with risks explained separately. Rates and PM % are set on the Team &amp; settings tab.</p>';
}

/* ---------- save ---------- */
function renderSaveBar(){
  var S=document.getElementById("savebar");if(!S)return;
  var html=(!EDIT||(!isDirty()&&!msg))?"":'<div class="savebar" role="status"><span>'+esc(msg||"Only you can see these changes. To update the link for everyone, download data.json and replace the file in the project folder on GitHub.")+'</span>'+
    (isDirty()?'<button type="button" data-act="revert">Discard</button><button type="button" data-act="copyjson">Copy JSON</button><button type="button" class="primary" data-act="download">Download data.json</button>':'<button type="button" data-act="hidemsg">Close</button>')+'</div>';
  if(S.getAttribute("data-html")===html)return;
  S.setAttribute("data-html",html);S.innerHTML=html;
}
function dataJSON(){return JSON.stringify(state,null,2)+"\n";}
function download(){
  var blob=new Blob([dataJSON()],{type:"application/json"});var url=URL.createObjectURL(blob);
  var a=document.createElement("a");a.href=url;a.download="data.json";document.body.appendChild(a);a.click();a.remove();
  setTimeout(function(){URL.revokeObjectURL(url);},2000);
  msg="data.json downloaded. Replace the old file in the project folder on GitHub and the link updates within a minute.";savedJSON=JSON.stringify(state);renderSaveBar();
}
function isDirty(){return JSON.stringify(state)!==savedJSON;}
/* ---------- paste parsing ---------- */
function parseTable(text){
  var lines=String(text||"").split(/\r?\n/).filter(function(l){return l.trim();});
  if(!lines.length)return [];
  var sep=lines[0].indexOf("\t")>=0?"\t":(lines[0].indexOf(";")>=0?";":",");
  var rows=lines.map(function(l){return l.split(sep).map(function(c){return c.trim().replace(/^"|"$/g,"");});});
  var h=rows[0].map(function(c){return c.toLowerCase();});
  var map={},found=0;
  h.forEach(function(c,i){
    if(map.id==null&&/^(id|№|#|код|key)$/.test(c)){map.id=i;found++;}
    else if(map.phase==null&&/фаз|phase|епік|epic|етап|модуль/.test(c)){map.phase=i;found++;}
    else if(map.deps==null&&/залеж|dep|після|predecessor/.test(c)){map.deps=i;found++;}
    else if(map.role==null&&/роль|role|спеціаліст|виконав/.test(c)){map.role=i;found++;}
    else if(map.hours==null&&/год|hour|оцінк|estimate|hrs|^h$/.test(c)){map.hours=i;found++;}
    else if(map.name==null&&/задач|task|назв|name|опис|фіча|feature/.test(c)){map.name=i;found++;}
  });
  if(found>=2)rows=rows.slice(1);else map={name:0,role:1,hours:2,phase:3,deps:4};
  return rows.map(function(r){
    function g(k){return map[k]!=null&&r[map[k]]!=null?r[map[k]]:"";}
    return {id:g("id"),phase:g("phase"),name:g("name"),role:g("role"),hours:+String(g("hours")).replace(",",".").replace(/[^\d.]/g,"")||0,deps:g("deps")};
  }).filter(function(t){return t.name||t.hours;});
}
function nextId(used){var n=1;while(used["T"+n])n++;used["T"+n]=1;return "T"+n;}
function doPaste(replace){
  var box=document.getElementById("pastebox");var list=parseTable(box?box.value:"");
  var m=document.getElementById("pastemsg");
  if(!list.length){if(m)m.textContent="Couldn’t read the rows. Check there are columns for task, role and hours.";return;}
  var base=replace?[]:state.tasks.slice();var used={};base.forEach(function(t){used[t.id]=1;});
  list.forEach(function(t){if(!t.id||used[t.id])t.id=nextId(used);else used[t.id]=1;base.push(t);});
  state.tasks=base;state.demo=false;
  var known={};state.roles.forEach(function(r){known[r.role]=1;});
  var pal=["#3d6fd6","#4a9e5c","#e08a2e","#8a5cc7","#2a9db0","#c2547a","#6b7a8f"];
  list.forEach(function(t){if(t.role&&!known[t.role]){known[t.role]=1;state.roles.push({role:t.role,count:1,rate:0,color:pal[state.roles.length%pal.length]});}});
  pasteOpen=false;renderAll();
}

/* ---------- events ---------- */
ROOT.addEventListener("click",function(e){
  var b=e.target.closest("[data-act]");if(!b)return;var a=b.getAttribute("data-act");
  if(a==="zoom"){zoom=b.getAttribute("data-z");renderTab("gantt");}
  else if(a==="add"){var used={};state.tasks.forEach(function(t){used[t.id]=1;});var last=state.tasks[state.tasks.length-1];state.tasks.push({id:nextId(used),phase:last?last.phase:"",name:"",role:last?last.role:"",hours:8,deps:""});renderTab("estimate");renderComputed();renderSaveBar();var inp=document.getElementById("e-"+(state.tasks.length-1)+"-name");if(inp)inp.focus();}
  else if(a==="del"){state.tasks.splice(+b.getAttribute("data-i"),1);renderTab("estimate");renderComputed();renderSaveBar();}
  else if(a==="paste"){pasteOpen=!pasteOpen;renderTab("estimate");var pb=document.getElementById("pastebox");if(pb)pb.focus();}
  else if(a==="paste-replace")doPaste(true);
  else if(a==="paste-append")doPaste(false);
  else if(a==="addrole"){state.roles.push({role:"New role",count:1,rate:0,color:"#6b7a8f"});renderTab("team");renderComputed();renderSaveBar();}
  else if(a==="delrole"){state.roles.splice(+b.getAttribute("data-i"),1);renderTab("team");renderComputed();renderSaveBar();}
  else if(a==="download")download();
  else if(a==="copyjson"){try{navigator.clipboard.writeText(dataJSON()).then(function(){msg="JSON copied.";renderSaveBar();});}catch(err){}}
  else if(a==="revert"){state=JSON.parse(savedJSON);msg="";renderAll();}
  else if(a==="hidemsg"){msg="";renderSaveBar();}
  else if(a==="copy"){
    var tsv=["ID\tPhase\tTask\tRole\tAssignee\tHours\tStart\tFinish\tCritical path"].concat(C.tasks.map(function(t){return [t.id,t.phase,t.name,t.role,t.person,t.hours,fmtY(t.d0),fmtY(t.d1),t.crit?"yes":""].join("\t");})).join("\n");
    var cm=document.getElementById("copymsg");
    try{navigator.clipboard.writeText(tsv).then(function(){if(cm)cm.textContent="Copied. Paste into Excel or Google Sheets.";},function(){if(cm)cm.textContent="The browser blocked copying.";});}catch(err){if(cm)cm.textContent="The browser blocked copying.";}
  }
});
ROOT.addEventListener("change",function(e){
  var el=e.target;
  if(el.hasAttribute("data-i")&&el.hasAttribute("data-f")){var t=state.tasks[+el.getAttribute("data-i")];if(!t)return;var f=el.getAttribute("data-f");t[f]=f==="hours"?(+el.value||0):el.value;state.demo=state.demo&&true;}
  else if(el.hasAttribute("data-r")){var r=state.roles[+el.getAttribute("data-r")];if(!r)return;var rf=el.getAttribute("data-f");r[rf]=(rf==="count"||rf==="rate")?(+el.value||0):el.value;
    var L=document.getElementById("legend");}
  else if(el.hasAttribute("data-p")){var p=el.getAttribute("data-p");state[p]=(p==="hpd"||p==="buffer"||p==="pmPct")?(+el.value||0):el.value;
    if(p==="project"){var h1=document.querySelector("h1");if(h1)h1.textContent=state.project;document.title="Gantt · "+state.project;}}
  else return;
  renderComputed();renderSaveBar();
  if(el.hasAttribute("data-p")&&(el.getAttribute("data-p")==="start"||el.getAttribute("data-p")==="hpd")){var sub=document.querySelector(".sub");if(sub)sub.textContent="Gantt plan · start "+fmtY(parseD(state.start))+" · "+C.hpd+" effective hours/day per person";}
});
window.addEventListener("hashchange",function(){
  var tab=currentTab();
  document.querySelectorAll(".tabs a").forEach(function(a){if(a.getAttribute("href")==="#"+tab)a.setAttribute("aria-current","page");else a.removeAttribute("aria-current");});
  renderTab(tab);
});
function boot(){
  fetch("data.json",{cache:"no-store"}).then(function(r){if(!r.ok)throw new Error(r.status);return r.json();}).then(function(d){
    state=d;savedJSON=JSON.stringify(state);document.title="Gantt · "+(state.project||"project");
    if(!/^#/.test(location.hash)||!location.hash)history.replaceState(null,"",location.pathname+location.search+"#gantt");
    renderAll();
  }).catch(function(){ROOT.innerHTML='<div class="wrap"><h1>Plan not found</h1><p class="sub">Check the link or contact your project manager.</p></div>';});
}
boot();
})();
