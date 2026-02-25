/* ================================================================
   THE GRAND STAND  —  app.js
   ================================================================ */

// ─── CONFIG ──────────────────────────────────────────────────────
const FIREBASE_CONFIG = {
  apiKey:            'AIzaSyCPXaN4rH0180t0kBoXD6jx3Zns59r6EyA',
  authDomain:        'the-grand-stand.firebaseapp.com',
  projectId:         'the-grand-stand',
  storageBucket:     'the-grand-stand.firebasestorage.app',
  messagingSenderId: '808564702299',
  appId:             '1:808564702299:web:e494000f0d256f8a6f137e',
};
const ADMIN_PASSWORD   = 'majors2026'; // ← change!
const SALARY_CAP       = 100;
const MAX_PICKS        = 5;
const COMMISSIONER     = {
  name:   'Rudy',
  venmo:  'rudygiljr',
  paypal: 'rudygiljr@gmail.com',
};

// ─── MAJOR META ──────────────────────────────────────────────────
const MAJOR_META = {
  masters:  { label: 'The Masters',            icon: '⛳', cls: 'masters' },
  pga:      { label: 'PGA Championship',       icon: '🏆', cls: 'pga'    },
  us_open:  { label: 'U.S. Open',              icon: '🦅', cls: 'us_open'},
  open:     { label: 'The Open Championship',  icon: '⚓', cls: 'open'   },
};

// ─── SALARY & SCORING ────────────────────────────────────────────
function getSalary(rank) {
  if (!rank || rank <= 0) return 10;
  if (rank <= 5)  return 30;
  if (rank <= 15) return 25;
  if (rank <= 30) return 20;
  if (rank <= 50) return 15;
  return 10;
}

function salaryCls(salary) {
  return { 30:'t30', 25:'t25', 20:'t20', 15:'t15', 10:'t10' }[salary] || 't10';
}

function getPoints(pos) {
  if (!pos || pos === 0) return 0;
  if (pos === 99 || pos === 98) return 0;
  const exact = {1:100,2:90,3:80,4:72,5:65,6:59,7:54,8:50,9:46,10:43};
  if (exact[pos] !== undefined) return exact[pos];
  if (pos <= 15) return 38;
  if (pos <= 20) return 33;
  if (pos <= 25) return 28;
  if (pos <= 30) return 24;
  if (pos <= 40) return 20;
  if (pos <= 50) return 15;
  return 10;
}

function formatPos(pos) {
  if (!pos) return '—';
  if (pos === 99) return 'MC';
  if (pos === 98) return 'WD';
  const s = pos === 1 ? 'st' : pos === 2 ? 'nd' : pos === 3 ? 'rd' : 'th';
  return pos + s;
}

function initials(name = '') {
  return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
}

function fmtDate(d) {
  if (!d) return '';
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─── FIREBASE ────────────────────────────────────────────────────
firebase.initializeApp(FIREBASE_CONFIG);
const db         = firebase.firestore();
const auth       = firebase.auth();
const FieldValue = firebase.firestore.FieldValue;
const googleProvider = new firebase.auth.GoogleAuthProvider();

// ─── STATE ───────────────────────────────────────────────────────
const state = {
  view: 'home',
  tournaments: [],
  currentTournamentId: null,
  players: [],
  entries: [],
  picks: [],
  adminAuth: false,
  adminTab: 'tournaments',
  adminTournamentId: null,
  filterTier: 'all',
  filterSearch: '',
  currentUser: null,
  userProfile: null,
};

// ─── DOM HELPERS ─────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const app = () => $('app');

function setLoading(on) {
  $('loading-overlay').classList.toggle('hidden', !on);
}

let toastTimer;
function showToast(msg, type = '') {
  const el = $('toast');
  el.textContent = msg;
  el.className = `toast show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'toast hidden'; }, 3000);
}

function showModal(id) { $(id).classList.remove('hidden'); }
function hideModal(id) { $(id).classList.add('hidden'); }

let confirmCallback = null;
function confirm(title, msg, cb) {
  $('confirm-title').textContent = title;
  $('confirm-msg').textContent   = msg;
  confirmCallback = cb;
  showModal('modal-confirm');
}

// ─── AUTH ─────────────────────────────────────────────────────────
async function signIn() {
  try {
    await auth.signInWithPopup(googleProvider);
  } catch (e) {
    if (e.code !== 'auth/popup-closed-by-user') showToast('Sign in failed', 'error');
  }
}

async function signOut() {
  await auth.signOut();
  state.currentUser  = null;
  state.userProfile  = null;
  updateAuthUI();
  navigate('home');
}

async function ensureUserProfile(user) {
  const ref = db.collection('users').doc(user.uid);
  const doc = await ref.get();
  if (!doc.exists) {
    const profile = {
      displayName: user.displayName || '',
      email:       user.email || '',
      photoURL:    user.photoURL || '',
      venmo:       '',
      paypal:      '',
      createdAt:   FieldValue.serverTimestamp(),
    };
    await ref.set(profile);
    state.userProfile = { id: user.uid, ...profile };
  } else {
    state.userProfile = { id: user.uid, ...doc.data() };
  }
}

async function saveProfile(displayName, venmo, paypal) {
  if (!state.currentUser) return;
  await db.collection('users').doc(state.currentUser.uid).update({ displayName, venmo, paypal });
  state.userProfile = { ...state.userProfile, displayName, venmo, paypal };
}

function updateAuthUI() {
  const el = $('header-auth');
  if (!el) return;
  if (state.currentUser && state.userProfile) {
    const photo = state.userProfile.photoURL || state.currentUser.photoURL || '';
    const name  = state.userProfile.displayName || state.currentUser.displayName || 'You';
    const avatar = photo
      ? `<img class="user-avatar-sm" src="${photo}" alt="${name}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><div class="user-initials-sm" style="display:none">${initials(name)}</div>`
      : `<div class="user-initials-sm">${initials(name)}</div>`;
    el.innerHTML = `
      <div class="user-menu" onclick="this.classList.toggle('open')">
        ${avatar}
        <span class="user-name-sm">${name.split(' ')[0]}</span>
        <div class="user-dropdown">
          <button onclick="navigate('mypicks')">🏌️ My Picks</button>
          <button onclick="openProfileModal()">✏️ Edit Profile</button>
          <button onclick="signOut()">Sign Out</button>
        </div>
      </div>`;
  } else {
    el.innerHTML = `
      <button class="btn btn-google btn-sm" onclick="signIn()">
        <svg class="google-icon" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
        Sign In
      </button>`;
  }
}

function openProfileModal() {
  if (!state.userProfile) return;
  const photo = state.userProfile.photoURL || state.currentUser?.photoURL || '';
  const name  = state.userProfile.displayName || '';
  $('profile-avatar-row').innerHTML = `
    ${photo ? `<img class="profile-avatar-lg" src="${photo}" alt="${name}">` : `<div class="profile-initials-lg">${initials(name)}</div>`}
    <div class="profile-info-sm"><strong>${name || 'Set your display name'}</strong>${state.currentUser?.email || ''}</div>`;
  $('profile-name').value   = name;
  $('profile-venmo').value  = state.userProfile.venmo  || '';
  $('profile-paypal').value = state.userProfile.paypal || '';
  showModal('modal-profile');
}

// ─── NAVIGATION ──────────────────────────────────────────────────
function navigate(view, params = {}) {
  state.view = view;
  document.querySelectorAll('.nav-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.view === view);
  });
  if (view === 'picks' && params.tournamentId) {
    state.currentTournamentId = params.tournamentId;
    state.picks = [];
    state.filterTier = 'all';
    state.filterSearch = '';
  }
  if (view === 'leaderboard' && params.tournamentId) {
    state.currentTournamentId = params.tournamentId;
  }
  render();
}

// ─── DATA LAYER ──────────────────────────────────────────────────
async function loadTournaments() {
  const snap = await db.collection('tournaments').get();
  state.tournaments = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.start_date || '').localeCompare(b.start_date || ''));
  return state.tournaments;
}

async function loadPlayers(tournamentId) {
  const snap = await db.collection('players')
    .where('tournament_id', '==', tournamentId).get();
  state.players = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.world_rank || 999) - (b.world_rank || 999));
  return state.players;
}

async function loadEntries(tournamentId) {
  const snap = await db.collection('entries')
    .where('tournament_id', '==', tournamentId).get();
  state.entries = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => b.total_points - a.total_points);
  return state.entries;
}

async function loadAllUsers() {
  const snap = await db.collection('users').get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function submitEntry(tournamentId, personName, playerIds, totalSalary) {
  const ref = await db.collection('entries').add({
    tournament_id: tournamentId,
    person_name:   personName,
    user_id:       state.currentUser?.uid || null,
    total_salary:  totalSalary,
    total_points:  0,
    player_ids:    playerIds,
    submitted_at:  FieldValue.serverTimestamp(),
  });
  return { id: ref.id };
}

async function savePlayer(playerData) {
  if (playerData.id) {
    const { id, ...rest } = playerData;
    await db.collection('players').doc(id).update(rest);
  } else {
    await db.collection('players').add(playerData);
  }
}

async function deletePlayer(playerId) {
  await db.collection('players').doc(playerId).delete();
}

async function saveTournament(data) {
  if (data.id) {
    const { id, ...rest } = data;
    await db.collection('tournaments').doc(id).update(rest);
  } else {
    await db.collection('tournaments').add(data);
  }
}

async function deleteTournament(id) {
  const [ps, es] = await Promise.all([
    db.collection('players').where('tournament_id', '==', id).get(),
    db.collection('entries').where('tournament_id', '==', id).get(),
  ]);
  const batch = db.batch();
  ps.docs.forEach(d => batch.delete(d.ref));
  es.docs.forEach(d => batch.delete(d.ref));
  batch.delete(db.collection('tournaments').doc(id));
  await batch.commit();
}

async function deleteEntry(id) {
  await db.collection('entries').doc(id).delete();
}

async function saveResults(updates) {
  const batch = db.batch();
  for (const u of updates) {
    batch.update(db.collection('players').doc(u.id), {
      finish_position: u.finish_position !== null ? u.finish_position : null,
      points: u.points,
    });
  }
  await batch.commit();
  await recalcEntryPoints(state.adminTournamentId);
}

async function recalcEntryPoints(tournamentId) {
  const [entrySnap, playerSnap] = await Promise.all([
    db.collection('entries').where('tournament_id', '==', tournamentId).get(),
    db.collection('players').where('tournament_id', '==', tournamentId).get(),
  ]);
  const pointsMap = {};
  playerSnap.docs.forEach(d => { pointsMap[d.id] = d.data().points || 0; });
  const batch = db.batch();
  entrySnap.docs.forEach(d => {
    const total = (d.data().player_ids || []).reduce((s, pid) => s + (pointsMap[pid] || 0), 0);
    batch.update(d.ref, { total_points: total });
  });
  await batch.commit();
}

// ─── API FETCHERS ────────────────────────────────────────────────
async function fetchOWGRRankings(count = 200) {
  const resp = await fetch(`/.netlify/functions/rankings?count=${count}`);
  if (!resp.ok) throw new Error('OWGR fetch failed');
  return resp.json();
}

async function fetchESPNScoreboard() {
  const resp = await fetch('/.netlify/functions/tournament?type=scoreboard');
  if (!resp.ok) throw new Error('ESPN fetch failed');
  return resp.json();
}

async function fetchESPNSummary(eventId) {
  const resp = await fetch(`/.netlify/functions/tournament?type=summary&eventId=${eventId}`);
  if (!resp.ok) throw new Error('ESPN fetch failed');
  return resp.json();
}

// ─── MAIN RENDER ─────────────────────────────────────────────────
async function render() {
  setLoading(true);
  try {
    await loadTournaments();
    if      (state.view === 'home')        renderHome();
    else if (state.view === 'picks')       await renderPicksView();
    else if (state.view === 'leaderboard') await renderLeaderboardView();
    else if (state.view === 'money')       await renderMoneyPage();
    else if (state.view === 'mypicks')     await renderMyPicks();
    else if (state.view === 'admin')       await renderAdminView();
  } catch (e) {
    app().innerHTML = `<div class="empty-state"><span class="icon">⚠️</span>${e.message}</div>`;
    console.error(e);
  } finally {
    setLoading(false);
  }
}

// ─── HOME VIEW ───────────────────────────────────────────────────
function renderHome() {
  const cards = state.tournaments.map(t => {
    const m = MAJOR_META[t.major] || { label: t.name, icon: '⛳', cls: '' };
    const dates = t.start_date ? `${fmtDate(t.start_date)} – ${fmtDate(t.end_date)}` : 'Dates TBD';
    const statusLabels = { upcoming:'Upcoming', picks_open:'🟡 Picks Open', active:'Live', completed:'Final' };
    const canPick    = t.status === 'picks_open';
    const hasResults = t.status === 'active' || t.status === 'completed';

    return `
      <div class="major-card">
        <div class="major-card-banner ${m.cls}"></div>
        <div class="major-card-body">
          <div class="major-card-icon">${m.icon}</div>
          <div class="major-card-name">${t.name}</div>
          <div class="major-card-location">${t.location || ''}</div>
          <div class="major-card-dates">${dates}</div>
          <div class="status-badge ${t.status}">${statusLabels[t.status] || t.status}</div>
          <div class="major-card-actions">
            ${canPick    ? `<button class="btn btn-gold btn-sm" onclick="navigate('picks',{tournamentId:'${t.id}'})">Submit Picks</button>` : ''}
            ${hasResults ? `<button class="btn btn-primary btn-sm" onclick="navigate('leaderboard',{tournamentId:'${t.id}'})">Leaderboard</button>` : ''}
            ${t.status === 'picks_open' ? `<button class="btn btn-ghost btn-sm" onclick="navigate('leaderboard',{tournamentId:'${t.id}'})">View Picks</button>` : ''}
          </div>
        </div>
      </div>`;
  }).join('');

  app().innerHTML = `
    <div class="section-row" style="margin-bottom:1rem">
      <div>
        <h2 class="section-title">2026 Majors</h2>
        <p class="section-sub">Pick 5 players • $100 salary cap • Points by finish position</p>
      </div>
    </div>
    <div class="majors-grid">${cards || '<div class="loading-msg">No tournaments found.</div>'}</div>
    <div style="margin-top:1.5rem;padding:1rem;background:var(--white);border-radius:var(--radius);box-shadow:var(--shadow)">
      <div style="font-weight:700;font-size:.85rem;color:var(--gray-600);text-transform:uppercase;letter-spacing:.04em;margin-bottom:.6rem">Salary Tiers</div>
      <div style="display:flex;flex-wrap:wrap;gap:.5rem;font-size:.83rem">
        <span class="salary-tag t30">$30 — Rank 1–5</span>
        <span class="salary-tag t25">$25 — Rank 6–15</span>
        <span class="salary-tag t20">$20 — Rank 16–30</span>
        <span class="salary-tag t15">$15 — Rank 31–50</span>
        <span class="salary-tag t10">$10 — Rank 51+</span>
      </div>
      <div style="margin-top:.75rem;font-size:.8rem;color:var(--gray-500)">
        <strong>Scoring:</strong> 1st=100 · 2nd=90 · 3rd=80 · 4th=72 · 5th=65 · 6th=59 · 7th=54 · 8th=50 · 9th=46 · 10th=43 · T11–15=38 · T16–20=33 · T21–25=28 · T26–30=24 · T31–40=20 · T41–50=15 · 51+=10 · MC=0
      </div>
    </div>`;
}

// ─── PICKS VIEW ──────────────────────────────────────────────────
async function renderPicksView() {
  const t = state.tournaments.find(x => x.id === state.currentTournamentId);
  if (!t) { navigate('home'); return; }

  // Require sign in
  if (!state.currentUser) {
    app().innerHTML = `
      <button class="back-btn" onclick="navigate('home')">← Back to Majors</button>
      <div class="sign-in-prompt">
        <span class="icon">🏌️</span>
        <h2>Sign in to submit picks</h2>
        <p>Create a free account to submit your ${t.name} picks<br>and track your score on the leaderboard.</p>
        <button class="btn btn-google" onclick="signIn()">
          <svg class="google-icon" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
          Sign In with Google
        </button>
      </div>`;
    return;
  }

  await loadPlayers(t.id);

  const totalSalary = state.picks.reduce((s, p) => s + p.salary, 0);
  const remaining   = SALARY_CAP - totalSalary;
  const pct         = Math.min((totalSalary / SALARY_CAP) * 100, 100);
  const capCls      = totalSalary > SALARY_CAP ? 'over' : totalSalary > 80 ? 'near' : 'ok';
  const pickedIds   = new Set(state.picks.map(p => p.id));

  const search = (state.filterSearch || '').toLowerCase();
  let shown = state.players.filter(p => {
    if (state.filterTier !== 'all' && p.salary !== parseInt(state.filterTier)) return false;
    if (search && !p.name.toLowerCase().includes(search)) return false;
    return true;
  });

  const tierBtns = ['all','30','25','20','15','10'].map(t =>
    `<button class="tier-btn ${state.filterTier === t ? 'active' : ''}" onclick="setTier('${t}')">${t === 'all' ? 'All' : '$'+t}</button>`
  ).join('');

  const playerCards = shown.map(p => {
    const picked        = pickedIds.has(p.id);
    const wouldExceed   = !picked && (totalSalary + p.salary > SALARY_CAP);
    const maxed         = !picked && state.picks.length >= MAX_PICKS;
    const disabled      = (wouldExceed || maxed) && !picked;
    return `
      <div class="player-card ${picked ? 'selected' : ''} ${disabled ? 'disabled' : ''}">
        ${p.photo_url ? `<img class="player-avatar" src="${p.photo_url}" alt="${p.name}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">` : ''}
        <div class="player-initials" style="${p.photo_url ? 'display:none' : ''}">${initials(p.name)}</div>
        <div class="player-info">
          <div class="player-name">${p.name}</div>
          <div class="player-meta">${p.world_rank ? `<span class="player-rank-badge">WR #${p.world_rank}</span>` : ''}</div>
        </div>
        <span class="salary-tag ${salaryCls(p.salary)}">$${p.salary}</span>
        <button class="btn btn-sm ${picked ? 'btn-danger' : 'btn-primary'}" ${disabled ? 'disabled' : ''} onclick="togglePick('${p.id}')">
          ${picked ? '✓ Remove' : '+ Pick'}
        </button>
      </div>`;
  }).join('') || `<div class="empty-state"><span class="icon">🔍</span>No players match.</div>`;

  const sidebarItems = Array.from({ length: MAX_PICKS }, (_, i) => {
    const p = state.picks[i];
    if (p) return `
      <div class="sidebar-pick-item">
        <span class="sidebar-pick-name">${p.name}</span>
        <span class="sidebar-pick-salary">$${p.salary}</span>
        <button class="sidebar-pick-remove" onclick="togglePick('${p.id}')">×</button>
      </div>`;
    return `<div class="sidebar-pick-empty">Pick ${i+1}</div>`;
  }).join('');

  const canSubmit = state.picks.length === MAX_PICKS && totalSalary <= SALARY_CAP;

  app().innerHTML = `
    <button class="back-btn" onclick="navigate('home')">← Back to Majors</button>
    <div class="picks-header">
      <div class="picks-header-name">${t.name}</div>
      <div class="cap-display">
        <div class="cap-item"><div class="cap-label">Picks</div><div class="cap-value">${state.picks.length}/${MAX_PICKS}</div></div>
        <div class="cap-item"><div class="cap-label">Spent</div><div class="cap-value ${totalSalary > SALARY_CAP ? 'over' : ''}">$${totalSalary}</div></div>
        <div class="cap-item"><div class="cap-label">Left</div><div class="cap-value ${remaining < 0 ? 'over' : 'ok'}">$${remaining}</div></div>
      </div>
    </div>
    <div class="picks-layout">
      <div>
        <div class="filter-bar">
          <input type="text" id="search-input" placeholder="Search players…" value="${state.filterSearch}" oninput="setSearch(this.value)">
          <div class="tier-filter">${tierBtns}</div>
        </div>
        <div class="player-list">${playerCards}</div>
      </div>
      <div class="picks-sidebar">
        <div class="sidebar-title">Your Picks</div>
        <div class="sidebar-cap-bar"><div class="sidebar-cap-fill ${capCls}" style="width:${pct}%"></div></div>
        <div class="sidebar-picks-list">${sidebarItems}</div>
        <div class="sidebar-totals"><span>Total</span><strong>$${totalSalary} / $${SALARY_CAP}</strong></div>
        <button class="btn btn-gold btn-full" onclick="openSubmitModal()" ${canSubmit ? '' : 'disabled'}>Lock In Picks →</button>
        ${!canSubmit && state.picks.length < MAX_PICKS ? `<p style="font-size:.75rem;color:var(--gray-400);text-align:center;margin-top:.5rem">Pick ${MAX_PICKS - state.picks.length} more</p>` : ''}
        ${totalSalary > SALARY_CAP ? `<p style="font-size:.75rem;color:var(--red);text-align:center;margin-top:.5rem">Over cap by $${totalSalary - SALARY_CAP}</p>` : ''}
      </div>
    </div>`;
}

function setTier(t) { state.filterTier = t; if (state.view === 'picks') renderPicksView(); }
function setSearch(v) { state.filterSearch = v; if (state.view === 'picks') renderPicksView(); }

function togglePick(playerId) {
  const idx = state.picks.findIndex(p => p.id === playerId);
  if (idx >= 0) {
    state.picks.splice(idx, 1);
  } else {
    if (state.picks.length >= MAX_PICKS) { showToast('Already have 5 picks', 'error'); return; }
    const player = state.players.find(p => p.id === playerId);
    if (!player) return;
    if (state.picks.reduce((s,p) => s+p.salary, 0) + player.salary > SALARY_CAP) {
      showToast(`Adding ${player.name} would exceed the cap`, 'error'); return;
    }
    state.picks.push(player);
  }
  if (state.view === 'picks') renderPicksView();
}

function openSubmitModal() {
  const totalSalary = state.picks.reduce((s,p) => s+p.salary, 0);
  $('modal-picks-summary').innerHTML = state.picks.map(p => `
    <div class="picks-summary-item"><span class="psn">${p.name}</span><span class="pss">$${p.salary}</span></div>`
  ).join('') + `<div class="picks-summary-total"><span>Total</span><span>$${totalSalary} / $${SALARY_CAP}</span></div>`;

  // Pre-fill name from profile
  const nameField = $('name-field-wrap');
  const nameInput = $('picker-name');
  if (state.currentUser && state.userProfile?.displayName) {
    nameInput.value = state.userProfile.displayName;
    nameField.style.display = 'none'; // hide if we already know who they are
  } else {
    nameInput.value = '';
    nameField.style.display = '';
  }
  showModal('modal-submit');
}

// ─── LEADERBOARD VIEW ────────────────────────────────────────────
async function renderLeaderboardView() {
  const current = state.tournaments.find(t => t.id === state.currentTournamentId)
    || state.tournaments.find(t => ['active','completed','picks_open'].includes(t.status))
    || state.tournaments[0];
  if (!current) { app().innerHTML = '<div class="empty-state">No tournaments yet.</div>'; return; }
  state.currentTournamentId = current.id;

  await Promise.all([loadPlayers(current.id), loadEntries(current.id)]);

  const playerMap = {};
  state.players.forEach(p => { playerMap[p.id] = p; });

  const tabs = state.tournaments.map(t => `
    <button class="tourney-tab ${t.id === current.id ? 'active' : ''}"
      onclick="switchLeaderboardTournament('${t.id}')">${t.name}</button>`
  ).join('');

  const hasResults = state.players.some(p => p.finish_position !== null && p.finish_position !== undefined);

  const rows = state.entries.map((entry, idx) => {
    const picks = (entry.player_ids || []).map(pid => playerMap[pid]).filter(Boolean);
    const chips = picks.map(p => {
      const placed = p.finish_position !== null && p.finish_position !== undefined;
      const mc = p.finish_position === 99 || p.finish_position === 98;
      const pts = placed ? getPoints(p.finish_position) : null;
      return `<span class="lb-pick-chip ${placed && !mc ? 'placed' : ''} ${mc ? 'mc' : ''}">
        ${p.name}${placed ? ` · ${formatPos(p.finish_position)}` : ''}${pts !== null ? ` <span class="chip-pts">${pts}pts</span>` : ''}
      </span>`;
    }).join('');
    const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '';
    const isMe = state.currentUser && entry.user_id === state.currentUser.uid;
    return `
      <tr ${isMe ? 'style="background:var(--green-pale)"' : ''}>
        <td class="lb-rank">${medal || (idx+1)}</td>
        <td>
          <div class="lb-name">${entry.person_name}${isMe ? ' <span style="font-size:.7rem;color:var(--green-accent);font-weight:700">YOU</span>' : ''}</div>
          <div class="lb-picks-row">${chips}</div>
        </td>
        <td class="lb-pts">${hasResults ? entry.total_points+' pts' : '—'}</td>
      </tr>`;
  }).join('');

  app().innerHTML = `
    <button class="back-btn" onclick="navigate('home')">← Back to Majors</button>
    <div class="section-row">
      <div>
        <h2 class="section-title">${current.name}</h2>
        <p class="section-sub">${current.location || ''} ${current.start_date ? '· '+fmtDate(current.start_date) : ''}</p>
      </div>
      ${current.status === 'picks_open' ? `<button class="btn btn-gold btn-sm" onclick="navigate('picks',{tournamentId:'${current.id}'})">Submit Picks</button>` : ''}
    </div>
    <div class="tournament-selector">${tabs}</div>
    ${state.entries.length === 0
      ? `<div class="empty-state"><span class="icon">📋</span>No picks submitted yet.</div>`
      : `<div class="card"><table class="leaderboard-table">
          <thead><tr><th>Rank</th><th>Player / Picks</th><th style="text-align:right">${hasResults ? 'Points' : 'Picks'}</th></tr></thead>
          <tbody>${rows}</tbody>
         </table></div>`}`;
}

function switchLeaderboardTournament(id) {
  state.currentTournamentId = id;
  renderLeaderboardView();
}

// ─── MONEY PAGE ──────────────────────────────────────────────────
async function renderMoneyPage() {
  const [users] = await Promise.all([loadAllUsers()]);

  // Build season standings: sum points per person across all tournaments
  const standings = {};
  for (const t of state.tournaments) {
    if (!['active','completed'].includes(t.status)) continue;
    const snap = await db.collection('entries').where('tournament_id', '==', t.id).get();
    snap.docs.forEach(d => {
      const e = d.data();
      const key = e.user_id || e.person_name;
      if (!standings[key]) {
        standings[key] = {
          name: e.person_name,
          user_id: e.user_id || null,
          total: 0,
          breakdown: [],
        };
      }
      standings[key].total += (e.total_points || 0);
      standings[key].breakdown.push({ tournament: t.name, pts: e.total_points || 0 });
    });
  }

  const sorted = Object.values(standings).sort((a, b) => b.total - a.total);

  const hasStandings = sorted.length > 0;

  // Match user profiles to standings
  const userMap = {};
  users.forEach(u => { userMap[u.id] = u; });

  const standingRows = sorted.map((s, i) => {
    const profile = s.user_id ? userMap[s.user_id] : null;
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '';
    const breakdownStr = s.breakdown.map(b => `${b.tournament.replace(/ 2026/,'')}: ${b.pts}`).join(' · ');
    return `
      <tr>
        <td class="season-rank">${medal || (i+1)}</td>
        <td>
          <div class="season-name">${s.name}</div>
          <div class="season-breakdown">${breakdownStr}</div>
        </td>
        <td class="season-pts">${s.total} pts</td>
      </tr>`;
  }).join('');

  app().innerHTML = `
    <div class="section-row" style="margin-bottom:1rem">
      <div>
        <h2 class="section-title">Money</h2>
        <p class="section-sub">Season standings and how to pay up</p>
      </div>
    </div>

    <div style="margin-bottom:1.5rem">
      <h3 style="font-family:var(--font-display);font-size:1.15rem;color:var(--green-dark);margin-bottom:.75rem">Season Standings</h3>
      ${hasStandings
        ? `<div class="card"><table class="season-table">
            <thead><tr><th>Rank</th><th>Player</th><th style="text-align:right">Total Pts</th></tr></thead>
            <tbody>${standingRows}</tbody>
           </table></div>`
        : `<div class="empty-state" style="padding:2rem"><span class="icon">🏆</span>No results posted yet.</div>`}
    </div>

    <div>
      <h3 style="font-family:var(--font-display);font-size:1.15rem;color:var(--green-dark);margin-bottom:.75rem">Pay Up 💸</h3>
      <div class="commissioner-card">
        <div class="commissioner-label">Send payment to the commissioner</div>
        <div class="commissioner-name">${COMMISSIONER.name}</div>
        <div class="commissioner-links">
          <a href="https://venmo.com/u/${COMMISSIONER.venmo}" target="_blank" class="btn btn-venmo">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style="flex-shrink:0"><path d="M19.5 2c.9 1.5 1.3 3.1 1.3 5.1 0 5.3-4.5 12.2-8.2 17H5.4L2 4.1l7.1-.7 1.7 13.6c1.6-2.6 3.5-6.7 3.5-9.5 0-1.5-.3-2.6-.7-3.5L19.5 2z"/></svg>
            @${COMMISSIONER.venmo}
          </a>
          <a href="https://www.paypal.com/cgi-bin/webscr?cmd=_xclick&business=${encodeURIComponent(COMMISSIONER.paypal)}&currency_code=USD" target="_blank" class="btn btn-paypal">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style="flex-shrink:0"><path d="M20.067 8.478c.492.315.844.825.983 1.43C21.692 12.976 20 15 17.05 15H15.5l-.734 4.656A.75.75 0 0 1 14.02 20H11.1a.5.5 0 0 1-.494-.574l.734-4.656H9.5a.5.5 0 0 1-.494-.574l1.5-9.5A.75.75 0 0 1 11.25 4h5.3c1.37 0 2.55.593 3.194 1.595l.323.883z"/></svg>
            ${COMMISSIONER.paypal}
          </a>
        </div>
      </div>
    </div>`;
}

// ─── MY PICKS VIEW ───────────────────────────────────────────────
async function renderMyPicks() {
  if (!state.currentUser) {
    app().innerHTML = `
      <div class="sign-in-prompt">
        <span class="icon">🏌️</span>
        <h2>My Picks</h2>
        <p>Sign in to see all your picks across every major.</p>
        <button class="btn btn-google" onclick="signIn()">
          <svg class="google-icon" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
          Sign In with Google
        </button>
      </div>`;
    return;
  }

  // Load all entries for this user
  const snap = await db.collection('entries')
    .where('user_id', '==', state.currentUser.uid).get();
  const myEntries = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  if (myEntries.length === 0) {
    app().innerHTML = `
      <div class="empty-state">
        <span class="icon">📋</span>
        <p>You haven't submitted picks yet.</p>
        <button class="btn btn-gold" onclick="navigate('home')">View Majors</button>
      </div>`;
    return;
  }

  // Build player maps for each tournament
  let totalSeasonPts = 0;
  const sections = await Promise.all(
    state.tournaments.map(async t => {
      const entry = myEntries.find(e => e.tournament_id === t.id);
      if (!entry) return null;

      const playerSnap = await db.collection('players').where('tournament_id', '==', t.id).get();
      const playerMap = {};
      playerSnap.docs.forEach(d => { playerMap[d.id] = { id: d.id, ...d.data() }; });

      const picks = (entry.player_ids || []).map(pid => playerMap[pid]).filter(Boolean);
      const hasResults = picks.some(p => p.finish_position !== null && p.finish_position !== undefined);
      totalSeasonPts += entry.total_points || 0;

      const m = MAJOR_META[t.major] || {};
      const cards = picks.map(p => {
        const placed = p.finish_position !== null && p.finish_position !== undefined;
        const mc = p.finish_position === 99 || p.finish_position === 98;
        const pts = placed ? getPoints(p.finish_position) : null;
        return `
          <div class="my-pick-card ${placed && !mc ? 'placed' : ''} ${mc ? 'mc' : ''}">
            <div class="my-pick-player">${p.name}</div>
            <div class="my-pick-meta">
              <span>$${p.salary}</span>
              ${placed ? `<span class="${mc ? '' : 'my-pick-pts'}">${formatPos(p.finish_position)}${pts ? ' · '+pts+'pts' : ''}</span>` : '<span style="color:var(--gray-300)">TBD</span>'}
            </div>
          </div>`;
      }).join('');

      return `
        <div class="my-picks-tournament">
          <div class="my-picks-header">
            <div class="my-picks-name">${m.icon || ''} ${t.name}</div>
            ${hasResults ? `<div class="my-picks-score">${entry.total_points} pts</div>` : `<span class="status-badge ${t.status}" style="margin:0">${t.status}</span>`}
          </div>
          <div class="my-picks-grid">${cards}</div>
        </div>`;
    })
  );

  const content = sections.filter(Boolean).join('');

  const photo = state.userProfile?.photoURL || state.currentUser?.photoURL || '';
  const name  = state.userProfile?.displayName || state.currentUser?.displayName || 'You';

  app().innerHTML = `
    <div style="display:flex;align-items:center;gap:.75rem;margin-bottom:1.25rem;flex-wrap:wrap">
      ${photo ? `<img class="user-avatar-sm" src="${photo}" style="width:48px;height:48px">` : `<div class="user-initials-sm" style="width:48px;height:48px;font-size:1rem">${initials(name)}</div>`}
      <div>
        <div style="font-family:var(--font-display);font-size:1.4rem;color:var(--green-dark)">${name}</div>
        <div style="font-size:.82rem;color:var(--gray-500)">Season total: <strong style="color:var(--green-dark)">${totalSeasonPts} pts</strong></div>
      </div>
      <button class="btn btn-ghost btn-sm" style="margin-left:auto" onclick="openProfileModal()">Edit Profile</button>
    </div>
    ${content || '<div class="empty-state">No picks found.</div>'}`;
}

// ─── ADMIN VIEW ──────────────────────────────────────────────────
async function renderAdminView() {
  if (!state.adminAuth) {
    app().innerHTML = `
      <div class="empty-state" style="padding:4rem">
        <span class="icon">🔐</span>
        <p style="margin-bottom:1rem;color:var(--gray-600)">Admin access required</p>
        <button class="btn btn-primary" onclick="showModal('modal-admin-login')">Login</button>
      </div>`;
    return;
  }

  const tabs = [
    { key:'tournaments', label:'Tournaments' },
    { key:'field',       label:'Player Field' },
    { key:'results',     label:'Results' },
  ].map(t => `
    <button class="admin-tab-btn ${state.adminTab === t.key ? 'active' : ''}"
      onclick="switchAdminTab('${t.key}')">${t.label}</button>`
  ).join('');

  const tourneySel = state.tournaments.map(t =>
    `<option value="${t.id}" ${t.id === state.adminTournamentId ? 'selected' : ''}>${t.name}</option>`
  ).join('');

  let inner = '';
  if      (state.adminTab === 'tournaments') inner = await adminTabTournaments();
  else if (state.adminTab === 'field')       inner = await adminTabField();
  else if (state.adminTab === 'results')     inner = await adminTabResults();

  app().innerHTML = `
    <div class="section-row">
      <h2 class="section-title">Admin</h2>
      <button class="btn btn-ghost btn-sm" onclick="adminLogout()">Logout</button>
    </div>
    <div class="admin-tabs">${tabs}</div>
    ${state.adminTab !== 'tournaments' ? `
      <div style="margin-bottom:1rem;display:flex;align-items:center;gap:.75rem;flex-wrap:wrap">
        <label style="font-size:.82rem;font-weight:600;color:var(--gray-600)">Tournament:</label>
        <select id="admin-tourney-sel" onchange="setAdminTournament(this.value)"
          style="padding:.4rem .7rem;border:1.5px solid var(--gray-200);border-radius:8px;font-size:.85rem;flex:1;max-width:320px">
          <option value="">— Select —</option>${tourneySel}
        </select>
      </div>` : ''}
    ${inner}`;
}

async function adminTabTournaments() {
  const rows = state.tournaments.map(t => {
    const m = MAJOR_META[t.major] || {};
    return `
      <tr>
        <td>${m.icon||''} ${t.name}</td>
        <td>${t.location||'—'}</td>
        <td>${t.start_date ? fmtDate(t.start_date) : '—'}</td>
        <td><span class="status-badge ${t.status}">${t.status}</span></td>
        <td class="actions-cell">
          <select onchange="quickStatus('${t.id}',this.value)" style="font-size:.78rem;border:1.5px solid var(--gray-200);border-radius:6px;padding:.25rem .4rem">
            ${['upcoming','picks_open','active','completed'].map(s =>
              `<option value="${s}" ${t.status===s?'selected':''}>${s}</option>`).join('')}
          </select>
          <button class="btn btn-sm btn-danger btn-icon" onclick="adminDeleteTournament('${t.id}')">🗑</button>
        </td>
      </tr>`;
  }).join('');

  return `
    <div class="admin-section">
      ${state.tournaments.length === 0 ? `
        <div class="import-section" style="margin-bottom:1rem">
          <strong>No tournaments yet.</strong>
          <button class="btn btn-gold btn-sm" onclick="seedTournaments()">Seed 2026 Majors</button>
        </div>` : ''}
      <div class="admin-form">
        <div class="admin-form-title">Add / Edit Tournament</div>
        <div class="form-row" style="margin-bottom:.6rem">
          <div class="form-group">
            <label>Major</label>
            <select id="t-major">
              <option value="masters">The Masters</option>
              <option value="pga">PGA Championship</option>
              <option value="us_open">U.S. Open</option>
              <option value="open">The Open Championship</option>
            </select>
          </div>
          <div class="form-group">
            <label>Year</label>
            <input type="number" id="t-year" value="2026" min="2020" max="2040">
          </div>
        </div>
        <div class="form-row" style="margin-bottom:.6rem">
          <div class="form-group">
            <label>Location</label>
            <input type="text" id="t-location" placeholder="Augusta National GC, Augusta, GA">
          </div>
          <div class="form-group">
            <label>ESPN Event ID (optional)</label>
            <input type="text" id="t-espn-id" placeholder="e.g. 401580351">
          </div>
        </div>
        <div class="form-row" style="margin-bottom:.75rem">
          <div class="form-group"><label>Start Date</label><input type="date" id="t-start"></div>
          <div class="form-group"><label>End Date</label><input type="date" id="t-end"></div>
        </div>
        <button class="btn btn-primary btn-sm" onclick="adminSaveTournament()">Save Tournament</button>
      </div>
      <table class="data-table">
        <thead><tr><th>Tournament</th><th>Location</th><th>Date</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>${rows||'<tr><td colspan="5" style="text-align:center;color:var(--gray-400)">No tournaments</td></tr>'}</tbody>
      </table>
    </div>`;
}

async function adminTabField() {
  if (!state.adminTournamentId) return `<div class="empty-state">Select a tournament above.</div>`;
  await loadPlayers(state.adminTournamentId);

  const rows = state.players.map(p => `
    <tr>
      <td>${p.name}</td>
      <td>${p.world_rank||'—'}</td>
      <td class="salary-cell"><span class="salary-tag ${salaryCls(p.salary)}">$${p.salary}</span></td>
      <td class="actions-cell">
        <button class="btn btn-sm btn-danger btn-icon" onclick="adminDeletePlayer('${p.id}')">🗑</button>
      </td>
    </tr>`).join('');

  return `
    <div class="admin-section">
      <div class="import-section">
        <strong>Live Data:</strong>
        <button class="btn btn-sm btn-gold" onclick="adminImportOWGR()">Import from OWGR</button>
        <button class="btn btn-sm btn-ghost" onclick="adminImportESPN()">Import from ESPN</button>
      </div>
      <div class="admin-form">
        <div class="admin-form-title">Add Player Manually</div>
        <div class="form-row" style="margin-bottom:.6rem">
          <div class="form-group">
            <label>Player Name</label>
            <input type="text" id="p-name" placeholder="Scottie Scheffler">
          </div>
          <div class="form-group">
            <label>World Rank</label>
            <input type="number" id="p-rank" placeholder="1" min="1" oninput="previewSalary()">
          </div>
        </div>
        <div id="salary-preview" style="font-size:.9rem;color:var(--gray-500);margin-bottom:.6rem">Salary: —</div>
        <div class="form-row" style="margin-bottom:.75rem">
          <div class="form-group">
            <label>Photo URL (optional)</label>
            <input type="text" id="p-photo" placeholder="https://...">
          </div>
        </div>
        <button class="btn btn-primary btn-sm" onclick="adminSavePlayer()">Add Player</button>
      </div>
      <div id="import-preview-container"></div>
      <table class="data-table">
        <thead><tr><th>Name</th><th>WR Rank</th><th>Salary</th><th>Action</th></tr></thead>
        <tbody>${rows||'<tr><td colspan="4" style="text-align:center;color:var(--gray-400)">No players added yet.</td></tr>'}</tbody>
      </table>
    </div>`;
}

async function adminTabResults() {
  if (!state.adminTournamentId) return `<div class="empty-state">Select a tournament above.</div>`;
  await loadPlayers(state.adminTournamentId);
  if (state.players.length === 0) return `<div class="empty-state"><span class="icon">📋</span>Add players to the field first.</div>`;

  const t = state.tournaments.find(x => x.id === state.adminTournamentId);
  const rows = state.players.map(p => `
    <div class="results-player-row">
      <div>
        <div class="results-player-name">${p.name}</div>
        <div class="results-player-salary">$${p.salary}</div>
      </div>
      <input type="number" class="results-pos-input" id="pos-${p.id}"
        value="${p.finish_position !== null && p.finish_position !== undefined ? p.finish_position : ''}"
        placeholder="pos" min="1" oninput="previewPoints('${p.id}')">
      <div class="results-pts-preview" id="pts-${p.id}">
        ${p.finish_position !== null && p.finish_position !== undefined ? getPoints(p.finish_position)+' pts' : ''}
      </div>
    </div>`).join('');

  return `
    <div class="admin-section">
      <div class="import-section">
        <strong>Live Sync:</strong>
        ${t?.espn_event_id
          ? `<button class="btn btn-sm btn-gold" onclick="adminSyncESPNResults()">Sync from ESPN</button>`
          : `<span>Set ESPN Event ID on the tournament to enable sync.</span>`}
        <span style="margin-left:auto;font-size:.76rem;opacity:.7">99=MC · 98=WD</span>
      </div>
      <div id="results-rows">${rows}</div>
      <div style="margin-top:1rem;display:flex;gap:.75rem">
        <button class="btn btn-primary" onclick="adminSaveResults()">Save All Results</button>
        <button class="btn btn-ghost btn-sm" onclick="adminClearResults()">Clear All</button>
      </div>
    </div>`;
}

function switchAdminTab(tab) { state.adminTab = tab; renderAdminView(); }
function setAdminTournament(id) { state.adminTournamentId = id; renderAdminView(); }

function previewSalary() {
  const rank = parseInt($('p-rank')?.value);
  const sal = getSalary(rank);
  const el = $('salary-preview');
  if (el) el.innerHTML = `Salary: <strong class="salary-tag ${salaryCls(sal)}">$${sal}</strong>`;
}

function previewPoints(playerId) {
  const pos = parseInt($(`pos-${playerId}`)?.value);
  const el = $(`pts-${playerId}`);
  if (el) el.textContent = isNaN(pos) ? '' : getPoints(pos)+' pts';
}

async function quickStatus(id, status) {
  setLoading(true);
  try {
    await db.collection('tournaments').update ? null : null;
    const { error } = { error: null };
    await db.collection('tournaments').doc(id).update({ status });
    await render();
    showToast('Status updated', 'success');
  } catch (e) { showToast(e.message, 'error'); }
  finally { setLoading(false); }
}

async function seedTournaments() {
  const SEED = [
    { name:'The Masters 2026',           major:'masters',  year:2026, location:'Augusta National GC, Augusta, GA',      start_date:'2026-04-09', end_date:'2026-04-12', status:'upcoming' },
    { name:'PGA Championship 2026',      major:'pga',      year:2026, location:'Quail Hollow Club, Charlotte, NC',       start_date:'2026-05-21', end_date:'2026-05-24', status:'upcoming' },
    { name:'U.S. Open 2026',             major:'us_open',  year:2026, location:'Shinnecock Hills GC, Southampton, NY',  start_date:'2026-06-18', end_date:'2026-06-21', status:'upcoming' },
    { name:'The Open Championship 2026', major:'open',     year:2026, location:'Royal Portrush GC, Northern Ireland',   start_date:'2026-07-16', end_date:'2026-07-19', status:'upcoming' },
  ];
  setLoading(true);
  try {
    const batch = db.batch();
    SEED.forEach(t => batch.set(db.collection('tournaments').doc(), t));
    await batch.commit();
    await render();
    showToast('2026 majors seeded ✓', 'success');
  } catch(e) { showToast(e.message, 'error'); }
  finally { setLoading(false); }
}

async function adminSaveTournament() {
  const major    = $('t-major').value;
  const year     = parseInt($('t-year').value);
  const location = $('t-location').value.trim();
  const espnId   = $('t-espn-id').value.trim();
  const start    = $('t-start').value;
  const end      = $('t-end').value;
  if (!major || !year) { showToast('Major and year required', 'error'); return; }
  const m = MAJOR_META[major];
  setLoading(true);
  try {
    await saveTournament({ name:`${m.label} ${year}`, major, year, location, start_date:start||null, end_date:end||null, espn_event_id:espnId||null });
    await render();
    showToast('Tournament saved', 'success');
  } catch(e) { showToast(e.message, 'error'); }
  finally { setLoading(false); }
}

async function adminDeleteTournament(id) {
  confirm('Delete Tournament', 'This will delete all players and entries. Cannot be undone.', async () => {
    setLoading(true);
    try {
      await deleteTournament(id);
      if (state.adminTournamentId === id) state.adminTournamentId = null;
      await render();
      showToast('Tournament deleted');
    } catch(e) { showToast(e.message, 'error'); }
    finally { setLoading(false); }
  });
}

async function adminSavePlayer() {
  const name  = $('p-name').value.trim();
  const rank  = parseInt($('p-rank').value) || null;
  const photo = $('p-photo')?.value.trim() || null;
  if (!name) { showToast('Name required', 'error'); return; }
  setLoading(true);
  try {
    await savePlayer({ tournament_id:state.adminTournamentId, name, world_rank:rank, salary:getSalary(rank), photo_url:photo });
    $('p-name').value = ''; $('p-rank').value = ''; if($('p-photo')) $('p-photo').value = '';
    await loadPlayers(state.adminTournamentId);
    renderAdminView();
    showToast(`${name} added`, 'success');
  } catch(e) { showToast(e.message, 'error'); }
  finally { setLoading(false); }
}

async function adminDeletePlayer(id) {
  confirm('Remove Player', 'Remove this player from the field?', async () => {
    setLoading(true);
    try {
      await deletePlayer(id);
      await loadPlayers(state.adminTournamentId);
      renderAdminView();
      showToast('Player removed');
    } catch(e) { showToast(e.message, 'error'); }
    finally { setLoading(false); }
  });
}

async function adminSaveResults() {
  const updates = state.players.map(p => {
    const pos = parseInt($(`pos-${p.id}`)?.value) || null;
    return { id:p.id, finish_position:pos, points:pos !== null ? getPoints(pos) : 0 };
  });
  setLoading(true);
  try {
    await saveResults(updates);
    await loadPlayers(state.adminTournamentId);
    renderAdminView();
    showToast('Results saved & points recalculated', 'success');
  } catch(e) { showToast(e.message, 'error'); }
  finally { setLoading(false); }
}

async function adminClearResults() {
  confirm('Clear Results', 'Reset all finish positions for this tournament?', async () => {
    setLoading(true);
    try {
      const batch = db.batch();
      state.players.forEach(p => batch.update(db.collection('players').doc(p.id), { finish_position:null, points:0 }));
      await batch.commit();
      await recalcEntryPoints(state.adminTournamentId);
      await loadPlayers(state.adminTournamentId);
      renderAdminView();
      showToast('Results cleared');
    } catch(e) { showToast(e.message, 'error'); }
    finally { setLoading(false); }
  });
}

// ─── IMPORT: OWGR ────────────────────────────────────────────────
async function adminImportOWGR() {
  setLoading(true);
  try {
    const { players } = await fetchOWGRRankings(200);
    if (!players?.length) throw new Error('No rankings returned');
    renderImportPreview(players, 'owgr');
    showToast(`Loaded ${players.length} OWGR rankings`, 'success');
  } catch(e) { showToast(`OWGR: ${e.message}`, 'error'); }
  finally { setLoading(false); }
}

async function adminImportESPN() {
  const t = state.tournaments.find(x => x.id === state.adminTournamentId);
  if (!t?.espn_event_id) { showToast('Set an ESPN Event ID on this tournament first', 'error'); return; }
  setLoading(true);
  try {
    const [{ competitors }, { players: owgr }] = await Promise.all([
      fetchESPNSummary(t.espn_event_id), fetchOWGRRankings(300),
    ]);
    if (!competitors?.length) throw new Error('No players from ESPN');
    const owgrMap = {};
    (owgr||[]).forEach(p => { owgrMap[normalName(p.name)] = p.rank; });
    const merged = competitors.map(c => ({ name:c.name, rank:owgrMap[normalName(c.name)]||null }));
    renderImportPreview(merged, 'espn');
    showToast(`Loaded ${merged.length} players from ESPN`, 'success');
  } catch(e) { showToast(`ESPN: ${e.message}`, 'error'); }
  finally { setLoading(false); }
}

function normalName(n='') { return n.toLowerCase().replace(/[^a-z]/g,''); }

function renderImportPreview(players, source) {
  const container = $('import-preview-container');
  if (!container) return;
  const items = players.slice(0,200).map((p,i) => {
    const salary = getSalary(p.rank);
    return `
      <div class="import-preview-row">
        <label for="imp-${i}">
          <input type="checkbox" id="imp-${i}" checked data-name="${p.name}" data-rank="${p.rank||''}" data-salary="${salary}">
          <span class="import-rank">${p.rank||'?'}</span>
          ${p.name}
        </label>
        <span class="salary-tag ${salaryCls(salary)} import-salary">$${salary}</span>
      </div>`;
  }).join('');
  container.innerHTML = `
    <div style="margin-bottom:.5rem;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:.5rem">
      <strong style="font-size:.85rem">Select players to add</strong>
      <div style="display:flex;gap:.5rem">
        <button class="btn btn-primary btn-sm" onclick="adminConfirmImport()">Add Selected</button>
        <button class="btn btn-ghost btn-sm" onclick="document.getElementById('import-preview-container').innerHTML=''">Cancel</button>
      </div>
    </div>
    <div class="import-preview">${items}</div>`;
}

async function adminConfirmImport() {
  const checkboxes = document.querySelectorAll('#import-preview-container input[type=checkbox]:checked');
  if (!checkboxes.length) { showToast('No players selected', 'error'); return; }
  setLoading(true);
  try {
    const existing = new Set((state.players||[]).map(p => normalName(p.name)));
    let added = 0;
    for (const cb of checkboxes) {
      if (existing.has(normalName(cb.dataset.name))) continue;
      const rank = parseInt(cb.dataset.rank)||null;
      await savePlayer({ tournament_id:state.adminTournamentId, name:cb.dataset.name, world_rank:rank, salary:getSalary(rank) });
      added++;
    }
    const c = $('import-preview-container'); if (c) c.innerHTML = '';
    await loadPlayers(state.adminTournamentId);
    renderAdminView();
    showToast(`${added} players added`, 'success');
  } catch(e) { showToast(e.message, 'error'); }
  finally { setLoading(false); }
}

async function adminSyncESPNResults() {
  const t = state.tournaments.find(x => x.id === state.adminTournamentId);
  if (!t?.espn_event_id) { showToast('No ESPN Event ID set', 'error'); return; }
  setLoading(true);
  try {
    const { competitors } = await fetchESPNSummary(t.espn_event_id);
    if (!competitors?.length) throw new Error('No results from ESPN');
    const espnMap = {};
    competitors.forEach(c => { espnMap[normalName(c.name)] = c; });
    function parseESPNPos(str='') {
      const s = str.replace('T','').toUpperCase();
      if (s==='MC'||s==='CUT') return 99;
      if (s==='WD') return 98;
      const n = parseInt(s); return isNaN(n)?null:n;
    }
    const updates = state.players.map(p => {
      const espn = espnMap[normalName(p.name)];
      const pos  = espn ? parseESPNPos(espn.position) : p.finish_position;
      return { id:p.id, finish_position:pos, points:pos!==null?getPoints(pos):0 };
    });
    await saveResults(updates);
    await loadPlayers(state.adminTournamentId);
    renderAdminView();
    showToast('Results synced from ESPN', 'success');
  } catch(e) { showToast(e.message, 'error'); }
  finally { setLoading(false); }
}

function adminLogout() { state.adminAuth = false; navigate('home'); }

// ─── EVENT LISTENERS ─────────────────────────────────────────────
function setupEvents() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => navigate(btn.dataset.view));
  });

  // Submit picks
  $('cancel-submit').addEventListener('click', () => hideModal('modal-submit'));
  $('confirm-submit').addEventListener('click', async () => {
    const nameField = $('name-field-wrap');
    let name;
    if (nameField.style.display === 'none') {
      name = state.userProfile?.displayName || state.currentUser?.displayName || '';
    } else {
      name = $('picker-name').value.trim();
    }
    if (!name) { showToast('Please enter your name', 'error'); return; }
    if (state.picks.length !== MAX_PICKS) { showToast('Select 5 players', 'error'); return; }
    const totalSalary = state.picks.reduce((s,p) => s+p.salary, 0);
    if (totalSalary > SALARY_CAP) { showToast('Over salary cap', 'error'); return; }
    hideModal('modal-submit');
    setLoading(true);
    try {
      await submitEntry(state.currentTournamentId, name, state.picks.map(p=>p.id), totalSalary);
      state.picks = [];
      showToast(`Picks locked in for ${name}! 🏌️`, 'success');
      navigate('leaderboard', { tournamentId: state.currentTournamentId });
    } catch(e) { showToast(e.message, 'error'); }
    finally { setLoading(false); }
  });
  $('picker-name').addEventListener('keydown', e => { if (e.key==='Enter') $('confirm-submit').click(); });

  // Admin login
  $('cancel-admin-login').addEventListener('click', () => hideModal('modal-admin-login'));
  $('confirm-admin-login').addEventListener('click', () => {
    if ($('admin-password').value === ADMIN_PASSWORD) {
      state.adminAuth = true;
      hideModal('modal-admin-login');
      render();
    } else {
      showToast('Incorrect password', 'error');
      $('admin-password').value = '';
    }
  });
  $('admin-password').addEventListener('keydown', e => { if (e.key==='Enter') $('confirm-admin-login').click(); });

  // Confirm
  $('cancel-confirm').addEventListener('click', () => { confirmCallback=null; hideModal('modal-confirm'); });
  $('ok-confirm').addEventListener('click', () => {
    hideModal('modal-confirm');
    if (confirmCallback) { confirmCallback(); confirmCallback=null; }
  });

  // Profile
  $('cancel-profile').addEventListener('click', () => hideModal('modal-profile'));
  $('save-profile').addEventListener('click', async () => {
    const name   = $('profile-name').value.trim();
    const venmo  = $('profile-venmo').value.trim().replace(/^@/,'');
    const paypal = $('profile-paypal').value.trim();
    if (!name) { showToast('Display name required', 'error'); return; }
    setLoading(true);
    try {
      await saveProfile(name, venmo, paypal);
      hideModal('modal-profile');
      updateAuthUI();
      showToast('Profile saved ✓', 'success');
    } catch(e) { showToast(e.message, 'error'); }
    finally { setLoading(false); }
  });

  // Close modals on overlay click
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) { overlay.classList.add('hidden'); confirmCallback=null; }
    });
  });

  // Close user dropdown when clicking outside
  document.addEventListener('click', e => {
    const menu = document.querySelector('.user-menu.open');
    if (menu && !menu.contains(e.target)) menu.classList.remove('open');
  });
}

// ─── INIT ─────────────────────────────────────────────────────────
async function init() {
  setupEvents();

  // Firebase Auth state listener
  auth.onAuthStateChanged(async (user) => {
    state.currentUser = user;
    if (user) {
      await ensureUserProfile(user);
      // If on picks page, re-render now that user is signed in
      if (state.view === 'picks') renderPicksView();
    }
    updateAuthUI();
  });

  await render();
}

init();
