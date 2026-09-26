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

function loginScreen(message='') {
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
  const { data } = await sb
    .from('departments')
    .select('*');

  departments = data || [];
}

function issueHtml(x) {
  return `
    <div class="issue">
      <h3>${x.title || 'Equipment Issue'}</h3>
      <div>
        ${x.category || ''}
        <span class="pill">${x.priority || 'Normal'}</span>
      </div>
      <div class="muted">${x.description || ''}</div>
      <div class="muted">
        ${statusLabel(x.status)} ·
        ${new Date(x.created_at).toLocaleString()}
      </div>
    </div>
  `;
}

async function home() {
  setActive('home');
  await loadIssues();

  const open = issues.filter(x =>
    !['Completed','Closed','Cancelled'].includes(x.status)
  );

  document.getElementById('view').innerHTML = `
    <div class="card">
      <div class="small">Open issues</div>
      <div class="stat">${open.length}</div>
      <p>Shared MillFix equipment issues.</p>
      <button class="btn primary" onclick="report()">+ Report a Problem</button>
    </div>

    <div class="card">
      <h2>Recent Issues</h2>
      ${
        issues.length
          ? issues.slice(0,5).map(issueHtml).join('')
          : '<p class="muted">No issues reported yet.</p>'
      }
    </div>

    <div class="card">
      <button class="btn secondary" onclick="logout()">Sign Out</button>
    </div>
  `;
}

function report() {
  setActive('report');

  document.getElementById('view').innerHTML = `
    <div class="card">
      <h2>Report a Problem</h2>

      <div class="field">
        <label>Equipment</label>
        <select id="eq">
          ${equipment.map(e =>
            `<option value="${e[1]}">${e[1]} — ${e[2]}</option>`
          ).join('')}
        </select>
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
        <textarea id="desc" placeholder="Describe what is happening, when it happens, and anything you've observed."></textarea>
      </div>

      <button class="btn primary" onclick="submitIssue()">Submit Issue</button>
    </div>
  `;
}

async function submitIssue() {
  const equipmentName = document.getElementById('eq').value;
  const priority = document.getElementById('priority').value;
  const category = document.getElementById('category').value;
  const enteredTitle = document.getElementById('title').value.trim();
  const description = document.getElementById('desc').value.trim();

  if (!enteredTitle) {
    alert('Please enter a short problem title.');
    return;
  }

  const coldMill = departments.find(d => d.name === 'Cold Mill');

  const { data, error } = await sb
    .from('issues')
    .insert({
      reported_by: user.id,
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

  document.getElementById('view').innerHTML = `
    <div class="card">
      <div class="notice">
        <strong>Issue submitted.</strong><br>
        MillFix issue #${data.issue_number} was saved to the shared database.
      </div>

      <button class="btn primary" onclick="home()">Back to Home</button>
    </div>
  `;
}

async function queue() {
  setActive('maintenance');
  await loadIssues();

  const active = issues.filter(x =>
    !['Completed','Closed','Cancelled'].includes(x.status)
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

              <select onchange="setStatus('${x.id}',this.value)">
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
          `).join('')
          : '<p class="muted">No active maintenance issues.</p>'
      }
    </div>
  `;
}

async function setStatus(id, status) {
  const { error } = await sb
    .from('issues')
    .update({
      status,
      updated_at: new Date().toISOString()
    })
    .eq('id', id);

  if (error) {
    alert('Status could not be updated: ' + error.message);
    return;
  }

  await queue();
}

async function startApp() {
  await loadDepartments();
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
    navigator.serviceWorker.register('sw.js').catch(() => {})
  );
}

window.login = login;
window.logout = logout;
window.home = home;
window.report = report;
window.queue = queue;
window.submitIssue = submitIssue;
window.setStatus = setStatus;

init();
