/* =========================================================
   GANKING UNIVERSITY — frontend
   Talks to the Express/Postgres backend over /api/*. Sessions
   are cookie-based, so fetch() just works same-origin.
   ========================================================= */

const $ = (s, el = document) => el.querySelector(s);

/* ---------------------------------------------------------
   API HELPER
   --------------------------------------------------------- */
async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined
  });
  let data = {};
  try { data = await res.json(); } catch (e) { /* empty body */ }
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function readImageAsDataURL(file, maxMB = 1.5) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve(null);
    if (file.size > maxMB * 1024 * 1024) return reject(new Error(`Please choose an image under ${maxMB}MB.`));
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error('Could not read that file.'));
    r.readAsDataURL(file);
  });
}

/* ---------------------------------------------------------
   HELPERS
   --------------------------------------------------------- */
function esc(v) { return String(v == null ? '' : v).replace(/[&<>'"]/g, x => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[x])); }
function avg(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0; }
function stars(n) { return '★★★★★'.slice(0, Math.round(n)) + '☆☆☆☆☆'.slice(0, 5 - Math.round(n)); }
function fmtTime(ts) { const d = new Date(ts); return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
function statusBadge(s) { return `<span class="status-badge ${esc(s)}">${esc(s)}</span>`; }
function has(perm) { return !!(state.me && state.me.permissions && state.me.permissions[perm]); }
function isStaffOrAbove() { return !!state.me && state.me.tier !== 'student'; }

/* ---------------------------------------------------------
   STATE
   --------------------------------------------------------- */
const state = {
  view: 'home',
  modal: null,
  me: null,
  authTab: 'login',
  adminQueueTab: 'admissions',
  cache: {}, // scratch space for things fetched for a modal / one-off UI, e.g. application fee
  errorMsg: null
};

async function refreshMe() {
  const data = await api('/api/auth/me');
  state.me = data.user;
}

function go(view) {
  state.view = view;
  state.modal = null;
  state.errorMsg = null;
  render();
  window.scrollTo(0, 0);
}
async function openModal(name) {
  state.modal = name;
  state.errorMsg = null;
  if (name === 'auth' && !state.cache.fee) {
    try { const d = await api('/api/admin/public-fee'); state.cache.fee = d.fee; } catch (e) { state.cache.fee = '1'; }
  }
  render();
}
function closeModal() { state.modal = null; render(); }

function showError(err) {
  state.errorMsg = err.message || String(err);
  render();
}

/* ---------------------------------------------------------
   NAV
   --------------------------------------------------------- */
function nav() {
  const loggedLinks = state.me ? `
    <a href="#" onclick="go('chat')">Chat</a>
    <a href="#" onclick="go('gank')">Gank Log</a>
    <a href="#" onclick="go('bank')">Bank</a>
    <a href="#" onclick="go('yearbook')">Yearbook</a>
    <a href="#" onclick="go('schedule')">Schedule</a>
    <a href="#" onclick="go('gradebook')">Gradebook</a>
    <a href="#" onclick="go('profile')">Profile</a>` : '';

  const staffLinks = `
    ${has('can_issue_detention') ? `<a href="#" onclick="go('detention')">Campus Security</a>` : ''}
    ${(has('can_approve_admissions') || has('can_manage_units') || has('can_manage_settings')) ? `<a href="#" onclick="go('adminqueues')">Admin Queues</a>` : ''}
    ${(has('can_assign_roles') || has('can_create_roles') || has('can_manage_users')) ? `<a href="#" onclick="go('rolesusers')">Roles &amp; Users</a>` : ''}
  `;

  const authArea = state.me
    ? `<div class="nav-user"><span class="pill${state.me.detention_active || needsBoardPlacement() ? ' warn' : ''}">${esc(state.me.username)} · ${esc((state.me.roles && state.me.roles[0]) || state.me.tier)}${state.me.detention_active ? ' · DETENTION' : ''}${needsBoardPlacement() ? ' · PENDING PLACEMENT' : ''}</span><button class="text-btn" onclick="logout()">Log out</button></div>`
    : `<button class="outline-button" onclick="openModal('auth')">Sign in / Apply</button>`;

  return `<header class="topbar">
    <div class="brand" onclick="go('home')" style="cursor:pointer"><img src="assets/logo.png" alt="Ganking University seal"><span>GANKING UNIVERSITY<small>OFFICE OF THE REGISTRAR · EST. 2026</small></span></div>
    <nav class="nav">
      <a href="#" onclick="go('home')">Home</a>
      <a href="#" onclick="go('applications')">Admissions</a>
      <a href="#" onclick="go('board')">Reveal Board</a>
      <a href="#" onclick="go('blog')">The Chronicle</a>
      ${loggedLinks}
      ${staffLinks}
      ${authArea}
    </nav>
  </header>`;
}

function lockedPanel(label) {
  return `<main class="dark-page">${nav()}<section class="view"><div class="locked-panel"><span class="eyebrow">STUDENTS &amp; STAFF ONLY</span><h1 style="font:500 30px var(--display);margin:6px 0 14px">${esc(label)}</h1><p style="font:19px var(--serif);margin:0 0 22px;color:#d7c6a6">Sign in, or complete admission, to access this hall of the university.</p><button class="gold-button" onclick="openModal('auth')">Sign in / Apply</button></div></section></main>`;
}
function forbiddenPanel(label) {
  return `<main class="dark-page">${nav()}<section class="view"><div class="locked-panel"><span class="eyebrow">RESTRICTED</span><h1 style="font:500 30px var(--display);margin:6px 0 14px">${esc(label)}</h1><p style="font:19px var(--serif);margin:0;color:#d7c6a6">Your current roles do not carry the authority to view this office.</p></div></section></main>`;
}
function pendingBoardPanel(label) {
  return `<main class="dark-page">${nav()}<section class="view"><div class="locked-panel"><span class="eyebrow">ADMISSION PENDING</span><h1 style="font:500 30px var(--display);margin:6px 0 14px">${esc(label)}</h1><p style="font:19px var(--serif);margin:0 0 22px;color:#d7c6a6">Your account is active, but full access unlocks once an Admin or Admission Counselor places your name on the Reveal Board. Until then, you can still finish your application and check the Reveal Board.</p><div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap"><button class="gold-button" onclick="go('board')">View Reveal Board</button><button class="outline-button" onclick="go('applications')" style="color:#5a452a;border-color:#5a452a">My Application</button></div></div></section></main>`;
}
// Gate: staff-tier and above always pass. Student-tier only passes once onBoard is true.
function needsBoardPlacement() { return !!state.me && state.me.tier === 'student' && !state.me.onBoard; }

/* ---------------------------------------------------------
   HOME
   --------------------------------------------------------- */
function home() {
  return `<main class="page">${nav()}
  <section class="hero">
    <div class="seal"><img src="assets/logo.png" alt="Ganking University crest"></div>
    <div class="eyebrow">THE LEGACY CONTINUES</div>
    <h1>A New Era of Victory.</h1>
    <p class="lead">From the ashes of Sahur War Squad, a greater legacy rises.</p>
    <p class="motto">Veritas In Ganking</p>
    <div class="divider">✦</div>
    <button class="gold-button" onclick="go('applications')">Visit the Office of Admissions</button>
  </section>
  <section class="paper">
    <div class="intro">
      <div>
        <h2>Ganking University</h2>
        <div class="highlight">is the successor to Sahur War Squad.</div>
        <p>We carry forward the same unbreakable spirit, competitive drive, and hunger for victory — refined, elevated, and built for the next generation of champions.</p>
        <p class="quote">This is not just a new name.<br>This is a new standard.</p>
      </div>
      <div class="hall">
        <div class="eyebrow">A LEGACY WORTH BUILDING</div>
        <h2 style="font:500 38px var(--display);position:relative;z-index:1">Earn your place.</h2>
        <p style="font:22px var(--serif);position:relative;z-index:1">Discipline. Focus. Brotherhood. Victory.</p>
      </div>
    </div>
    <div class="feature-row">
      <div class="feature"><div class="feature-icon">⚔</div><h3>Master Your Fight</h3><p>Hone mechanics, strategy, and decision-making to outplay any opponent.</p></div>
      <div class="feature"><div class="feature-icon">♜</div><h3>Stronger Together</h3><p>Develop elite teamwork, communication, and synergy in every battle.</p></div>
      <div class="feature"><div class="feature-icon">♛</div><h3>Victory Above All</h3><p>We don't just participate. We prepare to win. Every. Single. Time.</p></div>
    </div>
    <div class="hall apply-call">
      <h2>Limited seats. Endless potential.</h2>
      <p>Ganking University accepts only a select few.<br>If you have the will to be the best, you belong here.</p>
      <button class="gold-button" onclick="go('applications')">Begin Admission</button>
    </div>
    <div class="admissions">
      <div class="eyebrow">ADMISSIONS OPEN</div>
      <h2>Upcoming Late Summer<br><span style="color:#a57a3b">Hearthspan — Rootwatch</span></h2>
      <p style="font:20px var(--serif);margin:0">Prepare. Prove yourself. Join the ranks.</p>
    </div>
  </section>
  <footer class="footer">THE NEXT CHAPTER IS WRITTEN BY THOSE WHO DARE.<br>WILL YOU BE ONE OF THEM?<br><button class="text-btn" onclick="openModal('terms')">Terms of Service</button>
  <div class="fine-print">Ganking University is an unofficial, fan-made community portal for a Deepwoken guild. It is not affiliated with Roblox Corporation or the developers of Deepwoken.</div>
  </footer>
  </main>`;
}

/* ---------------------------------------------------------
   APPLICATIONS (Office of Admissions)
   --------------------------------------------------------- */
async function applications() {
  const listData = await api('/api/applications');
  const cards = listData.applications.map(a => `<article class="app-card">
    <header><h2>${esc(a.name)}</h2><span class="rating">${stars(avg(a.ratings))}</span></header>
    <dl><dt>Guild</dt><dd>${esc(a.guild)}</dd><dt>Weapon</dt><dd>${esc(a.weapon)} · ${esc(a.special)}</dd><dt>Role</dt><dd>${esc(a.role)}</dd><dt>Top ELO</dt><dd>${esc(a.elo)}</dd></dl>
    <button class="card-open" onclick="showApp(${a.id})">View Application →</button>
  </article>`).join('') || '<p style="font:20px var(--serif)">No applications have been admitted to the public roster yet.</p>';

  let panel;
  if (!state.me) {
    panel = `<aside class="form-card">
      <h2>Office of Admissions</h2>
      <p style="font:18px var(--serif)">Prospective students must first request admission and confirm the intake fee in-game before an account is created.</p>
      <button class="gold-button" style="width:100%;margin-bottom:10px" onclick="openModal('auth');authTab('apply')">Request Admission</button>
      <button class="ghost-btn" style="width:100%" onclick="openModal('checkstatus')">Check My Request Status</button>
    </aside>`;
  } else {
    let current = null;
    try { current = (await api('/api/applications/mine/current')).application; } catch (e) { current = null; }
    if (!current) {
      panel = `<aside class="form-card"><h2>Seek Admission</h2><p style="font:18px var(--serif)">The next era needs its champions. Make your case.</p><button class="gold-button" style="width:100%" onclick="openModal('apply')">Start Application</button></aside>`;
    } else if (current.status === 'draft') {
      panel = `<aside class="form-card"><h2>Resume Application</h2><p style="font:18px var(--serif)">You have a saved draft. Pick up right where you left off.</p><button class="gold-button" style="width:100%" onclick="openModal('apply')">Continue Application</button></aside>`;
    } else {
      panel = `<aside class="form-card"><h2>Application Submitted</h2><p style="font:18px var(--serif)">Your case is before the university now.</p>${needsBoardPlacement() ? '<p class="hint">Note: your account is active, but chat, classes, and the rest of the student portal unlock once your name is placed on the Reveal Board.</p>' : ''}<button class="gold-button" style="width:100%" onclick="showApp(${current.id})">View My Application</button></aside>`;
    }
  }

  return `<main class="dark-page">${nav()}
  <section class="view">
    <div class="page-heading"><div class="eyebrow">THE ROSTER AWAITS</div><h1>Office of Admissions</h1><p>Review the candidates seeking a place among the university ranks.</p></div>
    <div class="application-layout">${panel}<div class="apps-grid">${cards}</div></div>
  </section></main>`;
}

async function applicationDetail(id) {
  const data = await api(`/api/applications/${id}`);
  const a = data.application;
  return `<main class="dark-page">${nav()}
  <section class="view">
    <button class="outline-button" onclick="go('applications')">← All applications</button>
    <article class="detail-card" style="margin-top:18px">
      <header><div class="eyebrow" style="color:#85652d">CANDIDATE DOSSIER</div><h2 style="font-size:35px;margin:5px 0">${esc(a.name)}</h2><p class="rating">${stars(avg(a.ratings))} <span style="color:#786447;font:13px var(--sans)">(${a.ratings.length} ratings)</span></p></header>
      <div class="details">
        <div><strong>Guild</strong>${esc(a.guild)}</div>
        <div><strong>Roblox profile</strong><a href="${esc(a.roblox)}" target="_blank">Open profile ↗</a></div>
        <div><strong>Role desired</strong>${esc(a.role)}</div>
        <div><strong>Weapon class</strong>${esc(a.weapon)}</div>
        <div><strong>Specialization</strong>${esc(a.special)}</div>
        <div><strong>Top ELO · Online level</strong>${esc(a.elo)} · ${esc(a.online)}/5</div>
        <div style="grid-column:1/-1"><strong>Talent, aspect, oath, or culture</strong>${esc(a.culture)}</div>
        <div><strong>Bonus response</strong>${esc(a.bonus)}</div>
      </div>
      <section class="comments">
        <h2>Community Review</h2>
        ${state.me ? `<div class="rating" style="margin-bottom:10px">Rate this applicant: ${[1, 2, 3, 4, 5].map(n => `<button class="text-btn" style="color:#b8842e;font-size:22px" onclick="rateApp(${a.id},${n})">☆</button>`).join('')}</div>` : `<p class="hint">Sign in to rate or comment.</p>`}
        <div id="comments">${a.comments.map(c => `<div class="comment"><small>${esc(c.username).toUpperCase()}</small><br>${esc(c.body)}</div>`).join('') || '<p style="font:17px var(--serif);color:#a08a63">No comments yet.</p>'}</div>
        ${state.me ? `<div class="comment-form"><input id="comment-input" placeholder="Leave a constructive comment…"><button class="gold-button" onclick="postComment(${a.id})">Post</button></div>` : ''}
      </section>
    </article>
  </section></main>`;
}

/* ---------------------------------------------------------
   ADMISSIONS BOARD
   --------------------------------------------------------- */
async function board() {
  const data = await api('/api/board');
  const canManage = data.canManage;
  const slots = data.slots.map(x => `<button class="slot ${x.name ? '' : 'empty'} ${canManage ? 'admin' : ''} ${x.revealed ? 'revealed' : ''}" onclick="${canManage ? `openBoardEdit(${x.id})` : `revealSlot(${x.id})`}">
    ${x.name ? (canManage ? `<span class="slot-name">${esc(x.name)}</span><small>${esc(x.guild || '')}${x.user_id ? ' · linked' : ' · unlinked'}</small>` : x.revealed ? `<span class="slot-name">${esc(x.name)}</span><small>Accepted</small>` : `<span class="seal-dot"></span><small>Reveal</small>`) : (canManage ? '<small>+ Assign candidate</small>' : '<small>—</small>')}
  </button>`).join('');

  return `<main class="dark-page">${nav()}
  <section class="view"><div class="board-shell">
    <div class="page-heading"><div class="eyebrow">LATE SUMMER ADMISSIONS</div><h1>Reveal Board</h1><p>${canManage ? 'Board of Admissions view — click a slot to assign or edit a candidate. Linking a slot to a real account is what actually grants that student full portal access.' : 'Thirty-plus places. One shared legacy.'}</p></div>
    <div class="board-panel"><div class="eyebrow">GANKING UNIVERSITY · CLASS OF 2026</div><div class="board-grid">${slots}</div>
      ${canManage ? `<button class="gold-button small" style="margin-top:20px" onclick="addSlot()">+ Add Slot</button>` : ''}
    </div>
    ${canManage ? `<p class="admin-note">Board of Admissions mode active — entries return to sealed form for regular visitors.</p>` : (state.me ? '' : `<button class="admin-access" onclick="openModal('auth')">Board of Admissions sign-in</button>`)}
  </div></section></main>`;
}

/* ---------------------------------------------------------
   CHAT
   --------------------------------------------------------- */
async function chatPage() {
  if (!state.me) return lockedPanel('The Common Hall');
  if (needsBoardPlacement()) return pendingBoardPanel('The Common Hall');
  const data = await api('/api/chat');
  const canDelete = has('can_delete_chat');
  const msgs = data.messages.slice().reverse().map(m => `<div class="chat-msg ${m.username === state.me.username ? 'mine' : ''}"><span class="who">${esc(m.username)} · ${fmtTime(m.created_at)}${canDelete ? ` <button class="chat-del-btn" title="Delete message" onclick="deleteChatMessage(${m.id})">Delete</button>` : ''}</span>${esc(m.body)}</div>`).join('') || '<p style="font:18px var(--serif);color:#a08a63">No messages yet — say hello to the university.</p>';
  const disabled = state.me.detention_active;
  return `<main class="dark-page">${nav()}
  <section class="view">
    <div class="page-heading"><div class="eyebrow">THE COMMON HALL</div><h1>Student Chat</h1><p>Talk strategy, trash talk, or plan the next scrim.</p></div>
    <div class="panel-card" style="max-width:760px;margin:auto">
      ${disabled ? `<p class="error-box">You are in detention and cannot post here right now.</p>` : ''}
      <div class="chat-window">${msgs}</div>
      <form class="chat-form" onsubmit="postChat(event)"><input id="chat-input" placeholder="Say something to the university…" required ${disabled ? 'disabled' : ''}><button class="gold-button" style="white-space:nowrap" ${disabled ? 'disabled' : ''}>Send</button></form>
    </div>
  </section></main>`;
}

/* ---------------------------------------------------------
   GANK LOG + BANK
   --------------------------------------------------------- */
async function feedPage(kind) {
  const isBank = kind === 'bank';
  if (!state.me) return lockedPanel(isBank ? 'The Bank' : 'Gank Log');
  if (needsBoardPlacement()) return pendingBoardPanel(isBank ? 'The Bank' : 'Gank Log');
  const data = await api(`/api/feed/${kind}`);
  const items = data.posts.slice().reverse().map(e => `<article class="feed-card">
      ${e.img ? `<img class="feed-thumb" src="${e.img}" alt="">` : ''}
      <div class="feed-body"><h3>${esc(e.title)}</h3><small>${esc(e.username)} · ${fmtTime(e.created_at)}</small><p>${esc(e.note)}</p></div>
    </article>`).join('') || `<p style="font:18px var(--serif);color:#a08a63">${isBank ? 'No victories logged yet.' : 'No fights logged yet.'}</p>`;
  const disabled = state.me.detention_active;

  return `<main class="dark-page">${nav()}
  <section class="view">
    <div class="page-heading"><div class="eyebrow">${isBank ? 'HALL OF FAME' : 'FIELD RECORDS'}</div><h1>${isBank ? 'The Bank' : 'Gank Log'}</h1><p>${isBank ? 'Victories over renowned players, immortalized.' : 'Upload your fight screenshots and tell the story.'}</p></div>
    <div class="portal-grid">
      <aside class="panel-card">
        <h2>${isBank ? 'Log a Victory' : 'Log a Fight'}</h2>
        ${disabled ? `<p class="error-box">You are in detention and cannot post here right now.</p>` : `
        <form onsubmit="submitFeed(event,'${kind}')">
          <div class="field"><label>Title</label><input required name="title" placeholder="${isBank ? 'e.g. Downed the #1 duelist' : 'e.g. 1v3 clutch at the gate'}"></div>
          <div class="field"><label>Screenshot (optional)</label><input type="file" accept="image/*" id="${kind}-img"></div>
          <div class="field"><label>Story / notes</label><textarea name="note" required></textarea></div>
          <button class="gold-button" style="width:100%">Post to ${isBank ? 'the Bank' : 'the Log'}</button>
        </form>`}
      </aside>
      <div class="feed-list">${items}</div>
    </div>
  </section></main>`;
}

/* ---------------------------------------------------------
   YEARBOOK
   --------------------------------------------------------- */
async function yearbookPage() {
  if (!state.me) return lockedPanel('Yearbook');
  if (needsBoardPlacement()) return pendingBoardPanel('Yearbook');
  const data = await api('/api/yearbook');
  const cats = data.categories.map(c => {
    const isFixed = !!c.fixed_winner;
    const tally = c.tally.map(t => `<span class="tally-chip ${isFixed ? 'spoofer-chip' : ''}">${esc(t.nominee)} <b>${isFixed ? 'unanimous' : t.count}</b></span>`).join('') || '<span style="font:14px var(--serif);color:#a08a63">No votes yet.</span>';
    return `<div class="panel-card category-card">
      <h3>${esc(c.name)}</h3>
      ${isFixed ? `<p style="font:16px var(--serif);margin:0 0 8px;color:#7a1f1f">This category is not up for debate.</p>` : (c.myVote ? `<p style="font:17px var(--serif);margin:0 0 8px">Your vote: <strong>${esc(c.myVote)}</strong></p>` : '')}
      ${isFixed ? '' : `<form class="vote-row" onsubmit="submitVote(event,${c.id})"><input name="nominee" placeholder="Nominate a player/guild…" required value="${esc(c.myVote || '')}"><button class="gold-button small">${c.myVote ? 'Change Vote' : 'Vote'}</button></form>`}
      <div class="tally">${tally}</div>
    </div>`;
  }).join('');

  return `<main class="dark-page">${nav()}
  <section class="view">
    <div class="page-heading"><div class="eyebrow">CLASS OF 2026</div><h1>Yearbook Voting</h1><p>One vote per category. Change it anytime before the ceremony.</p></div>
    <div style="max-width:640px;margin:auto">${cats}</div>
  </section></main>`;
}

/* ---------------------------------------------------------
   SCHEDULE
   --------------------------------------------------------- */
async function schedulePage() {
  if (!state.me) return lockedPanel('Office of the Registrar — Schedule');
  if (needsBoardPlacement()) return pendingBoardPanel('Office of the Registrar — Schedule');
  const [classesData, summaryData] = await Promise.all([api('/api/classes'), api('/api/classes/mine/summary')]);
  const classes = classesData.classes;
  const myIds = new Set(summaryData.enrolled.map(c => c.id));
  const mine = classes.filter(c => myIds.has(c.id));
  const joinable = classes.filter(c => !myIds.has(c.id));
  const used = summaryData.unitsUsed, cap = summaryData.unitCap;
  const canManage = has('can_manage_classes');

  const classRowHtml = (c, joinBtn) => `<div class="class-row">
    <div class="meta"><b>${esc(c.name)}<span class="units">${c.units} units</span></b>${esc(c.teacher || '')}${c.time ? ' · ' + esc(c.time) : ''}
      ${c.description ? `<div class="desc">${esc(c.description)}</div>` : ''}
      ${c.link ? `<div class="desc"><a href="${esc(c.link)}" target="_blank">Class link ↗</a></div>` : ''}
    </div>
    ${joinBtn}
  </div>`;

  const myRows = mine.map(c => classRowHtml(c, canManage ? '' : `<button class="danger-btn" onclick="dropClass(${c.id})">Drop class</button>`)).join('') || '<p style="font:18px var(--serif);color:#a08a63">You are not enrolled in any classes yet.</p>';
  const joinRows = joinable.map(c => classRowHtml(c, `<button class="gold-button small" onclick="joinClass(${c.id})" ${used + c.units > cap ? 'disabled title="Not enough units"' : ''}>Enroll (${c.units}u)</button>`)).join('') || '<p style="font:18px var(--serif);color:#a08a63">No other classes to join right now.</p>';

  const unitMeter = state.me.tier === 'student' ? `<div class="panel-card"><h2>Your Units</h2><p style="font:18px var(--serif);margin:0 0 4px">${used} / ${cap} units used</p><div class="unit-meter"><div class="unit-meter-fill" style="width:${Math.min(100, (used / cap) * 100)}%"></div></div><button class="ghost-btn" style="margin-top:10px" onclick="openModal('unitrequest')">Request More Units</button></div>` : '';

  const adminPanel = canManage ? `<div class="panel-card" style="margin-top:24px">
      <h2>Registrar · Create a Class</h2>
      <form onsubmit="createClass(event)">
        <div class="field"><label>Class name</label><input required name="name" placeholder="e.g. Advanced Ganking Theory"></div>
        <div class="field"><label>Teacher</label><input name="teacher" placeholder="e.g. Professor Aurelian"></div>
        <div class="field"><label>Schedule</label><input name="time" placeholder="e.g. Mon/Wed 6pm EST"></div>
        <div class="field"><label>Units</label><input name="units" type="number" value="3" min="1"></div>
        <div class="field"><label>Class link (voice call / discord / etc.)</label><input name="link" type="url" placeholder="https://..."></div>
        <div class="field"><label>Description</label><textarea name="description" placeholder="What this class covers…"></textarea></div>
        <button class="gold-button" style="width:100%">Create Class</button>
      </form>
      <h2 style="margin-top:24px">All Classes &amp; Rosters</h2>
      <div class="class-list">${classes.map(c => `<div class="class-row" style="align-items:flex-start;flex-direction:column">
        <div class="meta" style="width:100%;display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px"><span><b>${esc(c.name)}<span class="units">${c.units} units</span></b>${esc(c.teacher || '')}${c.time ? ' · ' + esc(c.time) : ''}</span><button class="danger-btn" onclick="deleteClass(${c.id})">Delete class</button></div>
        <div class="roster-list">Roster: ${c.roster.length ? c.roster.map(r => esc(r.username)).join(', ') : '— none yet —'}</div>
      </div>`).join('') || '<p style="font:18px var(--serif);color:#a08a63">No classes created yet.</p>'}</div>
    </div>` : '';

  return `<main class="dark-page">${nav()}
  <section class="view">
    <div class="page-heading"><div class="eyebrow">TERM SCHEDULE</div><h1>Office of the Registrar</h1><p>${canManage ? 'Manage classes and rosters for the whole university.' : 'Your enrolled classes and what is open to join.'}</p></div>
    ${unitMeter}
    <div class="panel-card"><h2>My Classes</h2><div class="class-list">${myRows}</div></div>
    <div class="panel-card" style="margin-top:18px"><h2>Open Classes</h2><div class="class-list">${joinRows}</div></div>
    ${adminPanel}
  </section></main>`;
}

/* ---------------------------------------------------------
   GRADEBOOK
   --------------------------------------------------------- */
const GRADE_OPTIONS = ['—', 'A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D', 'F', 'Incomplete'];

async function gradebookPage() {
  if (!state.me) return lockedPanel('Gradebook');
  if (needsBoardPlacement()) return pendingBoardPanel('Gradebook');

  if (has('can_grade')) {
    const data = await api('/api/classes');
    const tables = data.classes.map(c => `<div class="panel-card" style="margin-bottom:18px">
      <h2>${esc(c.name)}</h2>
      <div class="table-wrap"><table class="grades"><thead><tr><th>Student</th><th>Grade</th></tr></thead><tbody>
        ${c.roster.map(u => `<tr><td>${esc(u.username)}</td><td><select onchange="setGrade(${c.id},${u.id},this.value)">${GRADE_OPTIONS.map(g => `<option ${(u.grade || '—') === g ? 'selected' : ''}>${g}</option>`).join('')}</select></td></tr>`).join('') || `<tr><td colspan="2" style="color:#a08a63">No students enrolled.</td></tr>`}
      </tbody></table></div>
    </div>`).join('') || '<p style="font:18px var(--serif);color:#a08a63">No classes exist yet — create one from the Schedule page.</p>';
    return `<main class="dark-page">${nav()}
    <section class="view"><div class="page-heading"><div class="eyebrow">FACULTY VIEW</div><h1>Gradebook</h1><p>Assign grades for every enrolled student.</p></div>${tables}</section></main>`;
  }

  const summary = await api('/api/classes/mine/summary');
  const rows = summary.enrolled.map(c => `<tr><td>${esc(c.name)}</td><td>${esc(c.teacher || '—')}</td><td>${esc(c.grade || '—')}</td></tr>`).join('') || `<tr><td colspan="3" style="color:#a08a63">You are not enrolled in any classes.</td></tr>`;
  return `<main class="dark-page">${nav()}
  <section class="view">
    <div class="page-heading"><div class="eyebrow">YOUR RECORD</div><h1>Gradebook</h1><p>Grades for classes you're currently enrolled in.</p></div>
    <div class="panel-card"><div class="table-wrap"><table class="grades"><thead><tr><th>Class</th><th>Teacher</th><th>Grade</th></tr></thead><tbody>${rows}</tbody></table></div></div>
  </section></main>`;
}

/* ---------------------------------------------------------
   PROFILE
   --------------------------------------------------------- */
async function profilePage() {
  if (!state.me) return lockedPanel('Profile');
  const u = state.me;
  const picBlock = u.pic ? `<img class="profile-pic" src="${u.pic}" alt="">` : `<div class="profile-pic-placeholder">${esc((u.username[0] || '?')).toUpperCase()}</div>`;

  return `<main class="dark-page">${nav()}
  <section class="view">
    <div class="page-heading"><div class="eyebrow">MY DOSSIER</div><h1>Profile</h1><p>Edit your public identity across the university.</p></div>
    <div class="panel-card" style="max-width:640px;margin:auto">
      <div class="profile-head">${picBlock}<div><b style="font:500 22px var(--display);display:block">${esc(u.username)}</b><span style="font:17px var(--serif);color:#5a452a">${esc(u.guild || 'No guild set')}</span><div class="role-chips">${(u.roles || []).map(r => `<span class="role-chip">${esc(r)}</span>`).join('')}</div></div></div>
      <form onsubmit="updateProfile(event)">
        <div class="field"><label>Guild</label><input name="guild" value="${esc(u.guild || '')}"></div>
        <div class="field"><label>Profile picture</label><input type="file" accept="image/*" id="profile-pic-input"></div>
        <div class="field"><label>Description</label><textarea name="description">${esc(u.description || '')}</textarea></div>
        <button class="gold-button" style="width:100%">Save Profile</button>
      </form>
    </div>
  </section></main>`;
}

/* ---------------------------------------------------------
   BLOG (The Chronicle)
   --------------------------------------------------------- */
async function blogPage() {
  const published = await api('/api/blog');
  const posts = published.posts.map(p => `<article class="blog-post"><h2>${esc(p.title)}</h2><small>By ${esc(p.author)} · ${fmtTime(p.published_at)}</small><p>${esc(p.body)}</p></article>`).join('') || '<p style="font:19px var(--serif);color:#a08a63">No stories published yet.</p>';

  let writeSection = '';
  if (has('can_write_blog')) {
    const mine = await api('/api/blog/mine');
    const mineList = mine.posts.map(p => `<div class="request-row"><div class="top"><b>${esc(p.title)}</b>${statusBadge(p.status)}</div></div>`).join('') || '<p class="hint">You have not written anything yet.</p>';
    writeSection = `<div class="panel-card" style="margin-bottom:20px">
      <h2>Write a Post</h2>
      <form onsubmit="submitBlogPost(event)">
        <div class="field"><label>Title</label><input required name="title"></div>
        <div class="field"><label>Body</label><textarea required name="body" style="min-height:160px"></textarea></div>
        <button class="gold-button" style="width:100%">Submit for Review</button>
      </form>
      <h2 style="margin-top:20px">Your Submissions</h2>${mineList}
    </div>`;
  }

  let reviewSection = '';
  if (has('can_review_blog')) {
    const pending = await api('/api/blog/pending');
    const rows = pending.posts.map(p => `<div class="request-row">
      <div class="top"><b>${esc(p.title)}</b><span class="hint" style="margin:0">by ${esc(p.author)}</span></div>
      <p style="font:17px var(--serif);white-space:pre-wrap">${esc(p.body)}</p>
      <div class="actions"><button class="gold-button small" onclick="publishPost(${p.id})">Publish</button><button class="danger-btn" onclick="rejectPost(${p.id})">Reject</button></div>
    </div>`).join('') || '<p class="hint">Nothing awaiting review.</p>';
    reviewSection = `<div class="panel-card"><h2>Review Queue</h2>${rows}</div>`;
  }

  return `<main class="dark-page">${nav()}
  <section class="view">
    <div class="page-heading"><div class="eyebrow">EST. 2026</div><h1>The Chronicle</h1><p>News, stories, and dispatches from around the university.</p></div>
    <div class="portal-grid">
      <aside>${writeSection}${reviewSection}</aside>
      <div class="panel-card">${posts}</div>
    </div>
  </section></main>`;
}

/* ---------------------------------------------------------
   CAMPUS SECURITY (Detention)
   --------------------------------------------------------- */
async function detentionPage() {
  if (!has('can_issue_detention')) return forbiddenPanel('Department of Campus Security');
  const data = await api('/api/detention');
  const active = data.active.map(d => `<div class="request-row"><div class="top"><b>${esc(d.student_username)}</b><span class="hint" style="margin:0">issued by ${esc(d.issued_by_username || 'staff')}</span></div><p style="font:16px var(--serif)">${esc(d.reason || 'No reason given.')}</p><div class="actions"><button class="gold-button small" onclick="liftDetention(${d.id})">Lift Detention</button></div></div>`).join('') || '<p class="hint">No students currently in detention.</p>';
  const options = data.students.map(s => `<option value="${s.id}">${esc(s.username)}${s.detention_active ? ' (already in detention)' : ''}</option>`).join('');

  return `<main class="dark-page">${nav()}
  <section class="view">
    <div class="page-heading"><div class="eyebrow">DEPARTMENT OF</div><h1>Campus Security</h1><p>Detention blocks a student from Chat, the Gank Log, and the Bank.</p></div>
    <div class="portal-grid">
      <aside class="panel-card">
        <h2>Issue Detention</h2>
        <form onsubmit="issueDetention(event)">
          <div class="field"><label>Student</label><select required name="user_id">${options}</select></div>
          <div class="field"><label>Reason</label><input name="reason" placeholder="e.g. Spamming the Common Hall"></div>
          <button class="gold-button" style="width:100%">Issue Detention</button>
        </form>
      </aside>
      <div class="panel-card"><h2>Active Detentions</h2>${active}</div>
    </div>
  </section></main>`;
}

/* ---------------------------------------------------------
   ADMIN QUEUES
   --------------------------------------------------------- */
async function adminQueuesPage() {
  const canAdmissions = has('can_approve_admissions');
  const canUnits = has('can_manage_units');
  const canSettings = has('can_manage_settings');
  if (!canAdmissions && !canUnits && !canSettings) return forbiddenPanel('Admin Queues');

  if (state.adminQueueTab === 'admissions' && !canAdmissions) state.adminQueueTab = canUnits ? 'units' : 'settings';
  if (state.adminQueueTab === 'units' && !canUnits) state.adminQueueTab = canAdmissions ? 'admissions' : 'settings';
  if (state.adminQueueTab === 'settings' && !canSettings) state.adminQueueTab = canAdmissions ? 'admissions' : 'units';

  let body = '';
  if (state.adminQueueTab === 'admissions' && canAdmissions) {
    const data = await api('/api/admin/admission-requests');
    body = data.requests.map(r => `<div class="request-row">
      <div class="top"><b>${esc(r.desired_username)}</b>${statusBadge(r.status)}</div>
      <p style="font:16px var(--serif);margin:6px 0">${r.roblox_link ? `<a href="${esc(r.roblox_link)}" target="_blank">Roblox profile ↗</a><br>` : ''}${esc(r.note || 'No note.')}</p>
      <small class="hint">Requested ${fmtTime(r.created_at)}</small>
      ${r.status === 'pending' ? `<div class="actions"><button class="gold-button small" onclick="decideAdmission(${r.id},'approve')">Approve (payment confirmed)</button><button class="danger-btn" onclick="decideAdmission(${r.id},'deny')">Deny</button></div>` : ''}
    </div>`).join('') || '<p class="hint">No admission requests yet.</p>';
  } else if (state.adminQueueTab === 'units' && canUnits) {
    const data = await api('/api/admin/unit-requests');
    body = data.requests.map(r => `<div class="request-row">
      <div class="top"><b>${esc(r.username)}</b>${statusBadge(r.status)}</div>
      <p style="font:16px var(--serif);margin:6px 0">Requesting <b>${r.requested_units}</b> additional units.</p>
      <small class="hint">Requested ${fmtTime(r.created_at)}</small>
      ${r.status === 'pending' ? `<div class="actions"><button class="gold-button small" onclick="decideUnitRequest(${r.id},'approve')">Approve</button><button class="danger-btn" onclick="decideUnitRequest(${r.id},'deny')">Deny</button></div>` : ''}
    </div>`).join('') || '<p class="hint">No unit requests yet.</p>';
  } else if (state.adminQueueTab === 'settings' && canSettings) {
    const data = await api('/api/admin/settings');
    const fee = data.settings.find(s => s.key === 'application_fee_moonseyes')?.value || '1';
    body = `<div class="panel-card"><h2>Application Fee</h2><form onsubmit="updateFee(event)"><div class="field"><label>Moonseyes required to apply</label><input name="fee" type="number" min="0" value="${esc(fee)}"></div><button class="gold-button">Save</button></form></div>`;
  }

  return `<main class="dark-page">${nav()}
  <section class="view">
    <div class="page-heading"><div class="eyebrow">FOR STAFF EYES ONLY</div><h1>Admin Queues</h1><p>Financial-adjacent approvals live here, kept separate from day-to-day staff business.</p></div>
    <div class="queue-tabs">
      ${canAdmissions ? `<button class="${state.adminQueueTab === 'admissions' ? 'active' : ''}" onclick="setQueueTab('admissions')">Admission Requests</button>` : ''}
      ${canUnits ? `<button class="${state.adminQueueTab === 'units' ? 'active' : ''}" onclick="setQueueTab('units')">Unit Requests</button>` : ''}
      ${canSettings ? `<button class="${state.adminQueueTab === 'settings' ? 'active' : ''}" onclick="setQueueTab('settings')">Settings</button>` : ''}
    </div>
    <div class="panel-card">${body}</div>
  </section></main>`;
}
function setQueueTab(t) { state.adminQueueTab = t; render(); }

/* ---------------------------------------------------------
   ROLES & USERS
   --------------------------------------------------------- */
async function rolesUsersPage() {
  const canManageUsers = has('can_manage_users');
  const canAssign = has('can_assign_roles');
  const canCreateRoles = has('can_create_roles');
  if (!canManageUsers && !canAssign && !canCreateRoles) return forbiddenPanel('Roles & Users');

  const rolesData = await api('/api/roles');
  const roleOptions = rolesData.roles.map(r => `<option value="${r.id}">${esc(r.name)} (${esc(r.tier)})</option>`).join('');

  let usersSection = '';
  if (canManageUsers) {
    const usersData = await api('/api/users');
    usersSection = `<div class="panel-card">
      <h2>All Accounts</h2>
      ${usersData.users.map(u => `<div class="user-row">
        <div class="who"><b>${esc(u.username)}</b>${esc(u.guild || '—')} · ${u.unit_cap} unit cap${u.detention_active ? ' · <span class="pill warn">DETENTION</span>' : ''}
          <div class="role-chips">${u.roles.map(r => `<span class="role-chip">${esc(r.name)}${canAssign ? `<button onclick="removeRole(${u.id},${r.id})" title="Remove role">×</button>` : ''}</span>`).join('') || '<span class="hint" style="margin:0">no roles</span>'}</div>
        </div>
        ${canAssign ? `<form style="display:flex;gap:8px" onsubmit="addRole(event,${u.id})"><select name="role_id" style="min-width:170px">${roleOptions}</select><button class="gold-button small">Add Role</button></form>` : ''}
      </div>`).join('')}
    </div>
    <div class="panel-card" style="margin-top:18px">
      <h2>Create Staff Account</h2>
      <form onsubmit="createStaffAccount(event)">
        <div class="field"><label>Username</label><input required name="username"></div>
        <div class="field"><label>Temporary password</label><input required name="password" type="password"></div>
        <div class="field"><label>Guild</label><input name="guild"></div>
        <div class="field"><label>Initial role</label><select name="role_id">${roleOptions}</select></div>
        <button class="gold-button" style="width:100%">Create Account</button>
      </form>
    </div>`;
  }

  let rolesSection = '';
  if (canCreateRoles) {
    const permsList = rolesData.allowedPermissions;
    const tiersList = rolesData.allowedTiers;
    rolesSection = `<div class="panel-card">
      <h2>Existing Roles</h2>
      ${rolesData.roles.map(r => `<div class="user-row"><div class="who"><b>${esc(r.name)}</b>tier: ${esc(r.tier)}${r.system ? ' · built-in' : ' · custom'}<div class="role-chips">${Object.keys(r.permissions).map(p => `<span class="role-chip">${p.replace('can_', '').replace(/_/g, ' ')}</span>`).join('') || '<span class="hint" style="margin:0">no special permissions</span>'}</div></div></div>`).join('')}
    </div>
    <div class="panel-card" style="margin-top:18px">
      <h2>Create a New Role</h2>
      <form onsubmit="createRole(event)">
        <div class="field"><label>Role name</label><input required name="name" placeholder="e.g. Head Proctor"></div>
        <div class="field"><label>Power tier (for hierarchy — highest tier held wins)</label><select name="tier">${tiersList.map(t => `<option value="${t}">${t.replace('_', ' ')}</option>`).join('')}</select></div>
        <label style="font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#5a452a">Powers granted</label>
        <div class="perm-grid">${permsList.map(p => `<label><input type="checkbox" name="perm_${p}">${p.replace('can_', '').replace(/_/g, ' ')}</label>`).join('')}</div>
        <button class="gold-button" style="width:100%">Create Role</button>
      </form>
    </div>`;
  }

  return `<main class="dark-page">${nav()}
  <section class="view">
    <div class="page-heading"><div class="eyebrow">OFFICE OF THE DEAN</div><h1>Roles &amp; Users</h1><p>Assign staff positions and shape what each one can do. Highest tier held always wins.</p></div>
    <div class="portal-grid">${usersSection || '<div></div>'}${rolesSection ? `<div>${rolesSection}</div>` : '<div></div>'}</div>
  </section></main>`;
}

/* ---------------------------------------------------------
   MODALS
   --------------------------------------------------------- */
function authTab(t) { state.authTab = t; render(); }

function modal() {
  if (!state.modal) return '';
  let content = '';
  const err = state.errorMsg ? `<p class="error-box">${esc(state.errorMsg)}</p>` : '';

  if (state.modal === 'auth') {
    content = `<h2>Office of the Registrar</h2>
    <div class="tabs">
      <button class="${state.authTab === 'login' ? 'active' : ''}" onclick="authTab('login')">Sign In</button>
      <button class="${state.authTab !== 'login' ? 'active' : ''}" onclick="authTab('apply')">Request Admission</button>
    </div>
    ${err}
    ${state.authTab === 'login' ? `<form onsubmit="doLogin(event)"><div class="field"><label>Username</label><input required name="username"></div><div class="field"><label>Password</label><input required type="password" name="password"></div><button class="gold-button" style="width:100%">Sign In</button></form>` : `
    <p class="hint">A one-time intake fee of <b>${esc(state.cache.fee || '1')} moonseye(s)</b> is required in-game. Submit this form, send the moonseye(s) as directed in-game, and a staff member will confirm it before your account activates.</p>
    <form onsubmit="doRequestAdmission(event)">
      <div class="field"><label>Desired username</label><input required name="desired_username"></div>
      <div class="field"><label>Roblox profile link</label><input name="roblox_link" type="url" placeholder="https://roblox.com/users/..."></div>
      <div class="field"><label>Password</label><input required type="password" name="password"></div>
      <div class="field"><label>Confirm password</label><input required type="password" name="confirm"></div>
      <div class="field"><label>Note to staff (optional)</label><input name="note"></div>
      <button class="gold-button" style="width:100%">Submit Request</button>
    </form>`}`;
  }

  if (state.modal === 'checkstatus') {
    content = `<h2>Check Request Status</h2>${err}<form onsubmit="doCheckStatus(event)"><div class="field"><label>Username you requested</label><input required name="username"></div><button class="gold-button" style="width:100%">Check Status</button></form><div id="status-result"></div>`;
  }

  if (state.modal === 'apply') content = `<h2>Application for Admission</h2>${err}<form onsubmit="submitApp(event)">
    <div class="field"><label>Full name</label><input required name="name"></div>
    <div class="field"><label>Guild</label><input required name="guild"></div>
    <div class="field"><label>Roblox profile link</label><input required type="url" name="roblox" placeholder="https://roblox.com/users/..."></div>
    <div class="field"><label>Role desired</label><select name="role"><option>Frontline</option><option>Support</option><option>Assassin</option><option>Flex</option><option>Shotcaller</option><option>Other</option></select></div>
    <div class="field"><label>Weapon class</label><select name="weapon"><option>Light</option><option>Medium</option><option>Heavy</option></select></div>
    <div class="field"><label>Weapon specialization</label><input required name="special" placeholder="e.g. Club, Rapier, Greataxe"></div>
    <div class="field"><label>Top ELO</label><input required name="elo" type="number"></div>
    <div class="field"><label>Online level (1–5)</label><select name="online">${[1, 2, 3, 4, 5].map(x => `<option>${x}</option>`).join('')}</select></div>
    <div class="field"><label>Talent, aspect, oath, or culture</label><textarea name="culture" required></textarea></div>
    <div class="field"><label>3 Ts or 7 Ts to the original Tung Sahur?</label><input required name="bonus"></div>
    <div style="display:flex;gap:10px"><button type="submit" class="gold-button" style="flex:1" formnovalidate onclick="this.form.dataset.submit='0'">Save Draft</button><button type="submit" class="gold-button" style="flex:1" onclick="this.form.dataset.submit='1'">Submit</button></div>
    </form>`;

  if (state.modal === 'boardEdit') {
    const x = state.cache.boardSlot || {};
    const users = state.cache.assignableUsers || [];
    const userOptions = users.map(u => `<option value="${u.id}" ${x.user_id === u.id ? 'selected' : ''} ${u.existing_slot_id && u.existing_slot_id !== x.id ? 'disabled' : ''}>${esc(u.username)}${u.existing_slot_id && u.existing_slot_id !== x.id ? ' (already placed)' : ''}</option>`).join('');
    content = `<h2>Admissions Slot</h2>${err}
      <p class="hint">Linking this slot to a real account is what admits them — it unlocks their chat, gank log, bank, yearbook, schedule, and gradebook access. A manual name with no linked account is just cosmetic.</p>
      <form onsubmit="saveSlot(event)">
      <div class="field"><label>Link to an account (grants access)</label><select name="user_id"><option value="">— none, manual entry only —</option>${userOptions}</select></div>
      <div class="field"><label>Manual name (only used if no account is linked above)</label><input name="name" value="${esc(x.user_id ? '' : (x.name || ''))}"></div>
      <div class="field"><label>Guild</label><input name="guild" value="${esc(x.guild || '')}"></div>
      <div class="field"><label>Optional note</label><input name="note" value="${esc(x.note || '')}"></div>
      <button class="gold-button" style="width:100%">Save Candidate</button></form>
      ${x.name ? '<button class="admin-access" onclick="clearSlot()">Clear this slot</button>' : ''}`;
  }

  if (state.modal === 'unitrequest') content = `<h2>Request More Units</h2>${err}<p class="hint">Sent to the Admin queue for approval.</p><form onsubmit="requestUnits(event)"><div class="field"><label>Additional units requested</label><input required type="number" name="requested_units" min="1" value="3"></div><button class="gold-button" style="width:100%">Submit Request</button></form>`;

  if (state.modal === 'terms') content = `<h2>Terms of Service</h2><p style="font:19px/1.35 var(--serif)">This fan-made admissions portal is a prototype for a Deepwoken guild community. Do not submit sensitive personal information. Be respectful when reviewing applicants or chatting; harassment, abuse, or impersonation is not permitted. University staff may moderate submissions, comments, and accounts, and may issue detention for conduct violations.</p>`;

  return `<div class="modal" onclick="if(event.target===this)closeModal()"><div class="modal-box"><button class="close" onclick="closeModal()">×</button>${content}</div></div>`;
}

/* ---------------------------------------------------------
   RENDER / ROUTING
   --------------------------------------------------------- */
async function render() {
  let out;
  try {
    switch (state.view) {
      case 'home': out = home(); break;
      case 'applications': out = await applications(); break;
      case 'detail': out = await applicationDetail(state.detailAppId); break;
      case 'board': out = await board(); break;
      case 'chat': out = await chatPage(); break;
      case 'gank': out = await feedPage('gank'); break;
      case 'bank': out = await feedPage('bank'); break;
      case 'yearbook': out = await yearbookPage(); break;
      case 'schedule': out = await schedulePage(); break;
      case 'gradebook': out = await gradebookPage(); break;
      case 'profile': out = await profilePage(); break;
      case 'blog': out = await blogPage(); break;
      case 'detention': out = await detentionPage(); break;
      case 'adminqueues': out = await adminQueuesPage(); break;
      case 'rolesusers': out = await rolesUsersPage(); break;
      default: out = home();
    }
  } catch (err) {
    out = `<main class="dark-page">${nav()}<section class="view"><div class="locked-panel"><span class="eyebrow">SOMETHING WENT WRONG</span><h1 style="font:500 26px var(--display)">${esc(err.message)}</h1><button class="gold-button" onclick="go('home')">Return Home</button></div></section></main>`;
  }
  $('#app').innerHTML = out + modal();
}

/* ---------------------------------------------------------
   AUTH handlers
   --------------------------------------------------------- */
async function doLogin(e) {
  e.preventDefault();
  const d = Object.fromEntries(new FormData(e.target));
  try {
    await api('/api/auth/login', { method: 'POST', body: d });
    await refreshMe();
    state.modal = null;
    go(state.me && state.me.tier === 'student' ? 'schedule' : 'home');
  } catch (err) { showError(err); }
}

async function doRequestAdmission(e) {
  e.preventDefault();
  const d = Object.fromEntries(new FormData(e.target));
  if (d.password !== d.confirm) return showError(new Error('Passwords do not match.'));
  try {
    const result = await api('/api/auth/request-admission', { method: 'POST', body: d });
    state.modal = null;
    alert(result.message);
    render();
  } catch (err) { showError(err); }
}

async function doCheckStatus(e) {
  e.preventDefault();
  const d = Object.fromEntries(new FormData(e.target));
  try {
    const result = await api(`/api/auth/request-status/${encodeURIComponent(d.username)}`);
    $('#status-result').innerHTML = `<p class="info-box">Status: ${statusBadge(result.request.status)}</p>`;
  } catch (err) { showError(err); }
}

async function logout() { await api('/api/auth/logout', { method: 'POST' }); await refreshMe(); go('home'); }

/* ---------------------------------------------------------
   APPLICATIONS handlers
   --------------------------------------------------------- */
async function submitApp(e) {
  e.preventDefault();
  const submit = e.target.dataset.submit !== '0';
  const d = Object.fromEntries(new FormData(e.target));
  delete d.submit;
  try {
    await api('/api/applications/mine/current', { method: 'PUT', body: { ...d, submit } });
    state.modal = null;
    go('applications');
  } catch (err) { showError(err); }
}
function showApp(id) { state.detailAppId = id; go('detail'); }
async function rateApp(id, n) { try { await api(`/api/applications/${id}/ratings`, { method: 'POST', body: { rating: n } }); render(); } catch (err) { showError(err); } }
async function postComment(id) {
  const input = $('#comment-input');
  const body = input.value.trim();
  if (!body) return;
  try { await api(`/api/applications/${id}/comments`, { method: 'POST', body: { body } }); render(); } catch (err) { showError(err); }
}

/* ---------------------------------------------------------
   ADMISSIONS BOARD handlers
   --------------------------------------------------------- */
async function revealSlot(id) { try { await api(`/api/board/${id}/reveal`, { method: 'POST' }); render(); } catch (err) { /* nothing to reveal — ignore quietly */ } }
async function openBoardEdit(id) {
  const data = await api('/api/board');
  state.cache.boardSlot = data.slots.find(s => s.id === id) || {};
  state.cache.boardSlotId = id;
  try { state.cache.assignableUsers = (await api('/api/board/assignable-users')).users; } catch (e) { state.cache.assignableUsers = []; }
  openModal('boardEdit');
}
async function saveSlot(e) {
  e.preventDefault();
  const d = Object.fromEntries(new FormData(e.target));
  if (d.user_id === '') delete d.user_id; else d.user_id = Number(d.user_id);
  try { await api(`/api/board/${state.cache.boardSlotId}/edit`, { method: 'POST', body: d }); state.modal = null; go('board'); } catch (err) { showError(err); }
}
async function clearSlot() {
  try { await api(`/api/board/${state.cache.boardSlotId}/clear`, { method: 'POST' }); state.modal = null; go('board'); } catch (err) { showError(err); }
}
async function addSlot() { try { await api('/api/board/add-slot', { method: 'POST' }); render(); } catch (err) { showError(err); } }

/* ---------------------------------------------------------
   CHAT handlers
   --------------------------------------------------------- */
async function postChat(e) {
  e.preventDefault();
  const input = $('#chat-input');
  const body = input.value.trim();
  if (!body) return;
  try { await api('/api/chat', { method: 'POST', body: { body } }); render(); } catch (err) { showError(err); }
}
async function deleteChatMessage(id) {
  if (!confirm('Delete this message?')) return;
  try { await api(`/api/chat/${id}`, { method: 'DELETE' }); render(); } catch (err) { showError(err); }
}

/* ---------------------------------------------------------
   FEED (Gank Log / Bank) handlers
   --------------------------------------------------------- */
async function submitFeed(e, kind) {
  e.preventDefault();
  const d = Object.fromEntries(new FormData(e.target));
  try {
    const fileInput = $(`#${kind}-img`);
    const img = fileInput && fileInput.files[0] ? await readImageAsDataURL(fileInput.files[0], 2) : null;
    await api(`/api/feed/${kind}`, { method: 'POST', body: { ...d, img } });
    render();
  } catch (err) { showError(err); }
}

/* ---------------------------------------------------------
   YEARBOOK handlers
   --------------------------------------------------------- */
async function submitVote(e, categoryId) {
  e.preventDefault();
  const nominee = new FormData(e.target).get('nominee');
  try { await api(`/api/yearbook/${categoryId}/vote`, { method: 'POST', body: { nominee } }); render(); } catch (err) { showError(err); }
}

/* ---------------------------------------------------------
   SCHEDULE / CLASSES handlers
   --------------------------------------------------------- */
async function createClass(e) {
  e.preventDefault();
  const d = Object.fromEntries(new FormData(e.target));
  try { await api('/api/classes', { method: 'POST', body: d }); render(); } catch (err) { showError(err); }
}
async function deleteClass(id) { try { await api(`/api/classes/${id}`, { method: 'DELETE' }); render(); } catch (err) { showError(err); } }
async function joinClass(id) { try { await api(`/api/classes/${id}/enroll`, { method: 'POST' }); render(); } catch (err) { alert(err.message); } }
async function dropClass(id) { try { await api(`/api/classes/${id}/drop`, { method: 'POST' }); render(); } catch (err) { showError(err); } }

/* ---------------------------------------------------------
   GRADEBOOK handlers
   --------------------------------------------------------- */
async function setGrade(classId, userId, grade) { try { await api(`/api/classes/${classId}/grade`, { method: 'POST', body: { user_id: userId, grade } }); } catch (err) { alert(err.message); } }

/* ---------------------------------------------------------
   PROFILE handlers
   --------------------------------------------------------- */
async function updateProfile(e) {
  e.preventDefault();
  const d = Object.fromEntries(new FormData(e.target));
  try {
    const fileInput = $('#profile-pic-input');
    const pic = fileInput && fileInput.files[0] ? await readImageAsDataURL(fileInput.files[0], 1.5) : null;
    await api('/api/users/me', { method: 'PATCH', body: { guild: d.guild, description: d.description, pic } });
    await refreshMe();
    render();
  } catch (err) { showError(err); }
}

/* ---------------------------------------------------------
   BLOG handlers
   --------------------------------------------------------- */
async function submitBlogPost(e) {
  e.preventDefault();
  const d = Object.fromEntries(new FormData(e.target));
  try { await api('/api/blog', { method: 'POST', body: d }); render(); } catch (err) { showError(err); }
}
async function publishPost(id) { try { await api(`/api/blog/${id}/publish`, { method: 'POST' }); render(); } catch (err) { showError(err); } }
async function rejectPost(id) { try { await api(`/api/blog/${id}/reject`, { method: 'POST' }); render(); } catch (err) { showError(err); } }

/* ---------------------------------------------------------
   DETENTION handlers
   --------------------------------------------------------- */
async function issueDetention(e) {
  e.preventDefault();
  const d = Object.fromEntries(new FormData(e.target));
  try { await api('/api/detention/issue', { method: 'POST', body: d }); render(); } catch (err) { showError(err); }
}
async function liftDetention(id) { try { await api(`/api/detention/${id}/lift`, { method: 'POST' }); render(); } catch (err) { showError(err); } }

/* ---------------------------------------------------------
   ADMIN QUEUES handlers
   --------------------------------------------------------- */
async function decideAdmission(id, action) { try { await api(`/api/admin/admission-requests/${id}/${action}`, { method: 'POST' }); render(); } catch (err) { showError(err); } }
async function decideUnitRequest(id, action) { try { await api(`/api/admin/unit-requests/${id}/${action}`, { method: 'POST' }); render(); } catch (err) { showError(err); } }
async function updateFee(e) {
  e.preventDefault();
  const fee = new FormData(e.target).get('fee');
  try { await api('/api/admin/settings', { method: 'POST', body: { key: 'application_fee_moonseyes', value: fee } }); render(); } catch (err) { showError(err); }
}
async function requestUnits(e) {
  e.preventDefault();
  const requested_units = Number(new FormData(e.target).get('requested_units'));
  try { await api('/api/units/request', { method: 'POST', body: { requested_units } }); state.modal = null; alert('Request sent to the Admin Queue.'); render(); } catch (err) { showError(err); }
}

/* ---------------------------------------------------------
   ROLES & USERS handlers
   --------------------------------------------------------- */
async function addRole(e, userId) {
  e.preventDefault();
  const role_id = Number(new FormData(e.target).get('role_id'));
  try { await api(`/api/users/${userId}/roles`, { method: 'POST', body: { role_id, action: 'add' } }); render(); } catch (err) { showError(err); }
}
async function removeRole(userId, roleId) { try { await api(`/api/users/${userId}/roles`, { method: 'POST', body: { role_id: roleId, action: 'remove' } }); render(); } catch (err) { showError(err); } }
async function createStaffAccount(e) {
  e.preventDefault();
  const d = Object.fromEntries(new FormData(e.target));
  try { await api('/api/users', { method: 'POST', body: d }); render(); } catch (err) { showError(err); }
}
async function createRole(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  const name = fd.get('name');
  const tier = fd.get('tier');
  const permissions = {};
  for (const [k, v] of fd.entries()) if (k.startsWith('perm_') && v) permissions[k.replace('perm_', '')] = true;
  try { await api('/api/roles', { method: 'POST', body: { name, tier, permissions } }); render(); } catch (err) { showError(err); }
}

/* ---------------------------------------------------------
   INIT
   --------------------------------------------------------- */
(async function boot() {
  try { await refreshMe(); } catch (e) { state.me = null; }
  render();
})();
