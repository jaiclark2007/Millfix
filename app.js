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
        <button id="tab-maintenance" class="btn secondary" onclick="queue()">Maintenance</button>
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
          <label>Email</label>
          <input id="loginEmail" type="email" autocomplete="email">
        </div>

        <div class="field">
          <label>Password</label>
          <input id="loginPassword" type="password" autocomplete="current-password">
        </div>

        <button class="btn primary" onclick="login()">Sign In</button>
      </div>
    </main>
  `;
}

async function login() {
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;

  const { data, error } = await sb.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    loginScreen('Sign in failed: ' + error.message);
    return;
  }

  user = data.user;
  await startApp();
}

async function logout() {
  await sb.auth.signOut();
  user = null;
  loginScreen();
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
        ${statusLabel(x.status)} ·
        ${new Date(x.created_at).toLocaleString()}
      </div>

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

  const history = data || [];

  document.getElementById('view').innerHTML = `
    <div class="card">
      <h2>Issue History</h2>

      <h3>
        #${issue ? issue.issue_number : ''} —
        ${issue ? issue.title : 'Equipment Issue'}
      </h3>

      ${
        history.length
          ? history.map(h => `
              <div class="issue">
                <strong>${h.old_status || 'New'} → ${h.new_status}</strong>

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
          : '<p class="muted">No status history recorded for this issue.</p>'
      }

      <button class="btn" onclick="home()">
        Back to Home
      </button>
    </div>
  `;
}

async function home() {
  setActive('home');
  await loadIssues();

  const open = issues.filter(x =>
    !['Completed', 'Closed', 'Cancelled'].includes(x.status)
  );

  document.getElementById('view').innerHTML = `
    <div class="card">
      <div class="small">Open issues</div>
      <div class="stat">${open.length}</div>
      <p>Shared MillFix equipment issues.</p>

      <button class="btn primary" onclick="report()">
        + Report a Problem
      </button>
    </div>

    <div class="card">
      <h2>Recent Issues</h2>

      ${
        issues.length
          ? issues.slice(0, 5).map(issueHtml).join('')
          : '<p class="muted">No issues reported yet.</p>'
      }
    </div>

    <div class="card">
      <button class="btn secondary" onclick="logout()">
        Sign Out
      </button>
    </div>
  `;
}

async function report() {
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

      <button class="btn primary" onclick="submitIssue()">
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

function showComponentSuggestions() {
  const input = document.getElementById('component');
  const box = document.getElementById('componentSuggestions');
  const typed = input.value.trim().toLowerCase();

  box.innerHTML = '';

  if (!typed) return;

  const matches = learnedComponents.filter(name =>
    name.toLowerCase().includes(typed)
  );

  matches.forEach(name => {
    const item = document.createElement('div');

    item.textContent = name;
    item.style.padding = '12px';
    item.style.border = '1px solid #ccc';
    item.style.borderRadius = '8px';
    item.style.marginTop = '6px';
    item.style.cursor = 'pointer';
    item.style.background = 'white';

    item.onclick = () => {
      input.value = name;
      box.innerHTML = '';
    };

    box.appendChild(item);
  });
}

async function submitIssue() {
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
  document.getElementById('view').innerHTML = `
    <div class="card">
      <div class="notice">
        <strong>Issue submitted.</strong><br>
        MillFix issue #${data.issue_number} was saved to the shared database.
      </div>

      <button class="btn primary" onclick="home()">
        Back to Home
      </button>
    </div>
  `;
}

async function queue() {
  setActive('maintenance');
  await loadIssues();

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
    value="${(profiles || []).find(p => p.id === x.assigned_to)?.full_name || ''}"
    autocomplete="off"
    oninput="showMaintenanceMatches('${x.id}', this.value)"
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

  const matches = (profiles || [])
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
  const profile = (profiles || []).find(p => p.id === profileId);
  if (!profile) return;

  const input = document.getElementById(`assigned-${id}`);
  const box = document.getElementById(`matches-${id}`);

  if (input) input.value = profile.full_name || '';
  if (box) box.innerHTML = '';

  assignIssue(id, profile.id);
}

async function assignIssueByName(id, name) {
  const cleanName = name.trim();
  
  if (!cleanName) {
    const { error } = await sb
      .from('issues')
      .update({
        assigned_to: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', id);

    if (error) {
      alert('Assignment could not be updated: ' + error.message);
    }

    await queue();
    return;
  }

  const profile = (profiles || []).find(
    p => (p.full_name || '').toLowerCase() === cleanName.toLowerCase()
  );

  if (!profile) {
    alert('Please select a maintenance employee from the suggested names.');
    await queue();
    return;
  }

  const { error } = await sb
    .from('issues')
    .update({
      assigned_to: profile.id,
      updated_at: new Date().toISOString()
    })
    .eq('id', id);

  if (error) {
    alert('Assignment could not be updated: ' + error.message);
    await queue();
    return;
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
window.home = home;
window.report = report;
window.queue = queue;
window.submitIssue = submitIssue;
window.setStatus = setStatus;
window.showRepairForm = showRepairForm;
window.completeRepair = completeRepair;

init();
