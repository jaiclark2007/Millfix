const SUPABASE_URL = 'https://dchwwkbyyrhruvvyvmjd.supabase.co';
const SUPABASE_KEY = 'sb_publishable_r5D1x4z7VGAwj0EiRbNM0A_pgbHk9gC';

const equipment = [
  ['CM-PAY-001','Payoff Reel','Entry'],
  ['CM-S1-001','Stand 1','Cold Mill'],
  ['CM-S2-001','Stand 2','Cold Mill'],
  ['CM-S3-001','Stand 3','Cold Mill'],
  ['CM-S4-001','Stand 4','Cold Mill'],
  ['CM-S5-001','Stand 5','Cold Mill'],
  ['CM-ENT-001','Entry Section','Entry'],
  ['CM-EXT-001','Exit Section','Exit'],
  ['CM-TEN-001','Exit Tension Reel','Exit'],
  ['CM-HYD-001','Hydraulic Systems','Maintenance'],
  ['CM-DRV-001','Main Drives','Electrical'],
  ['CM-CLT-001','Coolant System','Process']
];

let sb;
let user = null;
let issues = [];
let departments = []; 
let profiles = [];
let maintenanceEmployees = [];
let currentProfile = null;
let currentView = 'home';

const app = document.getElementById('app');

function loadSupabase() {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

function statusLabel(s) {
  return (s || 'New').toUpperCase();
}

function setActive(view) {
  currentView = view;

  document.querySelectorAll('.tabs button').forEach(b => {
    b.classList.remove('primary');
    b.classList.add('secondary');
  });

  const btn = document.getElementById('tab-' + view);

  if (btn) {
    btn.classList.remove('secondary');
    btn.classList.add('primary');
  }
}
function canManageIssuesUI() {
  return currentProfile &&
    ['maintenance', 'supervisor', 'admin'].includes(currentProfile.role);
}
function shell() {
  app.innerHTML = `
    <header>
      <h1>MillFix</h1>
      <p>Cold Mill Equipment Issue Reporting</p>
    </header>

    <main class="container">
      <div class="tabs">
        <button id="tab-home" class="btn primary" onclick="home()">Home</button>
        <button id="tab-report" class="btn secondary" onclick="report()">Report Problem</button>
   <button id="tab-archive" class="btn secondary" onclick="archive()">Archive</button>    
        ${canManageIssuesUI() ? `
  <button id="tab-maintenance" class="btn secondary" onclick="queue()">Maintenance</button>
` : ''}
      ${currentProfile?.role === 'admin' ? `
  <button id="tab-admin" class="btn secondary" onclick="adminPanel()">Admin</button>
` : ''}
      </div>

      <section id="view"></section>
    </main>
  `;
}

function loginScreen(message = '') {
  app.innerHTML = `
    <header>
      <h1>MillFix</h1>
      <p>Cold Mill Equipment Issue Reporting</p>
    </header>

    <main class="container">
      <div class="card">
        <h2>Sign In</h2>
        <p>Sign in to access MillFix.</p>

        ${message ? `<p class="muted">${message}</p>` : ''}

        <div class="field">
          <label>Check Number</label>
<input
  id="loginEmail"
  type="text"
  inputmode="numeric"
  maxlength="5"
  placeholder="Enter 5-digit check number"
>
        </div>

        <div class="field">
<label>PIN</label>
<input
  id="loginPassword"
  type="password"
  inputmode="numeric"
  maxlength="6"
  placeholder="Enter 6-digit PIN"
  autocomplete="current-password"
>
</div>

        <button class="btn primary" onclick="login()">Sign In</button>
      </div>
    </main>
  `;
}

async function login() {
  const checkNumber = document
    .getElementById('loginEmail')
    .value
    .trim();

  const pin = document
    .getElementById('loginPassword')
    .value
    .trim();

  if (!/^[0-9]{5}$/.test(checkNumber)) {
    loginScreen('Enter your 5-digit check number.');
    return;
  }

  if (!/^[0-9]{6}$/.test(pin)) {
  loginScreen('Enter your 6-digit PIN.');
  return;
  }

  const { data: email, error: lookupError } = await sb.rpc(
    'get_login_email',
    { p_check_number: checkNumber }
  );

  if (lookupError || !email) {
    loginScreen('Sign in failed: invalid check number or PIN.');
    return;
  }

  const { data, error } = await sb.auth.signInWithPassword({
    email,
    password: pin
  });

  if (error) {
    loginScreen('Sign in failed: invalid check number or PIN.');
    return;
  }

  user = data.user;
  await startApp();
}

async function logout() {
  if (!canLeavePhotoReport()) return;
  await sb.auth.signOut();
  user = null;
  loginScreen();
}
async function changeMyPin() {
  const newPin = prompt('Enter your new 6-digit PIN:');

  if (newPin === null) return;

  if (!/^[0-9]{6}$/.test(newPin)) {
    alert('PIN must be exactly 6 numbers.');
    return;
  }

  const confirmPin = prompt('Enter the same 6-digit PIN again:');

  if (confirmPin !== newPin) {
    alert('PINs do not match. Nothing was changed.');
    return;
  }

  const { error } = await sb.auth.updateUser({
    password: newPin
  });

  if (error) {
    alert('PIN could not be changed: ' + error.message);
    return;
  }

  alert('PIN updated successfully.');
}
async function loadIssues() {
  const { data, error } = await sb
    .from('issues')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error(error);
    return;
  }

  issues = data || [];
}

async function loadDepartments() {
  const { data, error } = await sb
    .from('departments')
    .select('*');

  if (error) {
    console.error(error);
    departments = [];
    return;
  }

  departments = data || [];
}
async function loadProfiles() {
  const { data, error } = await sb
    .from('profiles')
    .select('id, full_name, role');

  if (error) {
    console.error(error);
    profiles = [];
    return;
  }

  profiles = data || [];
}
async function loadMaintenanceEmployees() {
  const { data, error } = await sb
    .from('maintenance_employees')
    .select('id, full_name')
    .eq('active', true)
    .order('full_name');

  if (error) {
    console.error('Could not load maintenance employees:', error);
    maintenanceEmployees = [];
    return;
  }

  maintenanceEmployees = data || [];
}
function getProfileName(id) {
  const profile = profiles.find(p => p.id === id);
  return profile ? profile.full_name : 'Unknown';
}
function issueHtml(x) {
  const repairSection =
    x.status === 'Completed' && x.repair_notes
      ? ` <div class="muted">
  <strong>Repaired by:</strong> ${getProfileName(x.repaired_by)}
</div>
        <div class="muted">
          <strong>Repair:</strong> ${x.repair_notes}
        </div>

        ${
          x.parts_used
            ? `<div class="muted"><strong>Parts:</strong> ${x.parts_used}</div>`
            : ''
        }

        ${
          x.completed_at
            ? `<div class="muted"><strong>Completed:</strong> ${new Date(x.completed_at).toLocaleString()}</div>`
            : ''
        }
      `
      : '';

  return `
    <div class="issue">
      <h3>#${x.issue_number || ''} — ${x.title || 'Equipment Issue'}</h3>

      <div>
        ${x.category || ''}
        <span class="pill">${x.priority || 'Normal'}</span>
      </div>

      <div class="muted">${x.description || ''}</div>

      <div class="muted">
  ${statusLabel(x.status)}
  ${x.assigned_name
  ? ` · Assigned to: ${x.assigned_name}`
  : ''}
</div>

<div class="muted">
  Updated ${new Date(x.updated_at || x.created_at).toLocaleString()}
</div>

      ${photoViewerHtml(x)}
      ${repairSection}
      
    <button class="btn" onclick="viewHistory('${x.id}')">
    View History
    </button>
    
    </div>
  `;
}
async function viewHistory(issueId) {
  const issue = issues.find(x => x.id === issueId);

  const { data, error } = await sb
    .from('issue_history')
    .select('*')
    .eq('issue_id', issueId)
    .order('created_at', { ascending: true });

  if (error) {
    alert('History could not be loaded: ' + error.message);
    return;
  }

  const progressResult = await sb.from('issue_progress_updates').select('*').eq('issue_id', issueId).order('created_at');
  if (progressResult.error) { alert('Progress history could not be loaded: ' + progressResult.error.message); return; }
  const history = [...(data || []), ...(progressResult.data || []).map(update => ({...update, isProgress:true}))]
    .sort((a,b) => Date.parse(a.created_at)-Date.parse(b.created_at));

  document.getElementById('view').innerHTML = `
    <div class="card">
      <h2>Issue History</h2>

      <h3>
        #${issue ? issue.issue_number : ''} —
        ${issue ? issue.title : 'Equipment Issue'}
      </h3>

      ${issue ? photoViewerHtml(issue) : ''}
      ${
        history.length
          ? history.map(h => h.isProgress ? progressUpdateHtml(h) : `
              <div class="issue">
  <strong>
    ${h.old_status !== h.new_status
      ? `${h.old_status || 'New'} → ${h.new_status}`
      : 'Assignment updated'}
  </strong>

  ${
    h.assigned_to
      ? `<div class="muted">Assigned to: ${getProfileName(h.assigned_to)}</div>`
      : h.old_assigned_to
        ? `<div class="muted">Assigned to: Unassigned</div>`
        : ''
  }

  <div class="muted">
    Changed by: ${getProfileName(h.changed_by)}
  </div>

                <div class="muted">
                  ${new Date(h.created_at).toLocaleString()}
                </div>

                ${
                  h.note
                    ? `<div class="muted">Note: ${h.note}</div>`
                    : ''
                }
              </div>
            `).join('')
          : '<p class="muted">No history recorded for this issue.</p>'
      }

      <button class="btn" onclick="home()">
        Back to Home
      </button>
    </div>
  `;
}

async function home() {
  if (!canLeavePhotoReport()) return;
  setActive('home');
  await loadIssues();

  const open = issues.filter(x =>
    !['Completed', 'Closed', 'Cancelled'].includes(x.status)
  );

  // Sort a copy so Home activity does not reorder Maintenance or Archive.
  const recentActivity = [...issues]
    .sort((a, b) => {
      const aUpdated = Date.parse(a.updated_at || a.created_at) || 0;
      const bUpdated = Date.parse(b.updated_at || b.created_at) || 0;
      return bUpdated - aUpdated ||
        (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0);
    })
    .slice(0, 5);

  document.getElementById('view').innerHTML = `
    <div class="card">
      <div class="small">Open issues</div>
      <div class="stat">${open.length}</div>
      <p>Shared MillFix equipment issues.</p>

  
    </div>

    <div class="card">
      <h2>Recent Activity</h2>
      <p class="muted">The five most recently updated issues, including new reports and completed repairs.</p>

      ${
        recentActivity.length
          ? recentActivity.map(issueHtml).join('')
          : '<p class="muted">No issues reported yet.</p>'
      }
    </div>
    
    <div class="card">
  <div class="small">Signed in as</div>
  <strong>${currentProfile?.full_name || 'Unknown User'}</strong>
  <div class="muted">
    Role: ${currentProfile?.role || 'Unknown'}
  </div>
</div>

  <div class="card" style="display:flex; flex-direction:column; gap:16px;">
  <button class="btn secondary" onclick="changeMyPin()">
    Set / Change PIN
  </button>

  <button class="btn secondary" onclick="logout()">
    Sign Out
  </button>
</div>
  `;
}
function adminPanel() {
  if (!canLeavePhotoReport()) return;
  if (currentProfile?.role !== 'admin') {
    alert('Administrator access required.');
    home();
    return;
  }

  setActive('admin');

  const resettableUsers = (profiles || []).filter(p =>
    ['employee', 'maintenance', 'supervisor'].includes(p.role)
  );

  document.getElementById('view').innerHTML = `
    <div class="card">
      <h2>Admin — Reset Employee PIN</h2>

      <p class="muted">
        Reset the 6-digit PIN for an Operator, Maintenance, or Supervisor account.
      </p>

      <div class="field">
        <label>Employee</label>

        <select id="adminResetUser">
          <option value="">Select employee...</option>

          ${resettableUsers.map(p => `
            <option value="${p.id}">
              ${p.full_name} — ${p.role}
            </option>
          `).join('')}
        </select>
      </div>

      <div class="field">
        <label>New 6-digit PIN</label>

        <input
          id="adminNewPin"
          type="password"
          inputmode="numeric"
          maxlength="6"
          placeholder="Enter new 6-digit PIN"
        >
      </div>

      <button
        class="btn primary"
        onclick="resetEmployeePin()"
      >
        Reset Employee PIN
      </button>
    </div>
  `;
}
async function resetEmployeePin() {
  if (currentProfile?.role !== 'admin') {
    alert('Administrator access required.');
    return;
  }

  const userId = document.getElementById('adminResetUser').value;
  const newPin = document.getElementById('adminNewPin').value.trim();

  if (!userId) {
    alert('Select an employee first.');
    return;
  }

  if (!/^[0-9]{6}$/.test(newPin)) {
    alert('PIN must be exactly 6 numbers.');
    return;
  }

  const { data, error } = await sb.functions.invoke('hyper-handler', {
    body: {
      user_id: userId,
      new_pin: newPin
    }
  });

  if (error) {
    alert('PIN reset failed: ' + error.message);
    return;
  }

  if (data?.error) {
    alert('PIN reset failed: ' + data.error);
    return;
  }

  alert(data?.message || 'PIN reset successfully.');

  document.getElementById('adminNewPin').value = '';
}
async function archive() {
  if (!canLeavePhotoReport()) return;
  setActive('archive');
  await loadIssues();

  document.getElementById('view').innerHTML = `
    <div class="card">
      <h2>Issue Archive</h2>

      <p class="muted">
        Search and filter previous completed, closed, and cancelled equipment issues.
      </p>

      <div class="field">
        <label>Search Archive</label>
        <input
          id="archiveSearch"
          type="text"
          placeholder="Issue #, equipment, component, category, employee..."
          oninput="renderArchiveResults()"
        >
      </div>

      <div class="field">
        <label>Equipment</label>
        <select id="archiveEquipment" onchange="renderArchiveResults()">
          <option value="">All Equipment</option>
          ${equipment.map(e =>
            `<option value="${e[1]}">${e[1]}</option>`
          ).join('')}
        </select>
      </div>

      <div class="field">
        <label>Status</label>
        <select id="archiveStatus" onchange="renderArchiveResults()">
          <option value="">All Archived Statuses</option>
          <option value="Completed">Completed</option>
          <option value="Closed">Closed</option>
          <option value="Cancelled">Cancelled</option>
        </select>
      </div>

      <div class="field">
        <label>Problem Category</label>
        <select id="archiveCategory" onchange="renderArchiveResults()">
          <option value="">All Categories</option>
          <option value="Mechanical">Mechanical</option>
          <option value="Electrical">Electrical</option>
          <option value="Hydraulic">Hydraulic</option>
          <option value="Automation / Controls">Automation / Controls</option>
          <option value="Coolant / Process">Coolant / Process</option>
          <option value="Safety">Safety</option>
        </select>
      </div>

      <div class="field">
  <label>From Date</label>

  <div style="display:flex; gap:8px; align-items:center;">
    <input
      id="archiveFromDate"
      type="text"
      inputmode="numeric"
      placeholder="MM/DD/YYYY"
      maxlength="10"
      oninput="formatArchiveDate(this); renderArchiveResults()"
      style="flex:1;"
    >

    <div style="position:relative; width:74px; flex:0 0 74px;">
  <button
    type="button"
    class="btn secondary"
    style="width:100%; height:100%; padding:12px 16px; pointer-events:none;"
  >📅</button>

  <input
    type="date"
    aria-label="Choose From Date"
    onchange="applyArchiveCalendarDate(this, 'archiveFromDate')"
    style="
      position:absolute;
      inset:0;
      width:100%;
      height:100%;
      opacity:0;
      cursor:pointer;
    "
  >
</div>
  </div>
</div>

<div class="field">
  <label>To Date</label>

  <div style="display:flex; gap:8px; align-items:stretch;">
    <input
      id="archiveToDate"
      type="text"
      inputmode="numeric"
      placeholder="MM/DD/YYYY"
      maxlength="10"
      oninput="formatArchiveDate(this); renderArchiveResults()"
      style="flex:1;"
    >

    <div style="position:relative; width:74px; flex:0 0 74px;">
      <button
        type="button"
        class="btn secondary"
        style="width:100%; height:100%; padding:12px 16px; pointer-events:none;"
      >📅</button>

      <input
        type="date"
        aria-label="Choose To Date"
        onchange="applyArchiveCalendarDate(this, 'archiveToDate')"
        style="
          position:absolute;
          inset:0;
          width:100%;
          height:100%;
          opacity:0;
          cursor:pointer;
        "
      >
    </div>
  </div>
</div>

      <div id="archiveResults"></div>
    </div>
  `;
  
  renderArchiveResults();
}

function applyArchiveCalendarDate(dateInput, targetId) {
  const target = document.getElementById(targetId);

  if (!target || !dateInput.value) return;

  const [year, month, day] = dateInput.value.split('-');

  target.value = `${month}/${day}/${year}`;

  renderArchiveResults();
}

function formatArchiveDate(input) {
  let numbers = input.value.replace(/\D/g, '').slice(0, 8);

  if (numbers.length >= 5) {
    input.value =
      numbers.slice(0, 2) + '/' +
      numbers.slice(2, 4) + '/' +
      numbers.slice(4);
  } else if (numbers.length >= 3) {
    input.value =
      numbers.slice(0, 2) + '/' +
      numbers.slice(2);
  } else {
    input.value = numbers;
  }
}
function parseArchiveDate(value, endOfDay = false) {
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);

  if (!match) return null;

  const month = Number(match[1]);
  const day = Number(match[2]);
  const year = Number(match[3]);

  return new Date(
    year,
    month - 1,
    day,
    endOfDay ? 23 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 999 : 0
  );
}
function openArchiveCalendar(targetId) {
  const target = document.getElementById(targetId);
  if (!target) return;

  const picker = document.createElement('input');
  picker.type = 'date';

  picker.style.position = 'fixed';
  picker.style.left = '-9999px';
  picker.style.top = '0';

  document.body.appendChild(picker);

  let dateApplied = false;

  function applySelectedDate() {
    if (dateApplied || !picker.value) return;

    dateApplied = true;

    const [year, month, day] = picker.value.split('-');

    target.value = `${month}/${day}/${year}`;

    renderArchiveResults();

    setTimeout(() => {
      picker.remove();
    }, 0);
  }

  picker.addEventListener('input', applySelectedDate);
  picker.addEventListener('change', applySelectedDate);

  if (typeof picker.showPicker === 'function') {
    picker.showPicker();
  } else {
    picker.click();
  }
}
function renderArchiveResults() {
  const search =
    (document.getElementById('archiveSearch')?.value || '')
      .trim()
      .toLowerCase();

  const equipmentFilter =
    document.getElementById('archiveEquipment')?.value || '';

  const statusFilter =
    document.getElementById('archiveStatus')?.value || '';

  const categoryFilter =
    document.getElementById('archiveCategory')?.value || '';

  const fromDate =
    document.getElementById('archiveFromDate')?.value || '';

  const toDate =
    document.getElementById('archiveToDate')?.value || '';

  const archived = issues
    .filter(x =>
      ['Completed', 'Closed', 'Cancelled'].includes(x.status)
    )
    .filter(x => {
      const assignedName = x.assigned_to
        ? getProfileName(x.assigned_to)
        : '';

      const searchableText =
        `${JSON.stringify(x)} ${assignedName}`.toLowerCase();

      if (search && !searchableText.includes(search)) {
        return false;
      }

      if (
        equipmentFilter &&
        !searchableText.includes(equipmentFilter.toLowerCase())
      ) {
        return false;
      }

      if (statusFilter && x.status !== statusFilter) {
        return false;
      }

      if (
        categoryFilter &&
        String(x.category || '').toLowerCase() !==
          categoryFilter.toLowerCase()
      ) {
        return false;
      }

      if (fromDate || toDate) {
        const issueDateValue =
          x.completed_at ||
          x.updated_at ||
          x.created_at;

        if (!issueDateValue) return false;

        const issueDate = new Date(issueDateValue);

        if (fromDate) {
          const startDate = parseArchiveDate(fromDate);
          if (startDate && issueDate < startDate) {
            return false;
          }
        }

        if (toDate) {
          const endDate = parseArchiveDate(toDate, true);
          if (endDate && issueDate > endDate) {
            return false;
          }
        }
      }

      return true;
    });

  const box = document.getElementById('archiveResults');

  if (!box) return;

  box.innerHTML = `
    <div class="small">
      ${archived.length} archived issue${archived.length === 1 ? '' : 's'}
    </div>

    ${
      archived.length
        ? archived.map(issueHtml).join('')
        : '<p class="muted">No archived issues found.</p>'
    }

    <button class="btn secondary" onclick="home()">
      Back to Home
    </button>
  `;
}

function canLeavePhotoReport() {
  if (photosPreparing) { alert('Please wait while the photos are prepared.'); return false; }
  if (progressSaving) { alert('Please wait for the progress update to finish.'); return false; }
  if (progressDraft) {
    if (progressDraft.started) { alert('Please retry saving this progress update before leaving.'); return false; }
    if (!confirm('Discard this unsaved progress update?')) return false;
    progressDraft = null; clearSelectedPhotos();
  }
  if (photoSubmitting) { alert('Please wait for the upload to finish.'); return false; }
  if (pendingPhotoIssue && !confirm('Your issue is saved, but some photos have not uploaded. Leave without the remaining photos?')) return false;
  return true;
}
// Photos remain private; access is checked against the related issue in Storage RLS.
let selectedIssuePhotos = [];
let pendingPhotoIssue = null;
let photoSubmitting = false;
function clearSelectedPhotos() {
  selectedIssuePhotos.forEach(photo => URL.revokeObjectURL(photo.preview));
  selectedIssuePhotos = [];
}
let photosPreparing = false;
async function optimizeIssuePhoto(file) {
  // Keep small images intact; shrink camera photos without enlarging them.
  if (file.size <= 350 * 1024) return file;
  const source = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise((resolve,reject) => { img.onload=resolve; img.onerror=reject; img.src=source; });
    const scale = Math.min(1, 2048 / Math.max(img.naturalWidth,img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1,Math.round(img.naturalWidth*scale));
    canvas.height = Math.max(1,Math.round(img.naturalHeight*scale));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle='#fff'; ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(img,0,0,canvas.width,canvas.height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve,'image/jpeg',0.85));
    canvas.width=canvas.height=1;
    return blob && blob.size < file.size ? blob : file;
  } catch(error) {
    // Unsupported decoding or low memory must not prevent a valid upload.
    return file;
  } finally { URL.revokeObjectURL(source); }
}
async function selectIssuePhotos(input) {
  if (photosPreparing || photoSubmitting || pendingPhotoIssue || progressSaving || progressDraft?.started) { input.value = ''; return; }
  const files=Array.from(input.files || []); input.value='';
  photosPreparing=true;
  const progress=document.getElementById('photoProgress');
  try {
    for (const original of files) {
      if (selectedIssuePhotos.length >= 5) { alert('You can attach up to 5 photos.'); break; }
      if (!['image/jpeg','image/png','image/webp'].includes(original.type) || original.size > 10485760 || !original.size) {
        alert('Choose a JPEG, PNG or WebP photo no larger than 10 MB.'); continue;
      }
      if(progress) progress.textContent='Preparing photo for faster upload…';
      const file=await optimizeIssuePhoto(original);
      const extension = {'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[file.type];
      selectedIssuePhotos.push({file, preview:URL.createObjectURL(file), name:crypto.randomUUID()+'.'+extension, uploaded:false});
      renderPhotoPreviews();
    }
    if(progress) progress.textContent=selectedIssuePhotos.length ? 'Photos ready to upload.' : '';
  } finally { photosPreparing=false; }
}
function renderPhotoPreviews() {
  const box = document.getElementById('photoPreviews');
  if (!box) return;
  box.replaceChildren();
  selectedIssuePhotos.forEach((photo, index) => {
    const card = document.createElement('div');
    const img = document.createElement('img');
    img.src = photo.preview; img.alt = 'Selected photo ' + (index+1);
    img.style.cssText = 'width:120px;height:100px;object-fit:cover;border-radius:8px;display:block';
    const remove = document.createElement('button');
    remove.type = 'button'; remove.className = 'btn secondary'; remove.textContent = 'Remove';
    remove.onclick = () => {
      if (photoSubmitting || pendingPhotoIssue || progressSaving || progressDraft?.started) return;
      URL.revokeObjectURL(photo.preview); selectedIssuePhotos.splice(index,1); renderPhotoPreviews();
    };
    card.append(img,remove); box.append(card);
  });
}
async function uploadSelectedPhotos(issue) {
  for (let i=0; i<selectedIssuePhotos.length; i++) {
    const photo = selectedIssuePhotos[i];
    if (photo.uploaded) continue;
    const progress = document.getElementById('photoProgress');
    if (progress) progress.textContent = 'Uploading photo ' + (i+1) + ' of ' + selectedIssuePhotos.length + '…';
    const path = user.id + '/' + issue.id + '/' + photo.name;
    const {error} = await sb.storage.from('issue-photos').upload(path, photo.file, {contentType:photo.file.type, upsert:false});
    if (error) {
      // A lost response can occur after a successful upload. Confirm before retrying.
      const check = await sb.storage.from('issue-photos').list(user.id + '/' + issue.id, {search:photo.name,limit:10});
      if (check.error || !(check.data || []).some(item => item.name === photo.name)) throw error;
    }
    photo.uploaded = true;
  }
}
function showPhotoIssueSuccess(issue) {
  const count = selectedIssuePhotos.length;
  clearSelectedPhotos(); pendingPhotoIssue = null;
  document.getElementById('view').innerHTML = `<div class="card"><div class="notice"><strong>Issue submitted.</strong><br>MillFix issue #${Number(issue.issue_number)} was saved with ${count} photo${count===1?'':'s'}.</div><button class="btn primary" onclick="home()">Back to Home</button></div>`;
}
function photoViewerHtml(issue) {
  return `<button type="button" class="btn secondary" onclick="viewIssuePhotos('${issue.id}',this)">View Photos</button><div class="issue-photos" style="display:flex;flex-wrap:wrap;gap:12px" aria-live="polite"></div>`;
}
async function appendPhotoBatch(box,bucket,paths) {
  if(!paths.length) return;
  const {data,error}=await sb.storage.from(bucket).createSignedUrls(paths,600);
  if(error) throw error;
  for(const photo of data || []) {
    if(photo.error || !photo.signedUrl) {
      const errorText=document.createElement('p'); errorText.textContent='A photo could not be loaded. Tap View Photos to retry.'; box.append(errorText); continue;
    }
    const link=document.createElement('a'); link.href=photo.signedUrl; link.target='_blank'; link.rel='noopener noreferrer';
    const img=document.createElement('img'); img.alt='Issue photo — tap to enlarge'; img.loading='eager'; img.decoding='async';
    img.style.cssText='width:140px;height:120px;object-fit:cover;border-radius:8px;background:#e9eef6';
    img.onerror=()=>{ img.alt='Photo could not load. Tap to retry opening it.'; };
    img.src=photo.signedUrl; link.append(img); box.append(link);
  }
}

async function viewIssuePhotos(issueId, button) {
  const box = button.nextElementSibling;
  button.disabled = true; box.textContent = 'Loading photos…';
  try {
    const issue = issues.find(item => item.id === issueId);
    if (!issue) throw new Error('Refresh the issue and try again.');
    const folder = issue.reported_by + '/' + issue.id;
    const listing = await sb.storage.from('issue-photos').list(folder, {limit:100,sortBy:{column:'created_at',order:'asc'}});
    if (listing.error) throw listing.error;
    box.replaceChildren();
    const photos = (listing.data || []).filter(item => item.id);
    if (!photos.length) box.textContent = 'No original report photos attached.';
    await appendPhotoBatch(box,'issue-photos',photos.map(photo=>folder+'/'+photo.name));
    const updates = await sb.from('issue_progress_updates').select('*').eq('issue_id',issueId).order('created_at');
    if (updates.error) throw updates.error;
    for (const update of updates.data || []) {
      const card = document.createElement('div'); card.style.width = '100%';
      card.innerHTML = progressUpdateHtml(update); box.append(card);
    }
  } catch(error) { box.textContent = 'Photos could not be loaded. '+error.message; }
  finally { button.disabled = false; }
}
window.addEventListener('beforeunload', event => {
  if (photosPreparing || photoSubmitting || pendingPhotoIssue || progressSaving || progressDraft?.started) { event.preventDefault(); event.returnValue = ''; }
});


let progressDraft = null;
let progressSaving = false;
function escapeProgress(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function progressUpdateHtml(update) {
  return `<div class="issue"><strong>Progress update</strong>
    <div class="muted">${escapeProgress(getProfileName(update.author_id))} · ${new Date(update.created_at).toLocaleString()}</div>
    <p style="white-space:pre-wrap">${escapeProgress(update.note)}</p>
    ${update.photo_names.length ? `<button type="button" class="btn secondary" onclick="viewProgressPhotos('${update.id}',this)">View Progress Photos (${update.photo_names.length})</button><div style="display:flex;flex-wrap:wrap;gap:12px;margin-top:12px" aria-live="polite"></div>` : ''}
  </div>`;
}
async function viewProgressPhotos(updateId, button) {
  const box = button.nextElementSibling;
  button.disabled = true; box.textContent = 'Loading photos…';
  try {
    const {data:update,error} = await sb.from('issue_progress_updates').select('*').eq('id',updateId).single();
    if(error) throw error;
    box.replaceChildren();
    await appendPhotoBatch(box,'issue-progress-photos',update.photo_names.map(name=>`${update.issue_id}/${update.author_id}/${update.id}/${name}`));
  } catch(error) { box.textContent='Photos could not be loaded. '+error.message; }
  finally { button.disabled=false; }
}
function showProgressForm(issueId) {
  if(!canManageIssuesUI() || !canLeavePhotoReport()) return;
  const issue=issues.find(x=>x.id===issueId);
  if(!issue) return;
  clearSelectedPhotos(); pendingPhotoIssue=null;
  progressDraft={id:crypto.randomUUID(),issueId,started:false,note:''};
  document.getElementById('view').innerHTML=`<div class="card">
    <h2>Add Progress Update</h2><p>#${Number(issue.issue_number)} — ${escapeProgress(issue.title)}</p>
    <div class="field"><label for="progressNote">Work / progress notes</label>
      <textarea id="progressNote" maxlength="4000" placeholder="What was inspected, repaired, or found? What happens next?"></textarea></div>
    <div class="field"><label>Photos (optional)</label><p class="muted">Up to 5 photos, 10 MB each. JPEG, PNG or WebP.</p>
      <button type="button" class="btn secondary" onclick="document.getElementById('photoCamera').click()">Take Photo</button>
      <button type="button" class="btn secondary" onclick="document.getElementById('photoGallery').click()">Choose from Gallery</button>
      <input id="photoCamera" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" hidden onchange="selectIssuePhotos(this)">
      <input id="photoGallery" type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onchange="selectIssuePhotos(this)">
      <div id="photoPreviews" style="display:flex;flex-wrap:wrap;gap:12px;margin-top:12px"></div></div>
    <p id="photoProgress" role="status" aria-live="polite"></p>
    <button id="saveProgressButton" type="button" class="btn primary" onclick="saveProgressUpdate()">Save Progress Update</button>
    <button type="button" class="btn secondary" style="margin-top:16px" onclick="queue()">Back to Maintenance</button>
    </div>`;
}
async function saveProgressUpdate() {
  if (photosPreparing) { alert('Please wait while the photos are prepared.'); return; }
  if(progressSaving || !progressDraft || !canManageIssuesUI()) return;
  const draft=progressDraft;
  if(!draft.started) {
    draft.note=document.getElementById('progressNote').value.trim();
    if(!draft.note) { alert('Add a short note explaining the progress.'); return; }
    draft.started=true;
  }
  progressSaving=true;
  const button=document.getElementById('saveProgressButton'); button.disabled=true;
  document.getElementById('progressNote').disabled=true;
  const message=document.getElementById('photoProgress');
  try {
    const folder=`${draft.issueId}/${user.id}/${draft.id}`;
    for(let i=0;i<selectedIssuePhotos.length;i++) {
      const photo=selectedIssuePhotos[i]; if(photo.uploaded) continue;
      message.textContent=`Uploading photo ${i+1} of ${selectedIssuePhotos.length}…`;
      const result=await sb.storage.from('issue-progress-photos').upload(folder+'/'+photo.name,photo.file,{contentType:photo.file.type,upsert:false});
      if(result.error) {
        const check=await sb.storage.from('issue-progress-photos').list(folder,{search:photo.name,limit:10});
        if(check.error || !(check.data||[]).some(x=>x.name===photo.name)) throw result.error;
      }
      photo.uploaded=true;
    }
    message.textContent='Saving progress update…';
    const result=await sb.from('issue_progress_updates').insert({id:draft.id,issue_id:draft.issueId,note:draft.note,photo_names:selectedIssuePhotos.map(x=>x.name)});
    if(result.error) {
      const check=await sb.from('issue_progress_updates').select('id').eq('id',draft.id).maybeSingle();
      if(check.error || !check.data) throw result.error;
    }
    progressDraft=null; clearSelectedPhotos(); progressSaving=false;
    await loadIssues(); await viewHistory(draft.issueId);
  } catch(error) {
    message.textContent='Update not confirmed. Keep this page open and tap Retry Save. '+error.message;
    button.textContent='Retry Save';
  } finally { progressSaving=false; button.disabled=false; }
}

async function report() {
  if (!canLeavePhotoReport()) return;
  if (photoSubmitting) return;
  clearSelectedPhotos();
  pendingPhotoIssue = null;
  setActive('report');

  document.getElementById('view').innerHTML = `
    <div class="card">
      <h2>Report a Problem</h2>

      <div class="field">
        <label>Equipment</label>
        <select id="eq"
       
       onchange="loadComponentSuggestions()">
          ${equipment.map(e =>
            `<option value="${e[1]}">${e[1]} — ${e[2]}</option>`
          ).join('')}
        </select>
      </div>

      <div class="field">
  <label>Component / Part</label>
<input
  id="component"
  type="text"
  placeholder="Example: Work Roll Bearing, Mandrel, Motor"
  autocomplete="off"
  oninput="showComponentSuggestions()"
/>

<div id="componentSuggestions"></div>
</div>

      <div class="field">
        <label>Priority</label>

        <select id="priority">
          <option>Low</option>
          <option selected>Normal</option>
          <option>High</option>
          <option>Critical</option>
        </select>
      </div>

      <div class="field">
        <label>Problem category</label>

        <select id="category">
          <option>Mechanical</option>
          <option>Electrical</option>
          <option>Hydraulic</option>
          <option>Automation / Controls</option>
          <option>Coolant / Process</option>
          <option>Safety</option>
          <option>Other</option>
        </select>
      </div>

      <div class="field">
        <label>Title</label>
        <input id="title" placeholder="Short description">
      </div>

      <div class="field">
        <label>Details</label>

        <textarea
          id="desc"
          placeholder="Describe what is happening, when it happens, and anything you've observed."
        ></textarea>
      </div>

      <div class="field">
        <label>Photos (optional)</label>
        <p class="muted">Up to 5 photos, 10 MB each. JPEG, PNG or WebP.</p>
        <button type="button" class="btn secondary" onclick="document.getElementById('photoCamera').click()">Take Photo</button>
        <button type="button" class="btn secondary" onclick="document.getElementById('photoGallery').click()">Choose from Gallery</button>
        <input id="photoCamera" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" hidden onchange="selectIssuePhotos(this)">
        <input id="photoGallery" type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onchange="selectIssuePhotos(this)">
        <div id="photoPreviews" style="display:flex;flex-wrap:wrap;gap:12px"></div>
        <p id="photoProgress" role="status" aria-live="polite"></p>
      </div>
      <button id="submitIssueButton" class="btn primary" onclick="submitIssue()">
        Submit Issue
      </button>
    </div>
  `;

 await loadComponentSuggestions();
}
let learnedComponents = [];

async function loadComponentSuggestions() {
  const equipmentName = document.getElementById('eq').value;
  const box = document.getElementById('componentSuggestions');

  learnedComponents = [];
  box.innerHTML = '';

  const { data: equipmentRecord, error: equipmentError } = await sb
    .from('equipment')
    .select('id')
    .eq('name', equipmentName)
    .single();

  if (equipmentError || !equipmentRecord) return;

  const { data: components, error } = await sb
    .from('equipment_components')
    .select('component_name')
    .eq('equipment_id', equipmentRecord.id)
    .order('component_name');

  if (error || !components) return;

  learnedComponents = components.map(c => c.component_name);
}

function normalizeComponentSearch(value) {
  return (value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function showComponentSuggestions() {
  const input = document.getElementById('component');
  const box = document.getElementById('componentSuggestions');

  if (!input || !box) return;

  const typed = normalizeComponentSearch(input.value);

  box.innerHTML = '';

  if (!typed) return;

  const matches = learnedComponents
    .filter(name =>
      normalizeComponentSearch(name).includes(typed)
    )
    .slice(0, 8);

  matches.forEach(name => {
    const item = document.createElement('div');

    item.textContent = name;
    item.style.padding = '12px';
    item.style.cursor = 'pointer';
    item.style.border = '1px solid #ccc';
    item.style.borderRadius = '8px';
    item.style.marginTop = '6px';
    item.style.background = 'white';

    item.onclick = () => {
      input.value = name;
      box.innerHTML = '';
    };

    box.appendChild(item);
  });
}

async function submitIssue() {
  if (photosPreparing) { alert('Please wait while the photos are prepared.'); return; }
  if (photoSubmitting) return;
  photoSubmitting = true;
  const submitButton = document.getElementById('submitIssueButton');
  if (submitButton) submitButton.disabled = true;
  try { await submitIssueWithPhotos(); }
  catch (error) {
    const message = pendingPhotoIssue
      ? 'Issue #' + pendingPhotoIssue.issue_number + ' is saved, but some photos could not upload. Keep this page open and tap Retry Photos. ' + error.message
      : 'Issue could not be submitted. ' + error.message;
    const progress = document.getElementById('photoProgress');
    if (progress) progress.textContent = message;
  } finally {
    photoSubmitting = false;
    if (submitButton && submitButton.isConnected) {
      submitButton.disabled = false;
      submitButton.textContent = pendingPhotoIssue ? 'Retry Photos' : 'Submit Issue';
    }
  }
}
async function submitIssueWithPhotos() {
  if (pendingPhotoIssue) {
    await uploadSelectedPhotos(pendingPhotoIssue);
    showPhotoIssueSuccess(pendingPhotoIssue);
    return;
  }
  const equipmentName = document.getElementById('eq').value;
  const componentName = document.getElementById('component').value.trim();
  const priority = document.getElementById('priority').value;
  const category = document.getElementById('category').value;
  const enteredTitle = document.getElementById('title').value.trim();
  const description = document.getElementById('desc').value.trim();

  if (!enteredTitle) {
    alert('Please enter a short problem title.');
    return;
  }

  const coldMill = departments.find(d => d.name === 'Cold Mill');
const { data: equipmentRecord, error: equipmentError } = await sb
  .from('equipment')
  .select('id')
  .eq('name', equipmentName)
  .eq('active', true)
  .maybeSingle();

if (equipmentError || !equipmentRecord) {
  alert('Equipment could not be found in the MillFix database.');
  return;
}
  const { data, error } = await sb
    .from('issues')
    .insert({
      reported_by: user.id,
      equipment_id: equipmentRecord.id,
      component_name: componentName,
      department_id: coldMill ? coldMill.id : null,
      category,
      priority,
      title: `${equipmentName} — ${enteredTitle}`,
      description,
      status: 'New'
    })
    .select()
    .single();

  if (error) {
    alert('Issue could not be submitted: ' + error.message);
    return;
  }
// Learn new component/part for this equipment
if (componentName) {
  const alreadyKnown = learnedComponents.some(
    name => name.toLowerCase() === componentName.toLowerCase()
  );

  if (!alreadyKnown) {
    const { error: learnError } = await sb
      .from('equipment_components')
      .insert({
        equipment_id: equipmentRecord.id,
        component_name: componentName
      });

    if (!learnError) {
      learnedComponents.push(componentName);
    }
  }
}  
  pendingPhotoIssue = data;
  document.querySelectorAll('#view input, #view select, #view textarea').forEach(el => el.disabled = true);
  await uploadSelectedPhotos(data);
  showPhotoIssueSuccess(data);
}

async function queue() {
  if (!canLeavePhotoReport()) return;
  setActive('maintenance');
  await loadIssues();
await loadMaintenanceEmployees();
  const { data: profiles, error: profilesError } = await sb
  .from('profiles')
  .select('id, full_name, role, department_id')
  .order('full_name');

if (profilesError) {
  console.error('Could not load profiles:', profilesError);
}

  
  const active = issues.filter(x =>
    !['Completed', 'Closed', 'Cancelled'].includes(x.status)
  );

  document.getElementById('view').innerHTML = `
    <div class="card">
      <h2>Maintenance Queue</h2>

      ${
        active.length
          ? active.map(x => `
            <div class="issue">
              <h3>#${x.issue_number} — ${x.title}</h3>

              <div>
                ${x.category}
                <span class="pill">${x.priority}</span>
              </div>

              <div class="muted">
                ${x.description || ''}
              </div>

              ${photoViewerHtml(x)}
              ${canManageIssuesUI() ? `<button type="button" class="btn primary" style="margin-top:16px" onclick="showProgressForm('${x.id}')">Add Progress Update</button>` : ''}
              <button type="button" class="btn secondary" style="margin-top:16px" onclick="viewHistory('${x.id}')">View History</button>
              <div class="field">
                <label>Status</label>

                <select
                  id="status-${x.id}"
                  onchange="setStatus('${x.id}', this.value)"
                >
                  ${[
                    'New',
                    'Assigned',
                    'In Progress',
                    'Waiting for Parts',
                    'Waiting for Vendor',
                    'Completed',
                    'Closed',
                    'Cancelled'
                  ].map(s =>
                    `<option ${x.status === s ? 'selected' : ''}>${s}</option>`
                  ).join('')}
                </select>
              </div>
             
              <div class="field">
  <label>Assigned To</label>

  <input
  type="text"
  id="assigned-${x.id}"
  placeholder="Start typing a name..."
  value="${x.assigned_name || ''}"
  autocomplete="off"
  oninput="showMaintenanceMatches('${x.id}', this.value)"
  onchange="assignIssueByName('${x.id}', this.value)"
>

  <div
    id="matches-${x.id}"
    class="maintenance-matches"
  ></div>
</div>
            </div>
          `).join('')
          : '<p class="muted">No active maintenance issues.</p>'
      }
    </div>
  `;
}

async function setStatus(id, status) {
  const issue = issues.find(x => x.id === id);

  if (!issue) {
    alert('MillFix could not find this issue.');
    await queue();
    return;
  }

  if (status === 'Completed') {
    showRepairForm(issue);
    return;
  }

  const { error } = await sb
    .from('issues')
    .update({
      status,
      updated_at: new Date().toISOString()
    })
    .eq('id', id);

  if (error) {
    alert('Status could not be updated: ' + error.message);
    await queue();
    return;
  }

  await queue();
}

function showRepairForm(issue) {
  document.getElementById('view').innerHTML = `
    <div class="card">
      <h2>Complete Repair</h2>

      <div class="notice">
        <strong>Issue #${issue.issue_number}</strong><br>
        ${issue.title}
      </div>

      <div class="field">
        <label>Repair / work performed</label>

        <textarea
          id="repairNotes"
          placeholder="Describe what was repaired, adjusted, replaced, cleaned, reset, tested, etc."
        ></textarea>
      </div>

      <div class="field">
        <label>Parts used</label>

        <textarea
          id="partsUsed"
          placeholder="Enter parts used, or leave blank if none."
        ></textarea>
      </div>

      <button
        class="btn primary"
        onclick="completeRepair('${issue.id}')"
      >
        Complete Repair
      </button>

      <button
        class="btn secondary"
        onclick="queue()"
      >
        Cancel
      </button>
    </div>
  `;
}
function showMaintenanceMatches(id, searchText) {
  const box = document.getElementById(`matches-${id}`);
  if (!box) return;

  const search = searchText.trim().toLowerCase();

  if (!search) {
    box.innerHTML = '';
    return;
  }

  const matches = (maintenanceEmployees || [])
    .filter(p =>
      (p.full_name || '').toLowerCase().includes(search)
    )
    .slice(0, 8);

  if (!matches.length) {
    box.innerHTML = '';
    return;
  }

  box.innerHTML = matches.map(p => `
    <button
      type="button"
      class="maintenance-match"
      onclick="selectMaintenanceMatch('${id}', '${p.id}')"
    >
      ${p.full_name || 'Unnamed'}
    </button>
  `).join('');
}

function selectMaintenanceMatch(id, profileId) {
  const profile = (maintenanceEmployees || []).find(p => String(p.id) === String(profileId));
  if (!profile) return;

  const input = document.getElementById(`assigned-${id}`);
  const box = document.getElementById(`matches-${id}`);

  if (input) input.value = profile.full_name || '';
  if (box) box.innerHTML = '';

  assignIssueByName(id, profile.full_name);
}

async function assignIssueByName(id, name) {
  const cleanName = name.trim();

  if (!cleanName) {
    const { error } = await sb
      .from('issues')
      .update({
        assigned_to: null,
        assigned_name: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', id);

    if (error) {
      alert('Assignment could not be cleared: ' + error.message);
      return;
    }

    await queue();
    return;
  }

  const { error } = await sb
    .from('issues')
    .update({
      assigned_to: null,
      assigned_name: cleanName,
      updated_at: new Date().toISOString()
    })
    .eq('id', id);

  if (error) {
    alert('Assignment could not be updated: ' + error.message);
    return;
  }

  const alreadyKnown = (maintenanceEmployees || []).some(
    employee =>
      (employee.full_name || '').trim().toLowerCase() ===
      cleanName.toLowerCase()
  );

  if (!alreadyKnown) {
    const { error: learnError } = await sb
      .from('maintenance_employees')
      .insert({
        full_name: cleanName
      });

    if (learnError) {
      console.error(
        'Maintenance employee name could not be learned:',
        learnError
      );
    }
  }

  await queue();
}
async function completeRepair(id) {
  const repairNotes =
    document.getElementById('repairNotes').value.trim();

  const partsUsed =
    document.getElementById('partsUsed').value.trim();

  if (!repairNotes) {
    alert('Please describe the repair or work performed.');
    return;
  }

  const completedTime = new Date().toISOString();

  const { error } = await sb
    .from('issues')
    .update({
      status: 'Completed',
      repaired_by: user.id,
      repair_notes: repairNotes,
      parts_used: partsUsed || null,
      completed_at: completedTime,
      updated_at: completedTime
    })
    .eq('id', id);

  if (error) {
    alert('Repair could not be completed: ' + error.message);
    return;
  }

  alert('Repair completed and recorded.');

  await home();
}

async function startApp() {
  await loadDepartments();
  await loadProfiles();

  currentProfile = profiles.find(p => p.id === user.id) || null;

  console.log('MillFix logged-in profile:', currentProfile);

  shell();
  await home();
}

async function init() {
  try {
    await loadSupabase();

    sb = window.supabase.createClient(
      SUPABASE_URL,
      SUPABASE_KEY
    );

    const { data } = await sb.auth.getSession();

    if (data.session) {
      user = data.session.user;
      await startApp();
    } else {
      loginScreen();
    }
  } catch (e) {
    app.innerHTML = `
      <div class="card">
        <h2>MillFix connection error</h2>
        <p>${e.message}</p>
      </div>
    `;
  }
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () =>
    navigator.serviceWorker
      .register('sw.js')
      .catch(() => {})
  );
}

window.login = login;
window.logout = logout;
window.changeMyPin = changeMyPin;
window.adminPanel = adminPanel;
window.resetEmployeePin = resetEmployeePin;
window.home = home;
window.report = report;
window.queue = queue;
window.submitIssue = submitIssue;
window.setStatus = setStatus;
window.showRepairForm = showRepairForm;
window.completeRepair = completeRepair;

init();



