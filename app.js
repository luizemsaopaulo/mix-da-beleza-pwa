const API_URL="https://script.google.com/macros/s/AKfycbxzpNyNvcmYHDGikp6wFd44XmsWDdMhjFBjxLLjLBQDaBCmNXfi5Ph-_zLIrvRdjCURVg/exec";
const FIELD_META={
  totalEntrou:{title:"Total entrou",defaultLabel:"Caderno"},
  saidas:{title:"Saídas",defaultLabel:"Saída"},
  dinheiro:{title:"Dinheiro / Caixa",defaultLabel:"Dinheiro"},
  cartao:{title:"Cartão",defaultLabel:"Cartão"},
  pix:{title:"PIX",defaultLabel:"PIX"}
};
const state={
  activeField:null,
  currentDate:"",
  entries:{totalEntrou:[],saidas:[],dinheiro:[],cartao:[],pix:[]},
  calc:{input:"",acc:null,op:null,expression:"",justComputed:false,error:false}
};
const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
const money=n=>(Number(n)||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const total=f=>state.entries[f].reduce((s,x)=>s+Number(x.value||0),0);
const uid=()=>crypto.randomUUID?crypto.randomUUID():Date.now()+"-"+Math.random().toString(16).slice(2);
const todayLocal=()=>{const d=new Date();d.setMinutes(d.getMinutes()-d.getTimezoneOffset());return d.toISOString().slice(0,10)};

function hasValues(){
  return Object.values(state.entries).some(arr=>arr.length>0)||$("#notes").value.trim()!=="";
}
function saveDraft(){
  localStorage.setItem("mixCaixaDraft",JSON.stringify({
    date:$("#closingDate").value,
    notes:$("#notes").value,
    entries:state.entries
  }));
}
function loadDraft(){
  try{
    const d=JSON.parse(localStorage.getItem("mixCaixaDraft")||"null");
    if(!d)return;
    if(d.date)$("#closingDate").value=d.date;
    if(d.notes)$("#notes").value=d.notes;
    if(d.entries)Object.keys(state.entries).forEach(k=>{
      state.entries[k]=Array.isArray(d.entries[k])?d.entries[k]:[];
    });
  }catch{}
}
function loadPermanentCloser(){
  let saved=localStorage.getItem("mixCloserName")||"";
  if(!saved){
    try{
      const oldDraft=JSON.parse(localStorage.getItem("mixCaixaDraft")||"null");
      saved=(oldDraft&&oldDraft.name)||"";
      if(saved)localStorage.setItem("mixCloserName",saved);
    }catch{}
  }
  $("#closerName").value=saved;
}
function clearValuesKeepDate(){
  Object.keys(state.entries).forEach(k=>state.entries[k]=[]);
  $("#notes").value="";
  $("#saveFeedback").textContent="";
  render();
  saveDraft();
}
function resetClosing(){
  clearValuesKeepDate();
}
function handleDateChange(){
  const input=$("#closingDate");
  const next=input.value;
  const previous=state.currentDate;
  if(!previous){state.currentDate=next;saveDraft();return}
  if(next===previous)return;
  if(hasValues()){
    const ok=confirm("Iniciar novo dia?\n\nOs valores atuais serão zerados para começar o fechamento da nova data.");
    if(!ok){input.value=previous;return}
    clearValuesKeepDate();
  }
  state.currentDate=next;
  saveDraft();
}
function render(){
  Object.keys(state.entries).forEach(f=>{
    const sum=total(f),count=state.entries[f].length;
    const t=document.querySelector('[data-total="'+f+'"]');
    const c=document.querySelector('[data-count="'+f+'"]');
    if(t)t.textContent=money(sum);
    if(c)c.textContent=count?count+(count===1?" valor":" valores"):"Nenhum valor";
  });
  const pay=total("dinheiro")+total("cartao")+total("pix");
  const diff=pay-total("totalEntrou");
  const net=total("totalEntrou")-total("saidas");
  $("#paymentsTotal").textContent=money(pay);
  $("#differenceTotal").textContent=money(diff);
  $("#netTotal").textContent=money(net);
  const msg=$("#conferenceMessage");
  if(total("totalEntrou")===0){
    msg.textContent="Lance os valores para conferir o caixa.";
    msg.className="";
  }else if(Math.abs(diff)<.005){
    msg.textContent="✓ Caixa conferido: as formas de pagamento batem com o total.";
    msg.className="ok";
  }else{
    msg.textContent="Atenção: existe diferença de "+money(diff)+" no fechamento.";
    msg.className="bad";
  }
}
function parseCalcInput(){
  if(!state.calc.input)return 0;
  return Number(state.calc.input.replace(/\./g,"").replace(",","."))||0;
}
function calcLabel(n){
  return Number(n).toLocaleString("pt-BR",{minimumFractionDigits:0,maximumFractionDigits:2});
}
function applyOp(a,b,op){
  if(op==="+")return a+b;
  if(op==="−")return a-b;
  if(op==="×")return a*b;
  if(op==="÷"){
    if(Math.abs(b)<1e-12)throw new Error("DIV_ZERO");
    return a/b;
  }
  return b;
}
function resetCalc(){
  state.calc={input:"",acc:null,op:null,expression:"",justComputed:false,error:false};
}
function calcCurrentValue(){
  if(state.calc.error)return 0;
  if(state.calc.input!=="")return parseCalcInput();
  if(state.calc.acc!==null)return state.calc.acc;
  return 0;
}
function renderCalc(){
  if(!state.activeField)return;
  $("#calcTitle").textContent=FIELD_META[state.activeField].title;
  $("#calcFieldTotal").textContent=money(total(state.activeField));
  $("#calcExpression").textContent=state.calc.error?"Não é possível dividir por zero":state.calc.expression;
  $("#calcDisplay").textContent=state.calc.error?"Erro":money(calcCurrentValue());
  const list=$("#entryList");
  list.innerHTML="";
  state.entries[state.activeField].forEach(item=>{
    const row=document.createElement("div");
    row.className="entry-row";
    row.innerHTML="<span></span><strong></strong><button type='button' aria-label='Excluir'>×</button>";
    row.children[0].textContent=item.label||"Valor";
    row.children[1].textContent=money(item.value);
    row.children[2].onclick=()=>{
      state.entries[state.activeField]=state.entries[state.activeField].filter(x=>x.id!==item.id);
      renderCalc();render();saveDraft();
    };
    list.appendChild(row);
  });
  if(!list.children.length)list.innerHTML='<p class="empty">Nenhum valor lançado neste campo.</p>';
}
function openCalc(field){
  state.activeField=field;
  resetCalc();
  $("#entryLabel").value=field==="totalEntrou"?FIELD_META[field].defaultLabel:"";
  renderCalc();
  $("#calcDialog").showModal();
}
function enterDigits(key){
  if(state.calc.error)resetCalc();
  if(state.calc.justComputed&&!state.calc.op)resetCalc();
  state.calc.justComputed=false;
  if(key===","){
    if(!state.calc.input.includes(","))state.calc.input=(state.calc.input||"0")+",";
  }else{
    const dec=(state.calc.input.split(",")[1]||"").length;
    if(state.calc.input.includes(",")&&dec>=2)return;
    if(state.calc.input.replace(/\D/g,"").length>=10)return;
    state.calc.input+=key;
  }
}
function chooseOperator(op){
  if(state.calc.error)resetCalc();
  const hasInput=state.calc.input!=="";
  if(state.calc.acc===null){
    state.calc.acc=hasInput?parseCalcInput():0;
  }else if(state.calc.op&&hasInput){
    try{state.calc.acc=applyOp(state.calc.acc,parseCalcInput(),state.calc.op)}
    catch{state.calc.error=true;renderCalc();return}
  }
  state.calc.op=op;
  state.calc.input="";
  state.calc.justComputed=false;
  state.calc.expression=calcLabel(state.calc.acc)+" "+op;
}
function equalsCalc(){
  if(state.calc.error||state.calc.acc===null||!state.calc.op||state.calc.input==="")return;
  const a=state.calc.acc,b=parseCalcInput(),op=state.calc.op;
  try{
    const result=applyOp(a,b,op);
    state.calc.expression=calcLabel(a)+" "+op+" "+calcLabel(b)+" =";
    state.calc.acc=result;
    state.calc.input="";
    state.calc.op=null;
    state.calc.justComputed=true;
  }catch{
    state.calc.error=true;
  }
}
function keypad(key){
  if(key==="clear"){resetCalc();renderCalc();return}
  if(key==="back"){
    if(state.calc.error){resetCalc()}
    else if(state.calc.input)state.calc.input=state.calc.input.slice(0,-1);
    renderCalc();return;
  }
  if(["+","−","×","÷"].includes(key)){chooseOperator(key);renderCalc();return}
  if(key==="="){equalsCalc();renderCalc();return}
  enterDigits(key);
  renderCalc();
}
function addEntry(){
  if(state.calc.op&&state.calc.input!=="")equalsCalc();
  if(state.calc.error)return;
  const value=calcCurrentValue();
  if(!Number.isFinite(value)||Math.abs(value)<0.000001)return;
  const label=$("#entryLabel").value.trim()||FIELD_META[state.activeField].defaultLabel;
  state.entries[state.activeField].push({id:uid(),label,value});
  resetCalc();
  $("#entryLabel").value="";
  renderCalc();render();saveDraft();
}

function history(){
  try{return JSON.parse(localStorage.getItem("mixCaixaHistory")||"[]")}catch{return[]}
}
function saveHistory(item){
  const h=history().filter(x=>!(x.date===item.date&&x.name===item.name));
  h.unshift(item);
  localStorage.setItem("mixCaixaHistory",JSON.stringify(h.slice(0,60)));
  renderHistory();fillCloserSuggestions();
}
function renderHistory(){
  const box=$("#localHistory"),h=history();
  box.innerHTML="";
  if(!h.length){box.innerHTML='<p class="empty">Nenhum fechamento salvo neste aparelho.</p>';return}
  h.slice(0,10).forEach(x=>{
    const el=document.createElement("div");
    el.className="history-item";
    const d=new Date(x.date+"T12:00:00").toLocaleDateString("pt-BR");
    el.innerHTML="<div><strong></strong><span></span></div><strong></strong>";
    el.children[0].children[0].textContent=d+" • "+x.name;
    el.children[0].children[1].textContent="Resultado "+money(x.net);
    el.children[1].textContent=money(x.total);
    box.appendChild(el);
  });
}
function fillCloserSuggestions(){
  const names=[...new Set(history().map(x=>x.name).filter(Boolean))];
  const dl=$("#closerSuggestions");dl.innerHTML="";
  names.forEach(n=>{const o=document.createElement("option");o.value=n;dl.appendChild(o)});
}
function setConnection(ok,text){
  $("#connectionDot").className="dot "+(ok?"ok":"bad");
  $("#connectionText").textContent=text;
}
async function getJson(url,opts={}){
  const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),10000);
  try{
    const r=await fetch(url,{...opts,redirect:"follow",signal:ctl.signal});
    const text=await r.text();
    if(/accounts\.google\.com|signin/i.test(r.url+" "+text))throw new Error("LOGIN_REQUIRED");
    let data;
    try{data=JSON.parse(text)}catch{throw new Error("RESPOSTA_INVALIDA")}
    if(!r.ok||data.ok===false)throw new Error(data.error||("HTTP "+r.status));
    return data;
  }finally{clearTimeout(timer)}
}
async function testConnection(){
  $("#connectionText").textContent="Conectando ao Google Sheets...";
  try{
    await getJson(API_URL+"?action=ping&t="+Date.now());
    setConnection(true,"Google Sheets conectado");
    return true;
  }catch(e){
    setConnection(false,e.message==="LOGIN_REQUIRED"?"Google Sheets aguardando atualização do Apps Script":"Sem conexão com o Google Sheets");
    return false;
  }
}
async function submitClosing(){
  const name=$("#closerName").value.trim();
  const date=$("#closingDate").value;
  if(!name){$("#saveFeedback").textContent="Informe quem fez o fechamento.";$("#closerName").focus();return}
  if(!date){$("#saveFeedback").textContent="Informe a data.";return}
  if(total("totalEntrou")<=0){$("#saveFeedback").textContent="Lance pelo menos um valor em Total entrou.";return}
  const pay=total("dinheiro")+total("cartao")+total("pix");
  const diff=pay-total("totalEntrou");
  if(Math.abs(diff)>=.005&&!confirm("Existe uma diferença de "+money(diff)+". Deseja salvar mesmo assim?"))return;
  const payload={
    action:"saveClosing",date,closer:name,notes:$("#notes").value.trim(),
    totalEntrouEntries:state.entries.totalEntrou,
    totals:{saidas:total("saidas"),dinheiro:total("dinheiro"),cartao:total("cartao"),pix:total("pix")}
  };
  $("#saveBtn").disabled=true;$("#saveFeedback").textContent="Salvando...";
  try{
    const data=await getJson(API_URL,{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify(payload)});
    saveHistory({date,name,total:data.totalEntrou??total("totalEntrou"),net:data.resultado??(total("totalEntrou")-total("saidas"))});
    $("#saveFeedback").textContent="✓ Fechamento salvo na planilha.";
    clearValuesKeepDate();
    setConnection(true,"Google Sheets conectado");
  }catch(e){
    $("#saveFeedback").textContent=e.message==="LOGIN_REQUIRED"
      ?"O Apps Script precisa ser atualizado para esta versão do PWA."
      :"Não foi possível salvar: "+e.message;
  }finally{$("#saveBtn").disabled=false}
}

function renderReport(scope,rows,sourceText=""){
  const prefix=scope==="daily"?"daily":scope==="weekly"?"weekly":"monthly";
  const cards=$("#"+prefix+"Cards"),bars=$("#"+prefix+"Bars");
  cards.innerHTML="";bars.innerHTML="";
  if(!rows.length){bars.innerHTML='<p class="empty">Ainda não há dados para este período.</p>';return}
  const latest=rows[rows.length-1];
  const sum=rows.reduce((a,x)=>a+Number(x.total||0),0);
  const net=rows.reduce((a,x)=>a+Number(x.resultado||0),0);
  [["Último período",latest.label],["Total exibido",money(sum)],["Resultado",money(net)]].forEach(([label,value])=>{
    const c=document.createElement("div");
    c.className="metric-card";
    c.innerHTML="<span></span><strong></strong>";
    c.children[0].textContent=label;c.children[1].textContent=value;
    cards.appendChild(c);
  });
  const max=Math.max(...rows.map(x=>Number(x.total||0)),1);
  rows.slice(-31).forEach(x=>{
    const r=document.createElement("div");
    r.className="bar-row";
    r.innerHTML='<div class="bar-top"><span></span><strong></strong></div><div class="bar-track"><div class="bar-fill"></div></div>';
    r.querySelector("span").textContent=x.label;
    r.querySelector("strong").textContent=money(x.total);
    r.querySelector(".bar-fill").style.width=Math.max(2,Number(x.total||0)/max*100)+"%";
    bars.appendChild(r);
  });
  if(sourceText){
    const p=document.createElement("p");p.className="empty";p.textContent=sourceText;bars.prepend(p);
  }
}
async function seedReport(scope){
  const r=await fetch("./seed-summary.json?"+Date.now(),{cache:"no-store"});
  if(!r.ok)throw new Error("SEED");
  const data=await r.json();
  return data[scope]||[];
}
async function loadReport(scope){
  const prefix=scope==="daily"?"daily":scope==="weekly"?"weekly":"monthly";
  const bars=$("#"+prefix+"Bars");
  bars.innerHTML='<p class="report-loading">Carregando dados da planilha...</p>';
  try{
    const data=await getJson(API_URL+"?action=summary&scope="+scope+"&t="+Date.now());
    const rows=data.rows||[];
    localStorage.setItem("mixReportCache_"+scope,JSON.stringify(rows));
    renderReport(scope,rows);
    setConnection(true,"Google Sheets conectado");
    return;
  }catch{}
  try{
    const cached=JSON.parse(localStorage.getItem("mixReportCache_"+scope)||"null");
    if(Array.isArray(cached)&&cached.length){renderReport(scope,cached,"Últimos dados sincronizados.");return}
  }catch{}
  try{
    const rows=await seedReport(scope);
    renderReport(scope,rows,"Dados atuais carregados com a PWA.");
  }catch{
    renderReport(scope,[]);
  }
}
function switchView(view){
  $$(".view").forEach(v=>v.classList.remove("active"));
  $("#view-"+view).classList.add("active");
  $$(".nav-btn").forEach(b=>b.classList.toggle("active",b.dataset.view===view));
  $("#pageTitle").textContent=view==="caixa"?"Fechamento do caixa":view==="diario"?"Resumo diário":view==="semanal"?"Resumo semanal":"Resumo mensal";
  if(view!=="caixa")loadReport(view==="diario"?"daily":view==="semanal"?"weekly":"monthly");
  window.scrollTo({top:0,behavior:"smooth"});
}

let deferredPrompt=null;
window.addEventListener("beforeinstallprompt",e=>{
  e.preventDefault();deferredPrompt=e;$("#installBtn").classList.remove("hidden");
});
$("#installBtn").addEventListener("click",async()=>{
  if(!deferredPrompt)return;
  deferredPrompt.prompt();await deferredPrompt.userChoice;
  deferredPrompt=null;$("#installBtn").classList.add("hidden");
});
$$(".money-card").forEach(b=>b.addEventListener("click",()=>openCalc(b.dataset.field)));
$("#keypad").addEventListener("click",e=>{
  const b=e.target.closest("button[data-key]");
  if(b)keypad(b.dataset.key);
});
$("#addEntryBtn").addEventListener("click",addEntry);
$("#closeCalcBtn").addEventListener("click",()=>$("#calcDialog").close());
$("#doneCalcBtn").addEventListener("click",()=>{render();saveDraft()});
$("#saveBtn").addEventListener("click",submitClosing);
$("#clearBtn").addEventListener("click",()=>{
  if(confirm("Limpar os valores lançados neste fechamento?"))resetClosing();
});
$("#closingDate").addEventListener("change",handleDateChange);
$("#closerName").addEventListener("input",()=>{
  localStorage.setItem("mixCloserName",$("#closerName").value);
});
$("#notes").addEventListener("input",saveDraft);
$$(".nav-btn").forEach(b=>b.addEventListener("click",()=>switchView(b.dataset.view)));
$$(".refresh-report").forEach(b=>b.addEventListener("click",()=>loadReport(b.dataset.scope)));

$("#closingDate").value=todayLocal();
loadDraft();
loadPermanentCloser();
state.currentDate=$("#closingDate").value||todayLocal();
$("#closingDate").value=state.currentDate;
render();renderHistory();fillCloserSuggestions();testConnection();
if("serviceWorker" in navigator){
  window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(()=>{}));
}