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

function getProfileName(profileId) {
  if (!profileId) return 'Unknown';

  const profile = profiles.find(p => p.id === profileId);

  return profile?.full_name || 'Unknown';
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
    console.error('Could not load profiles:', error);
    profiles = [];
    return;
  }

  profiles = data || [];
}

function issueHtml(x) {
  const repairSection =
    x.status === 'Completed' && x.repair_notes
      ? `
        <div class="muted">
          <strong>Repaired by:</strong>
          ${getProfileName(x.repaired_by)}
        </div>

        <div class="muted">
          <strong>Repair:</strong>
          ${x.repair_notes}
        </div>

        ${
          x.parts_used
            ? `
              <div class="muted">
                <strong>Parts:</strong>
                ${x.parts_used}
              </div>
            `
            : `
              <div class="muted">
                <strong>Parts:</strong>
                None
              </div>
            `
        }

        ${
          x.completed_at
            ? `
              <div class="muted">
                <strong>Completed:</strong>
                ${new Date(x.completed_at).toLocaleString()}
              </div>
            `
            : ''
        }
      `
      : '';

  return `
    <div class="issue">
      <h3>
        #${x.issue_number || ''} —
        ${x.title || 'Equipment Issue'}
      </h3>

      <div>
        ${x.category || ''}
        <span class="pill">${x.priority || 'Normal'}</span>
      </div>

      <div class="muted">
        ${x.description || ''}
      </div>

      <div class="muted">
        ${statusLabel(x.status)} ·
        ${new Date(x.created_at).toLocaleString()}
      </div>

      ${repairSection}
    </div>
  `;
}

async function home() {
  setActive('home');

  await Promise.all([
    loadIssues(),
    loadProfiles()
  ]);

  const open = issues.filter(x =>
    !['Completed', 'Closed', 'Cancelled'].includes(x.status)
  );

  document.getElementById('view').innerHTML = `
    <div class="card">
      <div class="small">Open issues</div>

      <div class="stat">
        ${open.length}
      </div>

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
      <button class="btn secondary"
