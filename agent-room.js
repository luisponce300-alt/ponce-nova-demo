import { AGENTS } from "/agents.js";
const $=s=>document.querySelector(s);
const KEY="ponce-nova:agent-room:v1";
const authors=new Set(["Du","System",...AGENTS.map(a=>a.name)]);
const threads=Object.fromEntries([...AGENTS.map(a=>a.id),"group"].map(id=>[id,[]]));
let selected="ponce",connected=false,busy=false,readyAt=0,minimumInterval=30000,groupController=null,loading=false,localWritable=true;
try {
  const saved=JSON.parse(localStorage.getItem(KEY)||"null");
  for(const id of Object.keys(threads)) if(Array.isArray(saved?.[id])) threads[id]=saved[id].filter(m=>m&&authors.has(m.author)&&typeof m.text==="string"&&m.text.length<=12000&&Number.isFinite(m.time)&&Number.isFinite(new Date(m.time).getTime())).slice(-100);
} catch { localWritable=false;$("#storage-status").textContent="Tidigare chatt kunde inte läsas. Den sparade kopian lämnas kvar; använd Spara chatt för den nya sessionen."; }
function node(tag,text,className){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(className)n.className=className;return n;}
function save(){if(!localWritable)return;try{localStorage.setItem(KEY,JSON.stringify(threads));}catch{$("#storage-status").textContent="Chatt kunde inte sparas lokalt. Använd Spara chatt innan du stänger sidan.";}}
function add(thread,author,text,kind="note",model=""){
  threads[thread].push({author,text,time:Date.now(),kind,model});threads[thread]=threads[thread].slice(-100);save();
  if(thread===selected)renderMessages();
}
function updateJump(){const box=$("#messages");$("#latest").hidden=box.scrollHeight-box.clientHeight-box.scrollTop<32;}
function renderMessages(force=false){
  const box=$("#messages"),old=box.scrollTop,follow=force||box.scrollHeight-box.clientHeight-old<32;
  box.replaceChildren(...threads[selected].map(m=>{
    const item=node("article",undefined,`message${m.author==="Du"?" user":m.kind==="error"?" error":""}`);
    const heading=node("div",undefined,"message-heading");
    heading.append(node("strong",m.author+(m.kind==="ai"?" · AI":"")),node("time",new Intl.DateTimeFormat("sv-SE",{timeZone:"Europe/Stockholm",hour:"2-digit",minute:"2-digit"}).format(new Date(m.time))));
    item.append(heading,node("div",m.text));return item;
  }));
  if(!threads[selected].length)box.append(node("p",selected==="group"?"Här visas svaren när du frågar hela gruppen.":`Skriv en fråga till ${AGENTS.find(a=>a.id===selected).name}.`,"empty"));
  box.scrollTop=follow?box.scrollHeight:old;updateJump();
}
function select(id){
  selected=id;const agent=AGENTS.find(a=>a.id===id);
  $("#room-title").textContent=agent?.name||"Alla sju agenter";
  $("#room-description").textContent=agent?`${agent.department} · ${agent.description}`:"Samma fråga, ett svar per roll i turordning.";
  for(const button of document.querySelectorAll("[data-agent]"))button.setAttribute("aria-pressed",String(button.dataset.agent===id));
  $("#group-view").setAttribute("aria-pressed",String(id==="group"));
  $("#send").textContent=id==="group"?"Skicka till hela gruppen":"Skicka till agenten";
  renderMessages(true);
}
for(const agent of AGENTS){
  const button=node("button");button.type="button";button.dataset.agent=agent.id;button.setAttribute("aria-pressed",String(agent.id===selected));
  button.append(node("strong",agent.name),node("small",agent.department));button.onclick=()=>select(agent.id);$("#agent-list").append(button);
}
function controls(){
  const seconds=Math.max(0,Math.ceil((readyAt-Date.now())/1000));
  $("#send").disabled=$("#ask-all").disabled=!connected||busy||seconds>0;
  for(const button of document.querySelectorAll("[data-agent],#group-view"))button.disabled=busy;
  $("#connect").disabled=loading||busy;$("#stop").hidden=!groupController;
  $("#countdown").hidden=!seconds;
  $("#countdown").textContent=seconds>60?`Nästa AI-anrop om cirka ${Math.ceil(seconds/60)} minuter. Ditt utkast finns kvar.`:`Nästa AI-anrop om ${seconds} s. Ditt utkast finns kvar.`;
}
async function connect(){
  if(loading||busy)return;loading=true;controls();
  $("#connection-status").textContent="Kontrollerar AI-anslutningen…";
  try {
    const response=await fetch("/api/config",{signal:AbortSignal.timeout(15000)});
    if(response.status===401){location.assign("/login?next=agents");return;}
    if(!response.ok)throw new Error("Testservern kunde inte nås.");
    const config=await response.json();connected=config.aiConfigured===true;
    minimumInterval=Math.max(0,Number(config.minimumIntervalMs)||0);
    readyAt=Date.now()+Math.max(0,Number(config.aiCooldownMs)||0);
    $("#connection-status").textContent=connected?`${config.aiProvider} · ${config.aiModel||"vald modell"} · testserver ansluten`:`AI är inte ansluten. ${config.aiSetupReason==="confirm-free-tier"?"Gratisnivån behöver bekräftas.":"Servernyckeln behöver kontrolleras."}`;
    $("#limits").textContent=`Miljöns gräns: ${config.maxRunsPerHour} frågor/timme. Gruppen använder sju anrop och tar cirka ${Math.ceil(minimumInterval*6/60000)} minuter plus svarstid. Leverantörens egna gränser kan också gälla.`;
  }catch(e){connected=false;$("#connection-status").textContent=`Anslutningen kunde inte kontrolleras. ${e.name==="TimeoutError"?"Testservern tog för lång tid på sig.":e.message} Tryck Kontrollera anslutning för ett nytt försök.`;}
  finally{loading=false;controls();}
}
function history(thread,message){
  const list=threads[thread].filter(m=>m.author!=="System");
  if(list.at(-1)?.author==="Du"&&list.at(-1)?.text===message)list.pop();
  return list.slice(-6).map(m=>({author:m.author,text:m.text.slice(0,500)}));
}
async function invoke(id,message,thread){
  readyAt=Math.max(readyAt,Date.now()+minimumInterval);controls();
  $("#activity").textContent=`Inväntar ${AGENTS.find(a=>a.id===id).name}…`;
  try{
    const response=await fetch("/api/agents/run",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({agentId:id,message,history:history(thread,message),contextMode:"agent-lab"}),signal:AbortSignal.timeout(40000)});
    const data=await response.json();
    const remaining=Number(response.ok?data.cooldownMs:data.retryAfterSeconds*1000);
    if(Number.isFinite(remaining))readyAt=Math.max(readyAt,Date.now()+Math.max(0,remaining));
    if(!response.ok)throw new Error(data.error||"Agenten kunde inte svara.");
    const agent=AGENTS.find(a=>a.id===data.agentId&&a.name===data.author);
    if(!agent||agent.id!==id||data.kind!=="ai"||typeof data.text!=="string")throw new Error("Servern skickade ett ogiltigt agentsvar.");
    add(thread,data.author,data.text,"ai",data.model);$("#activity").textContent=`Svar från ${data.author} · ${data.model}.`;return true;
  }catch(e){
    const text=e.name==="TimeoutError"?"Agenten svarade inte inom tidsgränsen. Inget ersättningssvar har skapats.":e.message;
    add(thread,"System",text,"error");$("#activity").textContent="AI-anropet misslyckades. Felet visas i chatten.";return false;
  }
}
function pause(ms,signal){return new Promise(resolve=>{if(signal?.aborted){resolve();return;}const done=()=>{clearTimeout(timer);signal?.removeEventListener("abort",done);resolve();};const timer=setTimeout(done,ms);signal?.addEventListener("abort",done,{once:true});});}
async function submit(all=false){
  const message=$("#question").value.trim();if(!message||!connected||busy||Date.now()<readyAt)return;
  const thread=all?"group":selected;busy=true;if(all){groupController=new AbortController();select("group");}
  $("#question").value="";add(thread,"Du",message);controls();
  try{
    const roles=all?AGENTS:[AGENTS.find(a=>a.id===selected)];
    for(const role of roles){
      if(groupController?.signal.aborted)break;
      const wait=Math.max(0,readyAt-Date.now());
      if(wait){$("#activity").textContent=`Paus före ${role.name}.`;await pause(wait+100,groupController?.signal);}
      if(groupController?.signal.aborted)break;
      if(!await invoke(role.id,message,thread))break;
    }
  }finally{
    if(groupController?.signal.aborted)$("#activity").textContent="Gruppen stoppad. Ett redan påbörjat svar kan ha slutförts.";
    groupController=null;busy=false;controls();
  }
}
$("#question-form").onsubmit=e=>{e.preventDefault();submit(selected==="group");};
$("#ask-all").onclick=()=>submit(true);$("#group-view").onclick=()=>select("group");
$("#connect").onclick=connect;$("#stop").onclick=()=>groupController?.abort();
$("#messages").addEventListener("scroll",updateJump);$("#latest").onclick=()=>{$("#messages").scrollTop=$("#messages").scrollHeight;updateJump();};
$("#export").onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify({version:1,agent:selected,messages:threads[selected]},null,2)],{type:"application/json"}));const link=node("a");link.href=url;link.download=`Ponce_Nova_${selected}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
select("ponce");setInterval(controls,1000);connect();
