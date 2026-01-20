// ===== Storage keys
const K_STUDENTS = "att_students_v1";
const K_ATT = "att_records_v1"; // { "YYYY-MM-DD|GROUP": { studentId: "present/late/excused/absent" } }

const $ = (id) => document.getElementById(id);

// ===== State
let students = loadStudents();
let records = loadRecords();

// ===== Tabs
document.querySelectorAll(".tab").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");

    document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));
    const tab = btn.dataset.tab;
    $(`tab-${tab}`).classList.add("active");

    // refresh views on tab switch
    if (tab === "students") renderStudents();
    if (tab === "attendance") refreshAttendanceSelectors();
    if (tab === "reports") { renderStats(); renderHistory(); }
  });
});

// ===== Students form
$("studentForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const fullName = $("fullName").value.trim();
  const group = $("groupName").value.trim();
  const sid = $("studentId").value.trim();

  const id = cryptoId();
  students.push({ id, fullName, group, sid });
  saveStudents(students);

  $("fullName").value = "";
  $("groupName").value = "";
  $("studentId").value = "";

  renderStudents();
  refreshAttendanceSelectors();
  renderStats();
});

// ===== Filters
$("searchInput").addEventListener("input", renderStudents);
$("groupFilter").addEventListener("change", renderStudents);

// ===== Attendance controls
$("loadAttendance").addEventListener("click", () => {
  const date = $("lessonDate").value;
  const group = $("lessonGroup").value;
  if (!date || !group) {
    $("attendanceArea").innerHTML = `<p class="muted">Алдымен күн мен топты таңда.</p>`;
    return;
  }
  renderAttendanceSheet(date, group);
});

// ===== Reports filters
$("historySearch").addEventListener("input", renderHistory);
$("historyDate").addEventListener("change", renderHistory);

// ===== Export CSV
$("exportCsv").addEventListener("click", exportCSV);

// ===== Wipe
$("wipeAll").addEventListener("click", () => {
  const ok = confirm("Барлық деректі өшіреміз бе? (студенттер + қатысу)");
  if (!ok) return;
  localStorage.removeItem(K_STUDENTS);
  localStorage.removeItem(K_ATT);
  students = [];
  records = {};
  renderStudents();
  refreshAttendanceSelectors();
  renderStats();
  renderHistory();
  $("attendanceArea").innerHTML = `<p class="muted">Дерек жоқ. Алдымен студент қос.</p>`;
});

// ===== Init
initDefaults();
renderStudents();
refreshAttendanceSelectors();
renderStats();
renderHistory();

// ===== Functions
function initDefaults(){
  // default date = today
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth()+1).padStart(2,"0");
  const dd = String(today.getDate()).padStart(2,"0");
  $("lessonDate").value = `${yyyy}-${mm}-${dd}`;
}

function renderStudents(){
  const q = $("searchInput").value.trim().toLowerCase();
  const g = $("groupFilter").value;

  // build group filter options
  const groups = uniq(students.map(s => s.group)).sort();
  const gf = $("groupFilter");
  const current = gf.value;
  gf.innerHTML = `<option value="">Барлық топ</option>` + groups.map(x => `<option value="${esc(x)}">${esc(x)}</option>`).join("");
  if (groups.includes(current)) gf.value = current;

  const list = students
    .filter(s => !g || s.group === g)
    .filter(s => !q || (s.fullName.toLowerCase().includes(q) || s.group.toLowerCase().includes(q) || (s.sid||"").toLowerCase().includes(q)));

  const tbody = $("studentsTable").querySelector("tbody");
  tbody.innerHTML = "";

  list.forEach((s, i) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${i+1}</td>
      <td>${esc(s.fullName)}</td>
      <td>${esc(s.group)}</td>
      <td>${esc(s.sid || "")}</td>
      <td>
        <button class="btn" data-act="edit" data-id="${s.id}">Өзгерту</button>
        <button class="btn danger" data-act="del" data-id="${s.id}">Өшіру</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll("button").forEach(b => {
    b.addEventListener("click", () => {
      const id = b.dataset.id;
      const act = b.dataset.act;
      if (act === "del") deleteStudent(id);
      if (act === "edit") editStudent(id);
    });
  });

  $("studentsCount").textContent = `Барлығы: ${students.length} студент. Көрсетіліп тұр: ${list.length}`;
}

function deleteStudent(id){
  const s = students.find(x => x.id === id);
  if (!s) return;
  const ok = confirm(`Өшіреміз бе: ${s.fullName} (${s.group})?`);
  if (!ok) return;

  students = students.filter(x => x.id !== id);
  saveStudents(students);

  // remove from attendance records
  Object.keys(records).forEach(key => {
    if (records[key] && records[key][id]) delete records[key][id];
  });
  saveRecords(records);

  renderStudents();
  refreshAttendanceSelectors();
  renderStats();
  renderHistory();
}

function editStudent(id){
  const s = students.find(x => x.id === id);
  if (!s) return;

  const fullName = prompt("Аты-жөні:", s.fullName);
  if (fullName === null) return;
  const group = prompt("Тобы:", s.group);
  if (group === null) return;
  const sid = prompt("ID/Телефон:", s.sid || "");
  if (sid === null) return;

  s.fullName = fullName.trim() || s.fullName;
  s.group = group.trim() || s.group;
  s.sid = sid.trim();

  saveStudents(students);
  renderStudents();
  refreshAttendanceSelectors();
  renderStats();
  renderHistory();
}

function refreshAttendanceSelectors(){
  const groups = uniq(students.map(s => s.group)).sort();
  const sel = $("lessonGroup");
  const cur = sel.value;
  sel.innerHTML = `<option value="">Топ таңда</option>` + groups.map(g => `<option value="${esc(g)}">${esc(g)}</option>`).join("");
  if (groups.includes(cur)) sel.value = cur;

  if (students.length === 0) {
    $("attendanceArea").innerHTML = `<p class="muted">Дерек жоқ. Алдымен студент қос.</p>`;
  }
}

function renderAttendanceSheet(date, group){
  const key = `${date}|${group}`;
  const groupStudents = students.filter(s => s.group === group);

  if (groupStudents.length === 0) {
    $("attendanceArea").innerHTML = `<p class="muted">Бұл топта студент жоқ.</p>`;
    return;
  }

  if (!records[key]) records[key] = {};
  const rec = records[key];

  const rows = groupStudents.map((s, i) => {
    const val = rec[s.id] || "present";
    return `
      <tr>
        <td>${i+1}</td>
        <td>${esc(s.fullName)}</td>
        <td>${esc(s.sid || "")}</td>
        <td>
          <select class="mini statusSel" data-id="${s.id}">
            <option value="present" ${val==="present"?"selected":""}>Қатысты</option>
            <option value="late" ${val==="late"?"selected":""}>Кешікті</option>
            <option value="excused" ${val==="excused"?"selected":""}>Себепті</option>
            <option value="absent" ${val==="absent"?"selected":""}>Қатыспады</option>
          </select>
        </td>
        <td><span class="badge ${badgeClass(val)}">${statusLabel(val)}</span></td>
      </tr>
    `;
  }).join("");

  $("attendanceArea").innerHTML = `
    <div class="row" style="gap:10px; display:flex; flex-wrap:wrap; align-items:center; margin-bottom:10px">
      <span class="badge">Күні: ${esc(date)}</span>
      <span class="badge">Топ: ${esc(group)}</span>
      <button class="btn primary" id="saveAttendanceBtn">Сақтау</button>
      <button class="btn" id="markAllPresent">Бәрі қатысты</button>
      <button class="btn" id="markAllAbsent">Бәрі қатыспады</button>
    </div>

    <div class="tableWrap">
      <table class="table" style="min-width: 760px">
        <thead>
          <tr>
            <th>#</th><th>Студент</th><th>ID/Тел</th><th>Статус</th><th>Көрсету</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>

    <div class="footerNote" id="attSavedNote"></div>
  `;

  // live badge update
  document.querySelectorAll(".statusSel").forEach(sel => {
    sel.addEventListener("change", () => {
      const id = sel.dataset.id;
      rec[id] = sel.value;
      const badge = sel.parentElement.nextElementSibling.querySelector(".badge");
      badge.className = `badge ${badgeClass(sel.value)}`;
      badge.textContent = statusLabel(sel.value);
    });
  });

  $("markAllPresent").addEventListener("click", () => {
    document.querySelectorAll(".statusSel").forEach(sel => { sel.value = "present"; sel.dispatchEvent(new Event("change")); });
  });
  $("markAllAbsent").addEventListener("click", () => {
    document.querySelectorAll(".statusSel").forEach(sel => { sel.value = "absent"; sel.dispatchEvent(new Event("change")); });
  });

  $("saveAttendanceBtn").addEventListener("click", () => {
    saveRecords(records);
    $("attSavedNote").textContent = "✅ Сақталды!";
    renderStats();
    renderHistory();
  });
}

function renderStats(){
  const totalStudents = students.length;

  // compute totals from records
  let totalMarks = 0;
  let present = 0, late = 0, excused = 0, absent = 0;

  Object.values(records).forEach(dayRec => {
    if (!dayRec) return;
    Object.values(dayRec).forEach(v => {
      totalMarks++;
      if (v === "present") present++;
      else if (v === "late") late++;
      else if (v === "excused") excused++;
      else if (v === "absent") absent++;
    });
  });

  const rate = totalMarks ? Math.round(((present+late+excused) / totalMarks) * 100) : 0;

  $("statsBox").innerHTML = `
    <div class="stat"><div class="k">Студент саны</div><div class="v">${totalStudents}</div></div>
    <div class="stat"><div class="k">Белгіленген жазба</div><div class="v">${totalMarks}</div></div>
    <div class="stat"><div class="k">Қатысу пайызы (жалпы)</div><div class="v">${rate}%</div></div>
    <div class="stat"><div class="k">Қатыспады</div><div class="v">${absent}</div></div>
    <div class="stat"><div class="k">Кешікті</div><div class="v">${late}</div></div>
    <div class="stat"><div class="k">Себепті</div><div class="v">${excused}</div></div>
  `;
}

function renderHistory(){
  const q = $("historySearch").value.trim().toLowerCase();
  const d = $("historyDate").value;

  const items = [];
  Object.entries(records).forEach(([key, map]) => {
    const [date, group] = key.split("|");
    if (d && date !== d) return;

    Object.entries(map || {}).forEach(([sid, status]) => {
      const st = students.find(s => s.id === sid);
      const name = st ? st.fullName : "(өшірулі студент)";
      const group2 = st ? st.group : group;

      if (q && !name.toLowerCase().includes(q)) return;

      items.push({ date, group: group2, name, status });
    });
  });

  items.sort((a,b) => (a.date < b.date ? 1 : -1));

  const tbody = $("historyTable").querySelector("tbody");
  tbody.innerHTML = items.map(it => `
    <tr>
      <td>${esc(it.date)}</td>
      <td>${esc(it.group)}</td>
      <td>${esc(it.name)}</td>
      <td><span class="badge ${badgeClass(it.status)}">${statusLabel(it.status)}</span></td>
    </tr>
  `).join("");

  $("historyCount").textContent = `Жазба саны: ${items.length}`;
}

function exportCSV(){
  // CSV rows: date, group, student, sid, status
  const rows = [["date","group","student","sid","status"]];
  Object.entries(records).forEach(([key, map]) => {
    const [date, group] = key.split("|");
    Object.entries(map || {}).forEach(([id, status]) => {
      const st = students.find(s => s.id === id);
      rows.push([
        date,
        st ? st.group : group,
        st ? st.fullName : "",
        st ? (st.sid||"") : "",
        statusLabel(status)
      ]);
    });
  });

  const csv = rows.map(r => r.map(cell => `"${String(cell).replaceAll('"','""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "attendance_export.csv";
  a.click();
  URL.revokeObjectURL(url);
}

// ===== Helpers
function loadStudents(){
  try { return JSON.parse(localStorage.getItem(K_STUDENTS)) || []; }
  catch { return []; }
}
function saveStudents(arr){
  localStorage.setItem(K_STUDENTS, JSON.stringify(arr));
}
function loadRecords(){
  try { return JSON.parse(localStorage.getItem(K_ATT)) || {}; }
  catch { return {}; }
}
function saveRecords(obj){
  localStorage.setItem(K_ATT, JSON.stringify(obj));
}
function uniq(arr){ return [...new Set(arr.filter(Boolean))]; }
function esc(s){ return String(s).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;"); }
function cryptoId(){
  // simple unique id
  return "s_" + Math.random().toString(16).slice(2) + Date.now().toString(16);
}
function statusLabel(v){
  if (v === "present") return "Қатысты";
  if (v === "late") return "Кешікті";
  if (v === "excused") return "Себепті";
  return "Қатыспады";
}
function badgeClass(v){
  if (v === "present") return "ok";
  if (v === "late") return "late";
  if (v === "excused") return "exc";
  return "abs";
}
