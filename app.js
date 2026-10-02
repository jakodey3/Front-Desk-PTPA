
const DB_NAME = "ptpa_frontdesk_kiosk";
const DB_VERSION = 1;
const DEFAULT_PIN = "2468";
let db;

const $ = id => document.getElementById(id);
const views = ["homeView","visitorView","officialView","parentInView","parentOutView","adminView"];
const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
};
const timeOnly = ts => new Date(ts).toLocaleTimeString([], {hour:"numeric", minute:"2-digit"});
const datePretty = d => {
  const [y,m,day] = d.split("-").map(Number);
  return new Date(y,m-1,day).toLocaleDateString();
};
const safe = v => String(v ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
const escCSV = v => `"${String(v ?? "").replace(/"/g,'""')}"`;

function showView(id){
  views.forEach(v => $(v).classList.toggle("active", v===id));
  window.scrollTo({top:0, behavior:"instant"});
}
function toast(msg){
  const t = $("toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  clearTimeout(window.toastTimer);
  window.toastTimer = setTimeout(()=>t.classList.add("hidden"), 3200);
}
function updateStatus(){
  $("statusPill").textContent = navigator.onLine ? "Online • Offline-ready" : "Offline mode";
}

function openDB(){
  return new Promise((resolve,reject)=>{
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if(!db.objectStoreNames.contains("students")){
        const s = db.createObjectStore("students",{keyPath:"studentId"});
        s.createIndex("active","active",{unique:false});
      }
      if(!db.objectStoreNames.contains("records")){
        const r = db.createObjectStore("records",{keyPath:"id", autoIncrement:true});
        r.createIndex("date","date",{unique:false});
        r.createIndex("type","type",{unique:false});
        r.createIndex("openVisitor","openVisitor",{unique:false});
      }
      if(!db.objectStoreNames.contains("settings")){
        db.createObjectStore("settings",{keyPath:"key"});
      }
    };
    req.onsuccess = ()=>resolve(req.result);
    req.onerror = ()=>reject(req.error);
  });
}
function store(name, mode="readonly"){ return db.transaction(name, mode).objectStore(name); }
function reqP(req){ return new Promise((resolve,reject)=>{ req.onsuccess=()=>resolve(req.result); req.onerror=()=>reject(req.error); });}
async function getSetting(key, fallback){
  const row = await reqP(store("settings").get(key));
  return row ? row.value : fallback;
}
async function setSetting(key, value){ await reqP(store("settings","readwrite").put({key,value}));}
async function getStudent(id){ return reqP(store("students").get(String(id).trim()));}
async function getAllStudents(){ return reqP(store("students").getAll());}
async function saveStudent(student, originalId=null){
  const tx = db.transaction("students","readwrite");
  const s = tx.objectStore("students");
  if(originalId && originalId !== student.studentId) s.delete(originalId);
  s.put(student);
  return new Promise((resolve,reject)=>{tx.oncomplete=resolve; tx.onerror=()=>reject(tx.error);});
}
async function deleteStudent(id){ await reqP(store("students","readwrite").delete(id));}
async function getAllRecords(){ return reqP(store("records").getAll());}
async function addRecord(record){ return reqP(store("records","readwrite").add(record));}
async function deleteRecord(id){ return reqP(store("records","readwrite").delete(Number(id))); }
async function clearStore(name){ return reqP(store(name,"readwrite").clear()); }

async function maybeFillStudent(studentId, nameFieldId, gradeFieldId){
  const val = $(studentId).value.trim();
  if(!val) return;
  const s = await getStudent(val);
  if(s){
    $(nameFieldId).value = `${s.firstName} ${s.lastName}`;
    $(gradeFieldId).value = s.grade;
  }
}

async function saveVisitorSignIn(e){
  e.preventDefault();
  const first = $("vFirstName").value.trim();
  const last = $("vLastName").value.trim();
  const phone = $("vPhone").value.trim();
  const org = $("vOrg").value.trim();
  const reason = $("vReason").value;
  const meetingWith = $("vMeetingWith").value.trim();
  const notes = $("vNotes").value.trim();
  const date = todayISO();
  const timestamp = new Date().toISOString();
  const openVisitor = `${last.toLowerCase()}|${phone}|open`;
  await addRecord({
    type:"visitor_in", date, timestamp,
    firstName:first,lastName:last, phone, organization:org,
    reason, meetingWith, notes,
    openVisitor, closed:false
  });
  e.target.reset();
  toast(`Visitor signed in: ${first} ${last}`);
  await refreshAll();
}
async function renderOpenVisitors(term=""){
  const rows = (await getAllRecords())
    .filter(r => r.type==="visitor_in" && !r.closed)
    .filter(r => {
      if(!term) return true;
      const q = term.toLowerCase();
      return (r.lastName||"").toLowerCase().includes(q) || (r.phone||"").toLowerCase().includes(q);
    })
    .sort((a,b)=> b.timestamp.localeCompare(a.timestamp));
  const body = $("visitorOpenTable");
  body.innerHTML = "";
  if(!rows.length){
    body.innerHTML = '<tr><td colspan="4">No open visitors found.</td></tr>';
    return;
  }
  rows.forEach(r=>{
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${safe(r.firstName)} ${safe(r.lastName)}</td>
      <td>${timeOnly(r.timestamp)}</td>
      <td>${safe(r.reason || "")}</td>
      <td><button class="icon-btn signout-visitor" data-id="${r.id}">Sign Out</button></td>`;
    body.appendChild(tr);
  });
}
async function signOutVisitor(id){
  const all = await getAllRecords();
  const open = all.find(r => r.id === Number(id));
  if(!open) return;
  await addRecord({
    type:"visitor_out",
    date:todayISO(),
    timestamp:new Date().toISOString(),
    firstName:open.firstName,
    lastName:open.lastName,
    phone:open.phone || "",
    organization:open.organization || "",
    reason:open.reason || "",
    meetingWith:open.meetingWith || "",
    notes:`Signed out from visit started at ${timeOnly(open.timestamp)}`
  });
  open.closed = true;
  await reqP(store("records","readwrite").put(open));
  toast(`Visitor signed out: ${open.firstName} ${open.lastName}`);
  await refreshAll();
}


async function saveOfficialSignIn(e){
  e.preventDefault();
  const first = $("oFirstName").value.trim();
  const last = $("oLastName").value.trim();
  const officialType = $("oType").value;
  const agency = $("oAgency").value.trim();
  const role = $("oRole").value.trim();
  const credential = $("oCredential").value.trim();
  const phone = $("oPhone").value.trim();
  const purpose = $("oPurpose").value;
  const meetingWith = $("oMeetingWith").value.trim();
  const notes = $("oNotes").value.trim();

  await addRecord({
    type:"official_in",
    date:todayISO(),
    timestamp:new Date().toISOString(),
    firstName:first,
    lastName:last,
    officialType,
    agency,
    role,
    credential,
    phone,
    purpose,
    meetingWith,
    notes,
    closed:false
  });

  e.target.reset();
  toast(`Official signed in: ${first} ${last} • ${agency}`);
  await refreshAll();
}

async function renderOpenOfficials(term=""){
  const q = term.trim().toLowerCase();
  const rows = (await getAllRecords())
    .filter(r => r.type==="official_in" && !r.closed)
    .filter(r => {
      if(!q) return true;
      return (r.lastName||"").toLowerCase().includes(q)
        || (r.agency||"").toLowerCase().includes(q)
        || (r.credential||"").toLowerCase().includes(q);
    })
    .sort((a,b)=>b.timestamp.localeCompare(a.timestamp));

  const body = $("officialOpenTable");
  body.innerHTML = "";
  if(!rows.length){
    body.innerHTML = '<tr><td colspan="4">No open official / agency visits found.</td></tr>';
    return;
  }

  rows.forEach(r=>{
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${safe(r.firstName)} ${safe(r.lastName)}<br><small>${safe(r.officialType||"")}</small></td>
      <td>${safe(r.agency||"")}</td>
      <td>${timeOnly(r.timestamp)}</td>
      <td><button class="icon-btn signout-official" data-id="${r.id}">Sign Out</button></td>`;
    body.appendChild(tr);
  });
}

async function signOutOfficial(id){
  const all = await getAllRecords();
  const open = all.find(r=>r.id===Number(id));
  if(!open) return;

  await addRecord({
    type:"official_out",
    date:todayISO(),
    timestamp:new Date().toISOString(),
    firstName:open.firstName,
    lastName:open.lastName,
    officialType:open.officialType||"",
    agency:open.agency||"",
    role:open.role||"",
    credential:open.credential||"",
    phone:open.phone||"",
    purpose:open.purpose||"",
    meetingWith:open.meetingWith||"",
    notes:`Signed out from official visit started at ${timeOnly(open.timestamp)}`
  });

  open.closed = true;
  await reqP(store("records","readwrite").put(open));
  toast(`Official signed out: ${open.firstName} ${open.lastName}`);
  await refreshAll();
}

async function saveParentCheckIn(e){
  e.preventDefault();
  const studentId = $("piStudentId").value.trim();
  const name = $("piStudentName").value.trim();
  const grade = $("piGrade").value.trim();
  await addRecord({
    type:"student_checkin",
    date:todayISO(),
    timestamp:new Date().toISOString(),
    parentName:$("piParentName").value.trim(),
    parentPhone:$("piParentPhone").value.trim(),
    studentId,
    studentName:name,
    grade,
    reason:$("piReason").value,
    notes:$("piNotes").value.trim()
  });
  e.target.reset();
  toast(`Student checked in: ${name || studentId}`);
  await refreshAll();
}
async function saveParentCheckOut(e){
  e.preventDefault();
  const studentId = $("poStudentId").value.trim();
  const name = $("poStudentName").value.trim();
  const grade = $("poGrade").value.trim();
  await addRecord({
    type:"student_checkout",
    date:todayISO(),
    timestamp:new Date().toISOString(),
    parentName:$("poParentName").value.trim(),
    parentPhone:$("poParentPhone").value.trim(),
    studentId,
    studentName:name,
    grade,
    reason:$("poReason").value,
    notes:$("poNotes").value.trim()
  });
  e.target.reset();
  toast(`Student checked out: ${name || studentId}`);
  await refreshAll();
}

async function renderSummary(){
  const todays = (await getAllRecords()).filter(r=>r.date===todayISO());
  $("sumVisitors").textContent = todays.filter(r=>r.type==="visitor_in").length;
  $("sumOfficials").textContent = todays.filter(r=>r.type==="official_in").length;
  $("sumCheckIns").textContent = todays.filter(r=>r.type==="student_checkin").length;
  $("sumCheckOuts").textContent = todays.filter(r=>r.type==="student_checkout").length;
}
async function renderRoster(){
  const rows = (await getAllStudents()).sort((a,b)=>a.lastName.localeCompare(b.lastName)||a.firstName.localeCompare(b.firstName));
  const body = $("rosterTable");
  body.innerHTML = "";
  if(!rows.length){
    body.innerHTML = '<tr><td colspan="5">No students yet. Add one or import a roster CSV.</td></tr>';
    return;
  }
  rows.forEach(s=>{
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${safe(s.studentId)}</td><td>${safe(s.lastName)}, ${safe(s.firstName)}</td><td>${safe(s.grade)}</td><td>${s.active?"Active":"Inactive"}</td>
    <td><button class="icon-btn edit-student" data-id="${encodeURIComponent(s.studentId)}">Edit</button><button class="icon-btn delete-student" data-id="${encodeURIComponent(s.studentId)}">Delete</button></td>`;
    body.appendChild(tr);
  });
}
function recordTypeLabel(t){
  return {
    visitor_in:"Visitor Sign-In",
    visitor_out:"Visitor Sign-Out",
    official_in:"Official / Agency Sign-In",
    official_out:"Official / Agency Sign-Out",
    student_checkin:"Student Check-In",
    student_checkout:"Student Check-Out"
  }[t] || t;
}
async function renderRecords(){
  const date = $("recordDate").value || todayISO();
  const type = $("recordTypeFilter").value;
  let rows = (await getAllRecords()).filter(r => r.date===date && (!type || r.type===type)).sort((a,b)=> b.timestamp.localeCompare(a.timestamp));
  const body = $("recordsTable");
  body.innerHTML = "";
  if(!rows.length){
    body.innerHTML = '<tr><td colspan="7">No records for this selection.</td></tr>';
    return;
  }
  rows.forEach(r=>{
    const isVisitor = r.type.startsWith("visitor");
    const isOfficial = r.type.startsWith("official");
    const name = (isVisitor || isOfficial) ? `${r.firstName||""} ${r.lastName||""}`.trim() : (r.studentName || "");
    const details = isVisitor
      ? `${r.reason || ""}${r.meetingWith ? " • " + r.meetingWith : ""}`
      : isOfficial
        ? `${r.agency || ""}${r.officialType ? " • " + r.officialType : ""}${r.purpose ? " • " + r.purpose : ""}`
        : `${r.parentName || ""}${r.reason ? " • " + r.reason : ""}`;
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${datePretty(r.date)}</td><td>${timeOnly(r.timestamp)}</td><td>${recordTypeLabel(r.type)}</td><td>${safe(name)}</td><td>${safe(r.studentId || "")}</td><td>${safe(details)}</td>
    <td><button class="icon-btn delete-record" data-id="${r.id}">Delete</button></td>`;
    body.appendChild(tr);
  });
}
async function refreshAll(){
  await renderSummary();
  if($("adminView").classList.contains("active")){
    await renderRoster();
    await renderRecords();
  }
  await renderOpenVisitors($("visitorSearch").value.trim());
  await renderOpenOfficials($("officialSearch").value.trim());
}

function openAdmin(){
  $("adminPinInput").value = "";
  $("adminError").classList.add("hidden");
  $("adminDialog").showModal();
  setTimeout(()=>$("adminPinInput").focus(),100);
}
async function unlockAdmin(e){
  e.preventDefault();
  const pin = await getSetting("adminPin", DEFAULT_PIN);
  if($("adminPinInput").value !== pin){
    $("adminError").classList.remove("hidden");
    return;
  }
  $("adminDialog").close();
  $("recordDate").value = todayISO();
  showView("adminView");
  await refreshAll();
}
function openStudentDialog(student=null){
  $("studentError").classList.add("hidden");
  $("studentDialogTitle").textContent = student ? "Edit Student" : "Add Student";
  $("editOriginalId").value = student?.studentId || "";
  $("sStudentId").value = student?.studentId || "";
  $("sFirstName").value = student?.firstName || "";
  $("sLastName").value = student?.lastName || "";
  $("sGrade").value = student?.grade || "";
  $("sActive").checked = student ? !!student.active : true;
  $("studentDialog").showModal();
}
async function saveStudentForm(e){
  e.preventDefault();
  const student = {
    studentId:$("sStudentId").value.trim(),
    firstName:$("sFirstName").value.trim(),
    lastName:$("sLastName").value.trim(),
    grade:$("sGrade").value.trim(),
    active:$("sActive").checked
  };
  if(!student.studentId || !student.firstName || !student.lastName || !student.grade){
    $("studentError").textContent = "Complete all required fields.";
    $("studentError").classList.remove("hidden");
    return;
  }
  const original = $("editOriginalId").value || null;
  const existing = await getStudent(student.studentId);
  if(existing && original !== student.studentId){
    $("studentError").textContent = "That student number is already in use.";
    $("studentError").classList.remove("hidden");
    return;
  }
  await saveStudent(student, original);
  $("studentDialog").close();
  toast(`Saved student: ${student.firstName} ${student.lastName}`);
  await refreshAll();
}
function parseCSV(text){
  const rows=[]; let row=[], cell="", q=false;
  for(let i=0;i<text.length;i++){
    const c=text[i], n=text[i+1];
    if(c==='"' && q && n==='"'){cell+='"';i++}
    else if(c==='"'){q=!q}
    else if(c===',' && !q){row.push(cell); cell=""}
    else if((c==='\n' || c==='\r') && !q){
      if(c==='\r' && n==='\n') i++;
      row.push(cell); cell="";
      if(row.some(x=>x.trim()!=="")) rows.push(row);
      row=[];
    } else cell += c;
  }
  row.push(cell); if(row.some(x=>x.trim()!=="")) rows.push(row);
  return rows;
}
async function importRoster(file){
  const text = await file.text();
  const rows = parseCSV(text);
  if(rows.length < 2){ alert("CSV appears empty."); return; }
  const headers = rows[0].map(h=>h.trim().toLowerCase().replace(/\s+/g,""));
  const idx = {
    studentId: headers.findIndex(h=>["studentid","student#","studentnumber","id"].includes(h)),
    firstName: headers.findIndex(h=>["firstname","first"].includes(h)),
    lastName: headers.findIndex(h=>["lastname","last"].includes(h)),
    grade: headers.findIndex(h=>["grade","gradelevel"].includes(h)),
    active: headers.findIndex(h=>["active","status"].includes(h))
  };
  if([idx.studentId, idx.firstName, idx.lastName, idx.grade].some(i=>i<0)){
    alert("CSV must include StudentID, FirstName, LastName, and Grade.");
    return;
  }
  let count = 0;
  for(const r of rows.slice(1)){
    const studentId = (r[idx.studentId] || "").trim();
    if(!studentId) continue;
    let active = true;
    if(idx.active >= 0){
      const v = (r[idx.active] || "").trim().toLowerCase();
      active = !["false","0","inactive","no","n"].includes(v);
    }
    await saveStudent({
      studentId,
      firstName:(r[idx.firstName]||"").trim(),
      lastName:(r[idx.lastName]||"").trim(),
      grade:(r[idx.grade]||"").trim(),
      active
    });
    count++;
  }
  toast(`${count} student record(s) imported.`);
  await refreshAll();
}
function download(name, content, type="text/plain"){
  const blob = new Blob([content], {type});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href), 800);
}
async function exportRoster(){
  const rows = await getAllStudents();
  const lines = ["StudentID,FirstName,LastName,Grade,Active", ...rows.map(s=>[s.studentId,s.firstName,s.lastName,s.grade,s.active].map(escCSV).join(","))];
  download(`PTPA_Kiosk_Roster_${todayISO()}.csv`, lines.join("\n"), "text/csv");
}
async function exportRecords(){
  const date = $("recordDate").value || todayISO();
  const type = $("recordTypeFilter").value;
  const rows = (await getAllRecords()).filter(r=>r.date===date && (!type || r.type===type)).sort((a,b)=>a.timestamp.localeCompare(b.timestamp));
  const lines = ["Date,Time,Type,FirstName,LastName,Agency,OfficialType,Role,CredentialOrBadge,ParentName,ParentPhone,StudentID,StudentName,Grade,ReasonOrPurpose,MeetingWith,Notes",
    ...rows.map(r=>[
      r.date,timeOnly(r.timestamp),recordTypeLabel(r.type),r.firstName||"",r.lastName||"",
      r.agency||"",r.officialType||"",r.role||"",r.credential||"",
      r.parentName||"",r.parentPhone||"",r.studentId||"",r.studentName||"",r.grade||"",
      r.reason||r.purpose||"",r.meetingWith||"",r.notes||""
    ].map(escCSV).join(","))
  ];
  download(`PTPA_Kiosk_Records_${date}${type? "_" + type : ""}.csv`, lines.join("\n"), "text/csv");
}
async function backupAll(){
  const data = {
    app:"PTPA Front Desk Kiosk",
    version:1,
    exportedAt:new Date().toISOString(),
    students:await getAllStudents(),
    records:await getAllRecords(),
    settings:{adminPin: await getSetting("adminPin", DEFAULT_PIN)}
  };
  download(`PTPA_FrontDesk_Backup_${todayISO()}.json`, JSON.stringify(data, null, 2), "application/json");
}
async function restoreBackup(file){
  if(!confirm("Restore this backup? Existing roster and records will be replaced.")) return;
  const data = JSON.parse(await file.text());
  if(!Array.isArray(data.students) || !Array.isArray(data.records)) throw new Error("Invalid backup.");
  await clearStore("students");
  await clearStore("records");
  for(const s of data.students) await saveStudent(s);
  for(const r of data.records){
    const clone = {...r}; delete clone.id;
    await addRecord(clone);
  }
  if(data.settings?.adminPin) await setSetting("adminPin", data.settings.adminPin);
  toast("Backup restored.");
  await refreshAll();
}
async function changePin(e){
  e.preventDefault();
  const a = $("newPin").value, b = $("confirmPin").value;
  if(a.length < 4 || a !== b){
    $("pinError").textContent = a !== b ? "PINs do not match." : "PIN must be at least 4 digits.";
    $("pinError").classList.remove("hidden");
    return;
  }
  await setSetting("adminPin", a);
  $("changePinDialog").close();
  toast("Admin PIN changed.");
}

async function init(){
  db = await openDB();
  if((await getSetting("adminPin", null)) === null) await setSetting("adminPin", DEFAULT_PIN);
  $("recordDate").value = todayISO();
  updateStatus();
  await renderSummary();
  await renderOpenVisitors();
  await renderOpenOfficials();

  document.querySelectorAll("[data-open]").forEach(btn => btn.addEventListener("click", ()=>showView(btn.dataset.open)));
  document.querySelectorAll(".back-home").forEach(btn => btn.addEventListener("click", ()=>showView("homeView")));
  $("adminBtn").addEventListener("click", openAdmin);
  $("adminForm").addEventListener("submit", unlockAdmin);
  $("backFromAdmin").addEventListener("click", ()=>showView("homeView"));

  $("visitorSignInForm").addEventListener("submit", saveVisitorSignIn);
  $("visitorSearchBtn").addEventListener("click", ()=>renderOpenVisitors($("visitorSearch").value.trim()));
  $("visitorSearch").addEventListener("keydown", e=>{ if(e.key==="Enter"){e.preventDefault(); renderOpenVisitors($("visitorSearch").value.trim());}});
  $("visitorOpenTable").addEventListener("click", e=>{
    const btn = e.target.closest(".signout-visitor");
    if(btn) signOutVisitor(btn.dataset.id);
  });

  $("officialSignInForm").addEventListener("submit", saveOfficialSignIn);
  $("officialSearchBtn").addEventListener("click", ()=>renderOpenOfficials($("officialSearch").value.trim()));
  $("officialSearch").addEventListener("keydown", e=>{
    if(e.key==="Enter"){
      e.preventDefault();
      renderOpenOfficials($("officialSearch").value.trim());
    }
  });
  $("officialOpenTable").addEventListener("click", e=>{
    const btn = e.target.closest(".signout-official");
    if(btn) signOutOfficial(btn.dataset.id);
  });

  $("parentInForm").addEventListener("submit", saveParentCheckIn);
  $("parentOutForm").addEventListener("submit", saveParentCheckOut);
  $("piStudentId").addEventListener("blur", ()=>maybeFillStudent("piStudentId","piStudentName","piGrade"));
  $("poStudentId").addEventListener("blur", ()=>maybeFillStudent("poStudentId","poStudentName","poGrade"));

  $("addStudentBtn").addEventListener("click", ()=>openStudentDialog());
  $("studentForm").addEventListener("submit", saveStudentForm);
  $("rosterTable").addEventListener("click", async e=>{
    const edit = e.target.closest(".edit-student");
    const del = e.target.closest(".delete-student");
    if(edit){
      const s = await getStudent(decodeURIComponent(edit.dataset.id));
      openStudentDialog(s);
    }
    if(del){
      const id = decodeURIComponent(del.dataset.id);
      if(confirm(`Delete student ${id}?`)){ await deleteStudent(id); toast(`Deleted student ${id}`); await refreshAll(); }
    }
  });
  $("rosterImportInput").addEventListener("change", async e=>{
    const f = e.target.files[0];
    if(f){ try{ await importRoster(f);}catch(err){ alert("Import failed: " + err.message); } }
    e.target.value = "";
  });
  $("exportRosterBtn").addEventListener("click", exportRoster);

  $("refreshRecordsBtn").addEventListener("click", renderRecords);
  $("recordDate").addEventListener("change", renderRecords);
  $("recordTypeFilter").addEventListener("change", renderRecords);
  $("exportRecordsBtn").addEventListener("click", exportRecords);
  $("recordsTable").addEventListener("click", async e=>{
    const btn = e.target.closest(".delete-record");
    if(btn && confirm("Delete this record?")){ await deleteRecord(btn.dataset.id); toast("Record deleted."); await refreshAll(); }
  });

  $("downloadBackupBtn").addEventListener("click", backupAll);
  $("restoreInput").addEventListener("change", async e=>{
    const f = e.target.files[0];
    if(f){ try{ await restoreBackup(f);}catch(err){ alert("Restore failed: " + err.message); } }
    e.target.value = "";
  });
  $("changePinBtn").addEventListener("click", ()=>{
    $("newPin").value = ""; $("confirmPin").value = "";
    $("pinError").classList.add("hidden");
    $("changePinDialog").showModal();
  });
  $("changePinForm").addEventListener("submit", changePin);
  $("clearRecordsBtn").addEventListener("click", async ()=>{
    if(confirm("Delete ALL kiosk records? This cannot be undone.")){
      if(confirm("Final confirmation: delete ALL records?")){
        await clearStore("records");
        toast("All kiosk records deleted.");
        await refreshAll();
      }
    }
  });

  window.addEventListener("online", updateStatus);
  window.addEventListener("offline", updateStatus);
  if("serviceWorker" in navigator && location.protocol.startsWith("http")){
    navigator.serviceWorker.register("./service-worker.js").catch(console.error);
  }
}
document.addEventListener("DOMContentLoaded", init);
