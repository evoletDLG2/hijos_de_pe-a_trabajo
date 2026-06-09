
(() => {
  const STORAGE_KEY = 'hijosDePena_v1';
  const PASSWORD_PROFESOR = '1234';
  const ROLES = ['Líder', 'Comunicador', 'Motivador', 'Ejecutor', 'Estratega'];
  const ESTADOS = {
    inicio: 'inicio',
    estudiante: 'estudiante',
    profesor: 'profesor',
    trofeos: 'trofeos'
  };

  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

  const els = {};
  const today = new Date();
  const fechaHoy = formatDate(today);

  const defaultState = () => ({
    students: [],
    teams: [],
    activities: [],
    adversities: [],
    pendingConfirmations: {},
    settings: { teacherPassword: PASSWORD_PROFESOR },
    ui: {
      currentRole: null,
      currentUserId: null,
      activeView: ESTADOS.inicio,
      menuOpen: false,
      currentChallenge: null,
      spinRotation: 0,
      selectedSuggestion: null
    }
  });

  let state = loadState();
  hydrateIds();
  let sessionTimer = null;
  let autoSaveTimer = null;

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    cacheElements();
    bindEvents();
    migrateState();
    renderAll();
    startHeartbeat();
  }

  function cacheElements() {
    [
      'appShell', 'btnMenu', 'navPrincipal', 'btnSalir', 'statusSesion',
      'pantallaInicio', 'pantallaProfesor', 'pantallaEstudiante', 'pantallaTrofeos',
      'inputNombreEstudiante', 'btnEntrarEstudiante', 'cajaSugerencia',
      'inputClaveProfesor', 'btnEntrarProfesor',
      'csvEstudiantes', 'csvActividades', 'csvAdversidades', 'btnCargarCsv', 'estadoCarga',
      'btnRecalcular', 'btnResetDatos', 'listaEstudiantesProfesor', 'listaEquiposProfesor',
      'rankingGeneral', 'btnExpandirTodo',
      'saludoEstudiante', 'tarjetaPerfilEstudiante', 'listaCompanerosEstudiante',
      'badgeEquipoActual', 'ruletaActividades', 'btnGirarRuleta', 'tarjetaReto',
      'retoTitulo', 'retoDescripcion', 'btnAceptarReto', 'btnRechazarReto', 'tarjetaAdversidad',
      'selectCompaneroFeedback', 'textoFeedback', 'checkDesperfeccion', 'btnEnviarFeedback',
      'listaFeedbacksRecibidos', 'btnCrearEscuadra', 'inputTokenInvitacion', 'btnAceptarInvitacion',
      'btnConfirmarUnion', 'salidaToken',
      'vitrinaTrofeos',
      'modalGenerico', 'modalTitulo', 'modalCuerpo', 'btnCerrarModal'
    ].forEach(id => els[id] = document.getElementById(id));
  }

  function bindEvents() {
    els.btnMenu.addEventListener('click', () => {
      els.navPrincipal.classList.toggle('hidden');
      state.ui.menuOpen = !state.ui.menuOpen;
      saveState();
    });

    els.btnSalir.addEventListener('click', logout);

    els.btnEntrarEstudiante.addEventListener('click', handleStudentLogin);
    els.inputNombreEstudiante.addEventListener('keydown', e => {
      if (e.key === 'Enter') handleStudentLogin();
    });

    els.btnEntrarProfesor.addEventListener('click', handleTeacherLogin);
    els.inputClaveProfesor.addEventListener('keydown', e => {
      if (e.key === 'Enter') handleTeacherLogin();
    });

    els.btnCargarCsv.addEventListener('click', handleLoadCsvs);
    els.btnRecalcular.addEventListener('click', () => {
      migrateState();
      renderAll();
      toast('Tablero recalculado.', 'good');
    });
    els.btnResetDatos.addEventListener('click', resetAllData);
    els.btnExpandirTodo.addEventListener('click', expandAllStudentCards);

    els.btnGirarRuleta.addEventListener('click', spinWheel);
    els.btnAceptarReto.addEventListener('click', acceptChallenge);
    els.btnRechazarReto.addEventListener('click', rejectChallenge);

    els.btnCrearEscuadra.addEventListener('click', createTeamForCurrentUser);
    els.btnAceptarInvitacion.addEventListener('click', acceptInvitationToken);
    els.btnConfirmarUnion.addEventListener('click', confirmUnionToken);

    els.btnEnviarFeedback.addEventListener('click', sendFeedback);

    els.btnCerrarModal.addEventListener('click', closeModal);
    els.modalGenerico.addEventListener('click', e => {
      if (e.target === els.modalGenerico) closeModal();
    });

    document.addEventListener('click', handleGlobalClick);
    document.addEventListener('dblclick', handleGlobalDblClick);

    $$('.nav-link, [data-vista]').forEach(btn => {
      btn.addEventListener('click', () => {
        showView(btn.dataset.vista);
        if (window.innerWidth < 760) {
          els.navPrincipal.classList.add('hidden');
        }
      });
    });

    window.addEventListener('beforeunload', persistCurrentSession);
    window.addEventListener('storage', e => {
      if (e.key === STORAGE_KEY) {
        state = loadState();
        migrateState();
        renderAll();
      }
    });
  }

  function startHeartbeat() {
    clearInterval(sessionTimer);
    clearInterval(autoSaveTimer);
    sessionTimer = setInterval(() => {
      tickSession();
      updateSessionBadge();
      updateCurrentChallengeTimer();
    }, 1000);
    autoSaveTimer = setInterval(() => {
      persistCurrentSession();
      saveState();
    }, 8000);
  }

  function migrateState() {
    if (!state || typeof state !== 'object') state = defaultState();
    if (!state.students) state.students = [];
    if (!state.teams) state.teams = [];
    if (!state.activities) state.activities = [];
    if (!state.adversities) state.adversities = [];
    if (!state.pendingConfirmations) state.pendingConfirmations = {};
    if (!state.settings) state.settings = { teacherPassword: PASSWORD_PROFESOR };
    if (!state.ui) state.ui = defaultState().ui;

    state.students = state.students.map(normalizeStudent);
    state.teams = state.teams.map(normalizeTeam);

    // Relación inversa y saneamiento
    state.students.forEach(stu => {
      if (stu.teamId && !state.teams.some(t => t.id === stu.teamId)) {
        stu.teamId = null;
      }
      if (!Array.isArray(stu.achievements)) stu.achievements = [];
      if (!Array.isArray(stu.reviews)) stu.reviews = [];
      if (!Number.isFinite(stu.points)) stu.points = 0;
      if (!Number.isFinite(stu.steps)) stu.steps = 0;
      if (!Number.isFinite(stu.sessionSeconds)) stu.sessionSeconds = 0;
      if (typeof stu.role !== 'string' || !ROLES.includes(stu.role)) stu.role = 'Estratega';
      if (!stu.name) stu.name = 'Sin nombre';
      if (!stu.id) stu.id = uid('stu');
    });

    state.teams.forEach(team => {
      team.memberIds = Array.isArray(team.memberIds) ? uniq(team.memberIds.filter(id => state.students.some(s => s.id === id))) : [];
      if (team.leaderId && !state.students.some(s => s.id === team.leaderId)) {
        team.leaderId = team.memberIds.find(id => {
          const st = getStudentById(id);
          return st && st.role === 'Líder';
        }) || team.memberIds[0] || null;
      }
      if (!team.id) team.id = uid('team');
      if (!Array.isArray(team.log)) team.log = [];
      if (!Number.isFinite(team.points)) team.points = 0;
      if (!Number.isFinite(team.rejectStreak)) team.rejectStreak = 0;
      if (!Number.isFinite(team.acceptStreak)) team.acceptStreak = 0;
      if (!Number.isFinite(team.coWorking)) team.coWorking = 0;
      if (typeof team.name !== 'string') team.name = '';
      if (!Number.isFinite(team.acceptedCount)) team.acceptedCount = 0;
      if (!Number.isFinite(team.rejectedCount)) team.rejectedCount = 0;
    });

    state.activities = normalizeCsvArray(state.activities).filter(Boolean);
    state.adversities = normalizeCsvArray(state.adversities).filter(Boolean);

    // Asegurar unicidad y relaciones equipo-estudiante
    state.teams.forEach(team => {
      team.memberIds = uniq(team.memberIds);
      team.memberIds.forEach(id => {
        const st = getStudentById(id);
        if (st) st.teamId = team.id;
      });
      if (team.memberIds.length) {
        if (!team.leaderId || !team.memberIds.includes(team.leaderId)) {
          const leader = team.memberIds.map(getStudentById).find(s => s && s.role === 'Líder') || getStudentById(team.memberIds[0]);
          team.leaderId = leader ? leader.id : team.memberIds[0];
        }
      }
    });

    // Las confirmaciones pendientes deben sobrevivir como objetos válidos
    Object.entries(state.pendingConfirmations).forEach(([k, v]) => {
      if (!v || typeof v !== 'object' || !v.teamId || !v.studentId) delete state.pendingConfirmations[k];
    });

    saveState();
  }

  function normalizeStudent(s) {
    if (!s || typeof s !== 'object') return s;
    return {
      id: s.id || uid('stu'),
      name: String(s.name || s.nombre || s.Nombre || 'Sin nombre').trim(),
      role: ROLES.includes(s.role || s.Rol || s.rol) ? (s.role || s.Rol || s.rol) : String(s.role || s.Rol || s.rol || 'Estratega'),
      teamId: s.teamId || null,
      points: Number.isFinite(s.points) ? s.points : 0,
      steps: Number.isFinite(s.steps) ? s.steps : 0,
      achievements: Array.isArray(s.achievements) ? s.achievements : [],
      reviews: Array.isArray(s.reviews) ? s.reviews : [],
      sessionSeconds: Number.isFinite(s.sessionSeconds) ? s.sessionSeconds : 0,
      sessionStartAt: s.sessionStartAt || null,
      createdAt: s.createdAt || Date.now(),
      lastLoginAt: s.lastLoginAt || null
    };
  }

  function normalizeTeam(t) {
    if (!t || typeof t !== 'object') return t;
    return {
      id: t.id || uid('team'),
      name: String(t.name || t.teamName || '').trim(),
      leaderId: t.leaderId || null,
      memberIds: Array.isArray(t.memberIds) ? t.memberIds : [],
      points: Number.isFinite(t.points) ? t.points : 0,
      rejectStreak: Number.isFinite(t.rejectStreak) ? t.rejectStreak : 0,
      acceptStreak: Number.isFinite(t.acceptStreak) ? t.acceptStreak : 0,
      acceptedCount: Number.isFinite(t.acceptedCount) ? t.acceptedCount : 0,
      rejectedCount: Number.isFinite(t.rejectedCount) ? t.rejectedCount : 0,
      coWorking: Number.isFinite(t.coWorking) ? t.coWorking : 0,
      log: Array.isArray(t.log) ? t.log : [],
      createdAt: t.createdAt || Date.now()
    };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      return { ...defaultState(), ...parsed };
    } catch (err) {
      console.warn('Error al cargar localStorage', err);
      return defaultState();
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
      console.warn('No se pudo guardar el estado', err);
    }
  }

  function persistCurrentSession() {
    const current = getCurrentStudent();
    if (!current) return;
    if (current.sessionStartAt) {
      const elapsed = Math.max(0, Math.floor((Date.now() - current.sessionStartAt) / 1000));
      current.sessionSeconds = (current.sessionSeconds || 0) + elapsed;
      current.sessionStartAt = Date.now();
      saveState();
    }
  }

  function tickSession() {
    const current = getCurrentStudent();
    if (!current) return;
    if (!current.sessionStartAt) current.sessionStartAt = Date.now();
    updateCurrentStudent(() => {});
  }

  function updateCurrentStudent(mutator) {
    const current = getCurrentStudent();
    if (!current) return null;
    mutator(current);
    saveState();
    return current;
  }

  function getCurrentStudent() {
    return state.students.find(s => s.id === state.ui.currentUserId) || null;
  }

  function getCurrentTeam() {
    const student = getCurrentStudent();
    if (!student || !student.teamId) return null;
    return getTeamById(student.teamId);
  }

  function getStudentById(id) {
    return state.students.find(s => s.id === id) || null;
  }

  function getTeamById(id) {
    return state.teams.find(t => t.id === id) || null;
  }

  function normalizeText(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  function splitCsvLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"' ) {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result.map(v => v.replace(/^"(.*)"$/s, '$1').trim());
  }

  function parseCSV(text) {
    const lines = String(text || '')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean);
    if (!lines.length) return [];
    const headers = splitCsvLine(lines[0]).map(h => h.trim());
    return lines.slice(1).map(line => {
      const cols = splitCsvLine(line);
      const obj = {};
      headers.forEach((h, i) => obj[h] = (cols[i] ?? '').trim());
      return obj;
    });
  }

  function normalizeCsvArray(value) {
    if (Array.isArray(value)) return value.map(v => (typeof v === 'string' ? v.trim() : String(v || '').trim())).filter(Boolean);
    if (typeof value === 'string') {
      return value.split(/\n|;/).map(v => v.trim()).filter(Boolean);
    }
    return [];
  }

  function uniq(arr) {
    return Array.from(new Set(arr));
  }

  function uid(prefix) {
    return `${prefix}_${Math.random().toString(36).slice(2, 9)}_${Date.now().toString(36)}`;
  }

  function formatDate(date) {
    const d = date instanceof Date ? date : new Date(date);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }

  function formatClock(seconds) {
    const total = Math.max(0, Math.floor(seconds || 0));
    const mm = String(Math.floor(total / 60)).padStart(2, '0');
    const ss = String(total % 60).padStart(2, '0');
    return `${mm}:${ss}`;
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function levenshtein(a, b) {
    a = normalizeText(a);
    b = normalizeText(b);
    const matrix = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
    for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
    for (let j = 0; j <= b.length; j++) matrix[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost
        );
      }
    }
    return matrix[a.length][b.length];
  }

  function similarity(a, b) {
    const aa = normalizeText(a);
    const bb = normalizeText(b);
    if (!aa || !bb) return 0;
    const dist = levenshtein(aa, bb);
    const maxLen = Math.max(aa.length, bb.length);
    return 1 - dist / Math.max(1, maxLen);
  }

  function toBase64Unicode(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    bytes.forEach(byte => bin += String.fromCharCode(byte));
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  function fromBase64Unicode(base64) {
    const normalized = base64.replace(/-/g, '+').replace(/_/g, '/');
    const pad = normalized.length % 4;
    const b64 = normalized + (pad ? '='.repeat(4 - pad) : '');
    const bin = atob(b64);
    const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  function encodeToken(payload) {
    return toBase64Unicode(JSON.stringify(payload));
  }

  function decodeToken(token) {
    try {
      return JSON.parse(fromBase64Unicode(String(token).trim()));
    } catch {
      return null;
    }
  }

  function toast(message, type = 'good') {
    const node = document.createElement('div');
    node.className = `toast ${type === 'bad' ? 'bad' : 'good'}`;
    node.textContent = message;
    els.toastZone.appendChild(node);
    setTimeout(() => {
      node.style.opacity = '0';
      node.style.transform = 'translateY(8px)';
      node.style.transition = 'all .25s ease';
      setTimeout(() => node.remove(), 300);
    }, 2600);
  }

  function openModal(title, bodyHtml) {
    els.modalTitulo.textContent = title;
    els.modalCuerpo.innerHTML = bodyHtml;
    els.modalGenerico.classList.remove('hidden');
  }

  function closeModal() {
    els.modalGenerico.classList.add('hidden');
    els.modalCuerpo.innerHTML = '';
  }

  function handleGlobalClick(e) {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    if (action === 'select-suggestion') {
      const id = btn.dataset.id;
      const student = getStudentById(id);
      if (student) {
        loginStudent(student.id);
        els.cajaSugerencia.classList.add('hidden');
      }
    } else if (action === 'toggle-student') {
      const card = btn.closest('.student-card');
      card?.classList.toggle('open');
    } else if (action === 'toggle-team') {
      const card = btn.closest('.team-card');
      card?.classList.toggle('open');
    } else if (action === 'copy-token') {
      navigator.clipboard?.writeText(btn.dataset.token || '').then(() => toast('Token copiado.', 'good')).catch(() => toast('No se pudo copiar el token.', 'bad'));
    } else if (action === 'set-team-name') {
      const teamId = btn.dataset.id;
      const input = document.querySelector(`#team-name-${teamId}`);
      if (!input) return;
      const team = getTeamById(teamId);
      if (!team) return;
      const name = input.value.trim();
      if (!name) return toast('Escribe un nombre de equipo.', 'bad');
      team.name = name;
      team.memberIds.forEach(id => awardAchievement(id, 'Principiante Artista', `Equipo bautizado como ${name}`));
      saveState();
      renderAll();
      toast('Equipo bautizado correctamente.', 'good');
    } else if (action === 'generate-invite') {
      const teamId = btn.dataset.teamId;
      const studentId = btn.dataset.studentId;
      const token = generateInviteToken(teamId, studentId);
      const payload = decodeToken(token);
      state.pendingConfirmations[token] = { type: 'invite', token, teamId, inviterId: studentId, createdAt: Date.now(), payload };
      saveState();
      renderAll();
      showTokenResult(`Token de invitación creado para ${getTeamDisplayName(teamId)}.`, token);
      toast('Token generado.', 'good');
    } else if (action === 'expand-all') {
      expandAllStudentCards();
    }
  }

  function handleGlobalDblClick(e) {
    const nameNode = e.target.closest('[data-double-achievement="curioso"]');
    if (!nameNode) return;
    const studentId = nameNode.dataset.studentId;
    const current = getCurrentStudent();
    if (!current || current.id !== studentId) return;
    const unlocked = awardAchievement(studentId, 'Más Curioso', 'Doble clic en su propio nombre');
    if (unlocked) {
      confetti();
      toast('Logro desbloqueado: Más Curioso', 'good');
      renderAll();
    }
  }

  function handleStudentLogin() {
    const raw = els.inputNombreEstudiante.value.trim();
    if (!raw) return toast('Escribe tu nombre completo.', 'bad');

    const students = state.students;
    if (!students.length) {
      els.cajaSugerencia.innerHTML = `
        <div class="notice error">No hay estudiantes cargados todavía. Pídele al profesor que suba el CSV.</div>
      `;
      els.cajaSugerencia.classList.remove('hidden');
      return;
    }

    const exact = students.find(s => normalizeText(s.name) === normalizeText(raw));
    if (exact) {
      loginStudent(exact.id);
      toast(`Hola, ${exact.name}.`, 'good');
      return;
    }

    const best = findBestStudentMatch(raw);
    if (best && best.score >= 0.55) {
      els.cajaSugerencia.classList.remove('hidden');
      els.cajaSugerencia.innerHTML = `
        <div>¿Quisiste decir: <strong>${escapeHtml(best.student.name)}</strong>?</div>
        <div class="suggestion-item">
          <span>${escapeHtml(best.student.role)} • ${escapeHtml(best.student.teamId ? getTeamDisplayName(best.student.teamId) : 'Sin equipo')}</span>
          <button class="secondary-btn" data-action="select-suggestion" data-id="${best.student.id}">¡Hacer clic aquí para entrar!</button>
        </div>
      `;
      toast('Encontré una coincidencia cercana.', 'good');
    } else {
      els.cajaSugerencia.classList.remove('hidden');
      els.cajaSugerencia.innerHTML = `<div class="notice error">No encontramos una coincidencia confiable. Revisa la escritura o pide al profesor cargar el CSV.</div>`;
      toast('No se encontró un nombre similar.', 'bad');
    }
  }

  function findBestStudentMatch(name) {
    let best = null;
    state.students.forEach(student => {
      const score = similarity(name, student.name);
      if (!best || score > best.score) best = { student, score };
    });
    return best;
  }

  function loginStudent(studentId) {
    persistCurrentSession();
    const student = getStudentById(studentId);
    if (!student) return;
    state.ui.currentRole = 'estudiante';
    state.ui.currentUserId = student.id;
    state.ui.activeView = ESTADOS.estudiante;
    student.sessionStartAt = Date.now();
    student.lastLoginAt = Date.now();
    saveState();
    renderAll();
    showView('estudiante');
    toast(`Sesión iniciada como ${student.name}.`, 'good');
  }

  function handleTeacherLogin() {
    const pass = els.inputClaveProfesor.value.trim();
    if (pass !== (state.settings?.teacherPassword || PASSWORD_PROFESOR)) {
      toast('Contraseña incorrecta.', 'bad');
      return;
    }
    persistCurrentSession();
    state.ui.currentRole = 'profesor';
    state.ui.currentUserId = null;
    state.ui.activeView = ESTADOS.profesor;
    saveState();
    renderAll();
    showView('profesor');
    toast('Acceso de profesor concedido.', 'good');
  }

  function logout() {
    persistCurrentSession();
    state.ui.currentRole = null;
    state.ui.currentUserId = null;
    state.ui.currentChallenge = null;
    state.ui.activeView = ESTADOS.inicio;
    saveState();
    renderAll();
    showView('inicio');
    toast('Sesión cerrada.', 'good');
  }

  function showView(view) {
    state.ui.activeView = view;
    saveState();

    const screens = {
      inicio: els.pantallaInicio,
      profesor: els.pantallaProfesor,
      estudiante: els.pantallaEstudiante,
      trofeos: els.pantallaTrofeos
    };

    Object.values(screens).forEach(el => el.classList.add('hidden'));
    if (view === 'inicio') {
      els.pantallaInicio.classList.remove('hidden');
      els.pantallaInicio.classList.add('screen-active');
    } else {
      Object.entries(screens).forEach(([key, el]) => {
        if (key === view) {
          el.classList.remove('hidden');
          el.classList.add('screen-active');
        } else {
          el.classList.remove('screen-active');
        }
      });
    }

    $$('.nav-link').forEach(btn => btn.classList.toggle('active', btn.dataset.vista === view));
    updateSessionBadge();
    if (view === 'estudiante') renderStudentPanel();
    if (view === 'profesor') renderTeacherPanel();
    if (view === 'trofeos') renderTrophiesPanel();
  }

  function renderAll() {
    updateSessionBadge();
    renderNavbar();
    renderLoginSuggestionBox();
    renderTeacherPanel();
    renderStudentPanel();
    renderTrophiesPanel();
    buildWheel();
    setViewVisibility();
  }

  function setViewVisibility() {
    const role = state.ui.currentRole;
    const view = state.ui.activeView || ESTADOS.inicio;
    const showTop = role !== null && view !== ESTADOS.inicio;
    els.btnSalir.classList.toggle('hidden', !showTop);
    els.navPrincipal.classList.toggle('hidden', !showTop || (window.innerWidth < 760 && !state.ui.menuOpen));
    els.statusSesion.textContent = role === 'profesor'
      ? 'Profesor conectado'
      : role === 'estudiante'
        ? `Estudiante: ${getCurrentStudent()?.name || 'activo'}`
        : 'Sin sesión';
    const screens = [
      ['pantallaInicio', 'inicio'],
      ['pantallaProfesor', 'profesor'],
      ['pantallaEstudiante', 'estudiante'],
      ['pantallaTrofeos', 'trofeos']
    ];
    screens.forEach(([id, key]) => {
      const el = els[id];
      const visible = key === view || (view === ESTADOS.inicio && key === 'inicio');
      el.classList.toggle('hidden', !visible);
      el.classList.toggle('screen-active', visible);
    });
  }

  function renderNavbar() {
    $$('.nav-link').forEach(btn => {
      if (btn.dataset.vista === 'profesor') {
        btn.classList.toggle('hidden', state.ui.currentRole !== 'profesor');
      } else if (btn.dataset.vista === 'estudiante') {
        btn.classList.toggle('hidden', state.ui.currentRole !== 'estudiante');
      } else if (btn.dataset.vista === 'trofeos') {
        btn.classList.toggle('hidden', !state.students.length);
      } else if (btn.dataset.vista === 'inicio') {
        btn.classList.remove('hidden');
      }
    });
  }

  function renderLoginSuggestionBox() {
    if (!els.cajaSugerencia) return;
    if (!els.cajaSugerencia.innerHTML) els.cajaSugerencia.classList.add('hidden');
  }

  function updateSessionBadge() {
    const current = getCurrentStudent();
    if (current) {
      const activeSeconds = current.sessionSeconds + (current.sessionStartAt ? Math.floor((Date.now() - current.sessionStartAt) / 1000) : 0);
      els.statusSesion.textContent = `${current.name} • ${formatClock(activeSeconds)}`;
    } else if (state.ui.currentRole === 'profesor') {
      els.statusSesion.textContent = 'Profesor conectado';
    } else {
      els.statusSesion.textContent = 'Sin sesión';
    }
  }

  function renderTeacherPanel() {
    if (!els.listaEstudiantesProfesor) return;
    const students = [...state.students];
    const teams = [...state.teams];
    const ranking = computeRanking();

    els.rankingGeneral.innerHTML = ranking.length ? ranking.map((team, idx) => `
      <div class="ranking-item">
        <div>
          <strong>#${idx + 1} ${escapeHtml(team.displayName)}</strong>
          <div class="muted">${team.memberCount} integrantes • ${team.points} pts</div>
        </div>
        <div class="badge-top">${team.points >= 0 ? '+' : ''}${team.points}</div>
      </div>
    `).join('') : `<div class="notice">Todavía no hay equipos.</div>`;

    els.listaEstudiantesProfesor.innerHTML = students.length ? students.map(student => {
      const team = student.teamId ? getTeamById(student.teamId) : null;
      const activeSeconds = student.sessionSeconds + (student.sessionStartAt ? Math.floor((Date.now() - student.sessionStartAt) / 1000) : 0);
      const reviews = student.reviews || [];
      const achievements = getStudentVisibleAchievements(student);
      return `
        <article class="student-card ${state.ui.expandedStudents?.includes?.(student.id) ? 'open' : ''}" data-student-id="${student.id}">
          <div class="student-head">
            <div>
              <div class="student-name" data-double-achievement="curioso" data-student-id="${student.id}">${escapeHtml(student.name)}</div>
              <div class="student-extra">
                <span class="role-badge">${escapeHtml(student.role)}</span>
                <span class="tag">${team ? escapeHtml(getTeamDisplayName(team.id)) : 'Sin equipo'}</span>
              </div>
            </div>
            <button class="small-btn" data-action="toggle-student">Abrir / cerrar</button>
          </div>
          <div class="accordion-body">
            <div class="student-body">
              <div class="tag">Tiempo activo: ${formatClock(activeSeconds)}</div>
              <div class="tag">Puntos individuales: ${student.points >= 0 ? '+' : ''}${student.points}</div>
              <div class="tag">Pasos dados: ${student.steps}</div>
              <div><strong>Logros</strong><div class="student-extra">${achievements.length ? achievements.map(a => `<span class="mini-badge">${escapeHtml(a.name)}</span>`).join('') : '<span class="muted">Sin logros aún</span>'}</div></div>
              <div><strong>Reseñas</strong><div class="feed-list">${reviews.length ? reviews.map(r => `<div class="feed-item"><strong>${escapeHtml(r.kind || 'Reseña')}</strong><div>${escapeHtml(r.text)}</div><div class="muted">${formatDate(r.date)}</div></div>`).join('') : '<div class="muted">Sin reseñas.</div>'}</div></div>
            </div>
          </div>
        </article>
      `;
    }).join('') : `<div class="notice">No hay alumnos cargados. Sube el CSV para comenzar.</div>`;

    els.listaEquiposProfesor.innerHTML = teams.length ? teams.map(team => {
      const members = team.memberIds.map(getStudentById).filter(Boolean);
      const perf = getTeamPerformance(team);
      return `
        <article class="team-card ${state.ui.expandedTeams?.includes?.(team.id) ? 'open' : ''}" data-team-id="${team.id}">
          <div class="team-head">
            <div>
              <div class="team-name">${escapeHtml(getTeamDisplayName(team.id))}</div>
              <div class="team-extra">
                <span class="tag">Puntos: ${team.points >= 0 ? '+' : ''}${team.points}</span>
                <span class="tag">Co-working: ${perf.coWorking}</span>
                <span class="tag">Rechazos: ${team.rejectedCount || 0}</span>
              </div>
            </div>
            <button class="small-btn" data-action="toggle-team">Abrir / cerrar</button>
          </div>
          <div class="accordion-body">
            <div class="team-body">
              <div><strong>Integrantes</strong> ${members.length ? members.map(m => `<span class="mini-badge">${escapeHtml(m.name)} • ${escapeHtml(m.role)}</span>`).join(' ') : '<span class="muted">Sin integrantes.</span>'}</div>
              <div><strong>Bitácora de desperfecciones</strong><div class="feed-list">${team.log.length ? team.log.slice().reverse().map(log => `<div class="feed-item"><div>${escapeHtml(log.text)}</div><div class="muted">${formatDate(log.date)}</div></div>`).join('') : '<div class="muted">Sin registros.</div>'}</div></div>
            </div>
          </div>
        </article>
      `;
    }).join('') : `<div class="notice">Todavía no se han conformado equipos.</div>`;
  }

  function getTeamPerformance(team) {
    const members = team.memberIds.map(getStudentById).filter(Boolean);
    const avgPoints = members.length ? Math.round(members.reduce((a, b) => a + (b.points || 0), 0) / members.length) : 0;
    const reviewCount = members.reduce((a, b) => a + (b.reviews?.length || 0), 0);
    const coWorking = Math.max(0, (team.acceptedCount || 0) * 4 + reviewCount * 2 + Math.max(0, avgPoints) + members.length);
    team.coWorking = coWorking;
    return { coWorking };
  }

  function renderStudentPanel() {
    const current = getCurrentStudent();
    if (!current) {
      els.saludoEstudiante.textContent = 'Bienvenido';
      els.tarjetaPerfilEstudiante.innerHTML = `<div class="notice">Inicia sesión como estudiante para ver tu perfil.</div>`;
      els.listaCompanerosEstudiante.innerHTML = '';
      els.listaFeedbacksRecibidos.innerHTML = '';
      return;
    }

    const team = getCurrentTeam();
    const teamName = team ? getTeamDisplayName(team.id) : 'Sin equipo';
    const activeSeconds = current.sessionSeconds + (current.sessionStartAt ? Math.floor((Date.now() - current.sessionStartAt) / 1000) : 0);
    const inviteRole = getActiveInviteRole();
    const canInvite = !team || (team.leaderId === current.id && current.role === inviteRole);
    const visibleAchievements = getStudentVisibleAchievements(current);
    const finalChampion = getTopTeam();

    els.saludoEstudiante.textContent = `Hola, ${current.name}`;
    els.badgeEquipoActual.textContent = team ? teamName : 'Sin equipo';

    els.tarjetaPerfilEstudiante.innerHTML = `
      <div class="profile-chip">Rol: ${escapeHtml(current.role)}</div>
      <div class="profile-chip">Equipo: ${escapeHtml(teamName)}</div>
      <div class="profile-chip">Tiempo activo: ${formatClock(activeSeconds)}</div>
      <div class="profile-chip">Puntos: ${current.points >= 0 ? '+' : ''}${current.points}</div>
      <div class="profile-chip">Pasos: ${current.steps}</div>
      <div class="profile-chip">Invitador activo: ${escapeHtml(inviteRole)}</div>
      <div class="profile-chip">Logros: ${visibleAchievements.length}</div>
      <div class="profile-chip">Equipo líder: ${team?.leaderId === current.id ? 'Sí' : 'No'}</div>
      <div class="stack">
        <strong>Logros visibles</strong>
        <div class="student-extra">${visibleAchievements.length ? visibleAchievements.map(a => `<span class="mini-badge">${escapeHtml(a.name)}</span>`).join('') : '<span class="muted">Aún no hay logros.</span>'}</div>
        ${team && finalChampion && finalChampion.id === team.id ? `
          <div class="notice success">
            <strong>Entre los Muertos</strong><br/>
            Equipo ganador del primer torneo a partir de un proyecto con fecha del ${fechaHoy}
          </div>
        ` : ''}
      </div>
      ${team && team.leaderId === current.id ? `
        <div class="stack">
          <label for="team-name-${team.id}">Nombre de tu equipo</label>
          <input id="team-name-${team.id}" type="text" placeholder="Ej. Los Invencibles" value="${escapeHtml(team.name || '')}" />
          <button class="primary-btn" data-action="set-team-name" data-id="${team.id}">Guardar nombre del equipo</button>
        </div>
      ` : ''}
      ${canInvite ? `
        <div class="stack">
          <button class="secondary-btn" data-action="${team ? 'generate-invite' : 'create-team'}" data-team-id="${team ? team.id : ''}" data-student-id="${current.id}">${team ? 'Generar token de invitación' : 'Fundar equipo'}</button>
          <div class="muted">Solo el rol habilitado puede invitar. El relevo automático ya se calcula aquí.</div>
        </div>
      ` : ''}
    `;

    const classmates = state.students.filter(s => s.id !== current.id);
    els.listaCompanerosEstudiante.innerHTML = classmates.length ? classmates.map(student => {
      const stTeam = student.teamId ? getTeamById(student.teamId) : null;
      const isMeInOtherTab = current.id === student.id;
      const eligible = canInviteStudent(student, current);
      return `
        <article class="student-card ${isMeInOtherTab ? 'open' : ''}">
          <div class="student-head">
            <div>
              <div class="student-name">${escapeHtml(student.name)}</div>
              <div class="student-extra">
                <span class="role-badge">${escapeHtml(student.role)}</span>
                <span class="tag">${stTeam ? escapeHtml(getTeamDisplayName(stTeam.id)) : 'Sin equipo'}</span>
              </div>
            </div>
            ${eligible ? `<button class="small-btn" data-action="generate-invite" data-team-id="${team ? team.id : ''}" data-student-id="${current.id}">Invitar</button>` : ''}
          </div>
          <div class="accordion-body">
            <div class="student-body">
              <div class="muted">Puntos: ${student.points >= 0 ? '+' : ''}${student.points} • Pasos: ${student.steps}</div>
              <div class="muted">Esta ficha es interactiva y muestra el estado actual del alumno.</div>
            </div>
          </div>
        </article>
      `;
    }).join('') : `<div class="notice">No hay compañeros cargados todavía.</div>`;

    buildFeedbackOptions();
    renderReceivedFeedbacks();
    buildWheel();
    updateChallengeCard();
  }

  function canInviteStudent(student, current) {
    const team = getCurrentTeam();
    if (!team || !current) return false;
    if (team.leaderId !== current.id) return false;
    const inviteRole = getActiveInviteRole();
    return current.role === inviteRole;
  }

  function buildFeedbackOptions() {
    const current = getCurrentStudent();
    const team = getCurrentTeam();
    if (!els.selectCompaneroFeedback) return;
    const members = team ? team.memberIds.map(getStudentById).filter(Boolean).filter(s => s.id !== current?.id) : [];
    els.selectCompaneroFeedback.innerHTML = members.length
      ? members.map(m => `<option value="${m.id}">${escapeHtml(m.name)} (${escapeHtml(m.role)})</option>`).join('')
      : `<option value="">No hay compañeros en tu equipo</option>`;
  }

  function renderReceivedFeedbacks() {
    const current = getCurrentStudent();
    if (!current) return;
    const received = current.reviews || [];
    els.listaFeedbacksRecibidos.innerHTML = received.length
      ? received.slice().reverse().map(r => `
        <div class="feed-item">
          <strong>${escapeHtml(r.kind || 'Reseña')}</strong>
          <div>${escapeHtml(r.text)}</div>
          <div class="muted">De: ${escapeHtml(getStudentById(r.fromId)?.name || 'Desconocido')} • ${formatDate(r.date)}</div>
        </div>
      `).join('')
      : `<div class="notice">Aún no recibes feedbacks.</div>`;
  }

  function buildWheel() {
    if (!els.ruletaActividades) return;
    const list = state.activities.length ? state.activities : ['Cargar actividades desde CSV'];
    const step = 360 / list.length;
    const colors = ['#7c5cff', '#20e3b2', '#ff4ecd', '#ffd166', '#4fb0ff', '#8dff6a', '#ff8a5b'];
    const segments = list.map((item, i) => {
      const start = i * step;
      const end = (i + 1) * step;
      return `${colors[i % colors.length]} ${start}deg ${end}deg`;
    }).join(', ');
    els.ruletaActividades.style.background = list.length > 1
      ? `radial-gradient(circle at center, rgba(255,255,255,.1), transparent 52%), conic-gradient(from ${state.ui.spinRotation || 0}deg, ${segments})`
      : 'radial-gradient(circle at center, rgba(255,255,255,.1), transparent 52%), conic-gradient(from 0deg, #7c5cff, #20e3b2)';
  }

  function spinWheel() {
    const team = getCurrentTeam();
    if (!team) return toast('Primero debes estar en un equipo.', 'bad');
    if (!state.activities.length) return toast('Faltan actividades cargadas.', 'bad');

    const rotation = (state.ui.spinRotation || 0) + 720 + Math.floor(Math.random() * 720);
    state.ui.spinRotation = rotation;

    const selectedIndex = Math.floor(Math.random() * state.activities.length);
    const selected = state.activities[selectedIndex];

    els.ruletaActividades.style.transform = `rotate(${rotation}deg)`;
    saveState();

    setTimeout(() => {
      state.ui.currentChallenge = {
        teamId: team.id,
        activity: selected,
        pickedAt: Date.now()
      };
      saveState();
      updateChallengeCard();
      toast(`Reto seleccionado para ${getTeamDisplayName(team.id)}.`, 'good');
    }, 1200);
  }

  function updateChallengeCard() {
    const challenge = state.ui.currentChallenge;
    if (!challenge) {
      els.tarjetaReto.classList.add('hidden');
      els.tarjetaAdversidad.classList.add('hidden');
      return;
    }
    els.tarjetaReto.classList.remove('hidden');
    els.retoTitulo.textContent = challenge.activity.name || 'Actividad';
    els.retoDescripcion.textContent = challenge.activity.description || 'Sin descripción';
  }

  function updateCurrentChallengeTimer() {
    const challenge = state.ui.currentChallenge;
    if (!challenge) return;
    updateChallengeCard();
  }

  function rejectChallenge() {
    const team = getCurrentTeam();
    const challenge = state.ui.currentChallenge;
    if (!team || !challenge || challenge.teamId !== team.id) return toast('No hay reto activo para tu equipo.', 'bad');

    team.rejectStreak = (team.rejectStreak || 0) + 1;
    team.acceptStreak = 0;
    const penalty = team.rejectStreak;
    team.points -= penalty;
    team.rejectedCount = (team.rejectedCount || 0) + 1;
    team.log.push({
      date: Date.now(),
      text: `Rechazo de reto "${challenge.activity.name || 'actividad'}" con penalización -${penalty} puntos.`
    });

    const current = getCurrentStudent();
    if (current) {
      current.points -= penalty;
      current.steps += Math.max(0, 60 - penalty * 5);
    }

    if (team.points < -3) {
      team.lowPointsFlag = true;
    }

    state.ui.currentChallenge = null;
    saveState();
    renderAll();
    toast(`Penalización aplicada: -${penalty} puntos.`, 'bad');
  }

  function acceptChallenge() {
    const team = getCurrentTeam();
    const challenge = state.ui.currentChallenge;
    if (!team || !challenge || challenge.teamId !== team.id) return toast('No hay reto activo para tu equipo.', 'bad');

    const current = getCurrentStudent();
    const hadLowPoints = team.points < -3 || team.lowPointsFlag;
    team.rejectStreak = 0;
    team.acceptStreak = (team.acceptStreak || 0) + 1;
    team.acceptedCount = (team.acceptedCount || 0) + 1;
    team.lowPointsFlag = false;
    team.log.push({
      date: Date.now(),
      text: `Reto aceptado: "${challenge.activity.name || 'actividad'}".`
    });

    const adversity = pickRandom(state.adversities) || 'Sigan adelante con un reto sorpresa.';
    els.tarjetaAdversidad.classList.remove('hidden');
    els.tarjetaAdversidad.innerHTML = `<strong>¡Reto Aceptado!</strong><div>Adversidad: ${escapeHtml(adversity)}</div>`;

    const members = team.memberIds.map(getStudentById).filter(Boolean);
    members.forEach(member => {
      member.steps += 180 + Math.floor(Math.random() * 240);
      member.points += 1;
    });
    team.points += 3;

    if (current) current.points += 2;

    if (team.acceptStreak >= 3) {
      members.forEach(m => awardAchievement(m.id, 'Espíritu Inquebrantable', 'Aceptó 3 actividades seguidas sin rechazar ninguna'));
      confetti();
      toast('Logro desbloqueado: Espíritu Inquebrantable', 'good');
      team.acceptStreak = 0;
    }

    if (hadLowPoints) {
      members.forEach(m => awardAchievement(m.id, 'Prueba de Fuego', 'Cayó bajo -3 puntos y luego aceptó una actividad'));
      confetti();
      toast('Logro desbloqueado: Prueba de Fuego', 'good');
    }

    state.ui.currentChallenge = null;
    saveState();
    renderAll();
    updateChampionAchievement();
  }

  function pickRandom(list) {
    if (!Array.isArray(list) || !list.length) return null;
    return list[Math.floor(Math.random() * list.length)];
  }

  function createTeamForCurrentUser() {
    const current = getCurrentStudent();
    if (!current) return toast('Necesitas iniciar sesión como estudiante.', 'bad');
    if (current.teamId) return toast('Ya perteneces a un equipo.', 'bad');
    const inviteRole = getActiveInviteRole();
    if (current.role !== inviteRole) return toast(`Solo el rol habilitado puede fundar equipo ahora. Disponible: ${inviteRole}.`, 'bad');

    const team = {
      id: uid('team'),
      name: '',
      leaderId: current.id,
      memberIds: [current.id],
      points: 0,
      rejectStreak: 0,
      acceptStreak: 0,
      acceptedCount: 0,
      rejectedCount: 0,
      coWorking: 0,
      log: [{ date: Date.now(), text: `Escuadra fundada por ${current.name}.` }],
      createdAt: Date.now()
    };
    state.teams.push(team);
    current.teamId = team.id;
    saveState();
    renderAll();
    toast('Escuadra fundada. Ahora puedes bautizarla.', 'good');
  }

  function generateInviteToken(teamId, inviterStudentId) {
    const team = getTeamById(teamId) || getCurrentTeam();
    const inviter = getStudentById(inviterStudentId);
    if (!team) {
      if (!inviter || inviter.teamId) return encodeToken({ type: 'noop' });
      return encodeToken({ type: 'draft', inviterId: inviter.id, createdAt: Date.now() });
    }
    return encodeToken({
      v: 1,
      type: 'invite',
      teamId: team.id,
      inviterId: inviter.id,
      teamName: team.name || '',
      createdAt: Date.now(),
      nonce: Math.random().toString(36).slice(2, 10)
    });
  }

  function acceptInvitationToken() {
    const token = els.inputTokenInvitacion.value.trim();
    if (!token) return toast('Pega un token de invitación.', 'bad');
    const data = decodeToken(token);
    if (!data || data.type !== 'invite') return toast('Token inválido.', 'bad');

    const current = getCurrentStudent();
    if (!current) return toast('Inicia sesión como estudiante.', 'bad');
    if (current.teamId) return toast('Ya perteneces a un equipo.', 'bad');

    const team = getTeamById(data.teamId);
    if (!team) return toast('El equipo ya no existe.', 'bad');
    if (team.memberIds.length >= 5) return toast('Ese equipo ya alcanzó el tamaño máximo.', 'bad');
    if (current.role === 'Líder' && team.leaderId) return toast('Un equipo solo puede tener un Líder.', 'bad');

    const confirmToken = encodeToken({
      v: 1,
      type: 'confirm',
      teamId: team.id,
      studentId: current.id,
      inviterId: data.inviterId,
      createdAt: Date.now(),
      nonce: Math.random().toString(36).slice(2, 10)
    });

    state.pendingConfirmations[confirmToken] = {
      type: 'confirm',
      teamId: team.id,
      studentId: current.id,
      inviterId: data.inviterId,
      createdAt: Date.now()
    };
    saveState();
    showTokenResult('Invitación aceptada. Copia el token de confirmación y envíaselo al líder para consolidar la unión.', confirmToken);
    toast('Se generó tu token de confirmación.', 'good');
  }

  function confirmUnionToken() {
    const token = els.inputTokenInvitacion.value.trim();
    if (!token) return toast('Pega el token de confirmación.', 'bad');
    const data = decodeToken(token);
    if (!data || data.type !== 'confirm') return toast('Token de confirmación inválido.', 'bad');

    const current = getCurrentStudent();
    if (!current) return toast('Debes estar en sesión como estudiante líder.', 'bad');

    const team = getTeamById(data.teamId);
    const student = getStudentById(data.studentId);
    if (!team || !student) return toast('No se encontró el equipo o el alumno.', 'bad');
    if (team.leaderId !== current.id) return toast('Solo el líder del equipo puede confirmar la unión.', 'bad');
    if (student.teamId) return toast('Ese alumno ya pertenece a un equipo.', 'bad');
    if (team.memberIds.length >= 5) return toast('El equipo ya está completo.', 'bad');
    if (student.role === 'Líder') return toast('No se puede añadir otro Líder a este equipo.', 'bad');

    team.memberIds.push(student.id);
    student.teamId = team.id;
    if (!team.name) {
      team.log.push({ date: Date.now(), text: `${student.name} se unió al equipo en espera de bautizo.` });
    } else {
      team.log.push({ date: Date.now(), text: `${student.name} se unió al equipo ${team.name}.` });
    }

    if (team.memberIds.length >= 3 && team.name) {
      team.memberIds.forEach(id => awardAchievement(id, 'Principiante Artista', `Equipo bautizado como ${team.name}`));
    }

    delete state.pendingConfirmations[token];
    saveState();
    renderAll();
    toast(`${student.name} se unió correctamente al equipo.`, 'good');
  }

  function sendFeedback() {
    const current = getCurrentStudent();
    const team = getCurrentTeam();
    if (!current || !team) return toast('Debes estar en un equipo para enviar feedback.', 'bad');

    const targetId = els.selectCompaneroFeedback.value;
    const text = els.textoFeedback.value.trim();
    const isReport = els.checkDesperfeccion.checked;

    if (!targetId) return toast('Selecciona un compañero.', 'bad');
    if (!text) return toast('Escribe una reseña corta.', 'bad');

    const target = getStudentById(targetId);
    if (!target || target.teamId !== team.id) return toast('Solo puedes reseñar a alguien de tu mismo equipo.', 'bad');

    const review = {
      id: uid('rev'),
      fromId: current.id,
      toId: target.id,
      kind: isReport ? 'Desperfección' : 'Reseña',
      text,
      date: Date.now()
    };
    target.reviews.push(review);
    if (isReport) {
      const teamObj = getTeamById(team.id);
      teamObj.log.push({
        date: Date.now(),
        text: `Reporte de desperfección sobre ${target.name}: ${text}`
      });
    }
    saveState();
    renderAll();
    els.textoFeedback.value = '';
    els.checkDesperfeccion.checked = false;
    toast('Feedback enviado.', 'good');
  }

  function awardAchievement(studentId, name, description) {
    const student = getStudentById(studentId);
    if (!student) return false;
    student.achievements = student.achievements || [];
    const exists = student.achievements.some(a => a.name === name);
    if (exists) return false;
    student.achievements.push({
      name,
      description,
      date: Date.now()
    });
    saveState();
    return true;
  }

  function getStudentVisibleAchievements(student) {
    const list = Array.isArray(student.achievements) ? [...student.achievements] : [];
    const team = student.teamId ? getTeamById(student.teamId) : null;
    const championTeam = getTopTeam();
    if (team && championTeam && team.id === championTeam.id) {
      list.push({
        name: 'Entre los Muertos',
        description: `Equipo ganador del primer torneo a partir de un proyecto con fecha del ${fechaHoy}`
      });
    }
    return uniqByName(list);
  }

  function uniqByName(list) {
    const seen = new Set();
    return list.filter(item => {
      if (!item || !item.name) return false;
      if (seen.has(item.name)) return false;
      seen.add(item.name);
      return true;
    });
  }

  function getTopTeam() {
    if (!state.teams.length) return null;
    const ranking = computeRanking();
    return ranking[0] ? getTeamById(ranking[0].id) : null;
  }

  function updateChampionAchievement() {
    // Dinámico por render; aquí solo re-renderizamos si hay sesión activa.
    renderTrophiesPanel();
  }

  function computeRanking() {
    const teams = state.teams.map(team => {
      const members = team.memberIds.map(getStudentById).filter(Boolean);
      const total = members.reduce((a, b) => a + (b.points || 0), 0) + (team.points || 0);
      team.points = total;
      const displayName = team.name?.trim() ? team.name.trim() : `Equipo ${team.id.slice(-4)}`;
      return { ...team, displayName, memberCount: members.length, points: total };
    });
    teams.sort((a, b) => b.points - a.points || b.memberCount - a.memberCount);
    return teams;
  }

  function getTeamDisplayName(teamId) {
    const team = getTeamById(teamId);
    if (!team) return 'Sin equipo';
    return team.name?.trim() ? team.name.trim() : `Equipo ${team.id.slice(-4)}`;
  }

  function getActiveInviteRole() {
    const order = ROLES;
    for (const role of order) {
      const available = state.students.some(s => !s.teamId && s.role === role);
      if (available) return role;
    }
    return order[order.length - 1];
  }

  function renderTrophiesPanel() {
    const current = getCurrentStudent();
    const currentTeam = current?.teamId ? getTeamById(current.teamId) : null;
    const championTeam = getTopTeam();
    const fechaTexto = fechaHoy;

    const trophies = [
      {
        name: 'Más Curioso',
        description: 'Doble clic en tu propio nombre.',
        unlocked: current ? (current.achievements || []).some(a => a.name === 'Más Curioso') : false
      },
      {
        name: 'Principiante Artista',
        description: 'Formar un equipo con nombre asignado.',
        unlocked: current ? (current.achievements || []).some(a => a.name === 'Principiante Artista') : false
      },
      {
        name: 'Espíritu Inquebrantable',
        description: 'Aceptar 3 actividades seguidas sin rechazar ninguna.',
        unlocked: current ? (current.achievements || []).some(a => a.name === 'Espíritu Inquebrantable') : false
      },
      {
        name: 'Prueba de Fuego',
        description: 'Caer a una puntuación menor a -3 puntos por rechazos y luego aceptar una actividad.',
        unlocked: current ? (current.achievements || []).some(a => a.name === 'Prueba de Fuego') : false
      },
      {
        name: 'Entre los Muertos',
        description: `Equipo ganador del primer torneo a partir de un proyecto con fecha del ${fechaTexto}`,
        unlocked: !!(currentTeam && championTeam && currentTeam.id === championTeam.id)
      }
    ];

    els.vitrinaTrofeos.innerHTML = trophies.map(t => `
      <article class="trophy-card ${t.unlocked ? 'unlocked' : 'locked'}">
        <div class="trophy-title">
          <div class="trophy-medal"></div>
          <div>
            <div class="student-name">${escapeHtml(t.name)}</div>
            <div class="muted">${escapeHtml(t.description)}</div>
          </div>
        </div>
        <div class="badge-top">${t.unlocked ? 'Desbloqueado' : 'Bloqueado'}</div>
      </article>
    `).join('');
  }

  function showTokenResult(message, token) {
    els.salidaToken.classList.remove('hidden');
    els.salidaToken.classList.add('success');
    els.salidaToken.innerHTML = `
      <div><strong>${escapeHtml(message)}</strong></div>
      <textarea rows="4" readonly>${escapeHtml(token)}</textarea>
      <div class="actions-row">
        <button class="secondary-btn" data-action="copy-token" data-token="${escapeHtml(token)}">Copiar token</button>
      </div>
    `;
    els.inputTokenInvitacion.value = token;
  }

  function handleLoadCsvs() {
    const fileEstudiantes = els.csvEstudiantes.files[0];
    const fileActividades = els.csvActividades.files[0];
    const fileAdversidades = els.csvAdversidades.files[0];

    if (!fileEstudiantes || !fileActividades || !fileAdversidades) {
      els.estadoCarga.className = 'notice error';
      els.estadoCarga.textContent = 'Debes cargar los 3 archivos CSV.';
      return;
    }

    Promise.all([
      readFile(fileEstudiantes),
      readFile(fileActividades),
      readFile(fileAdversidades)
    ]).then(([txtEstudiantes, txtActividades, txtAdversidades]) => {
      const estudiantes = parseCSV(txtEstudiantes);
      const actividades = parseCSV(txtActividades);
      const adversidades = parseCSV(txtAdversidades);

      const newStudents = estudiantes.map(row => {
        const name = row['Nombre del Alumno'] || row['Nombre'] || row['nombre'] || Object.values(row)[0] || '';
        const role = row['Rol Designado'] || row['Rol'] || row['rol'] || Object.values(row)[1] || 'Estratega';
        return {
          id: uid('stu'),
          name: String(name).trim(),
          role: ROLES.includes(String(role).trim()) ? String(role).trim() : 'Estratega',
          teamId: null,
          points: 0,
          steps: 0,
          achievements: [],
          reviews: [],
          sessionSeconds: 0,
          sessionStartAt: null,
          createdAt: Date.now(),
          lastLoginAt: null
        };
      }).filter(s => s.name);

      const newActivities = actividades.map(row => {
        const name = row['Nombre de la actividad'] || row['Nombre'] || Object.values(row)[0] || '';
        const description = row['Descripción'] || row['Descripcion'] || Object.values(row)[1] || '';
        return { name: String(name).trim(), description: String(description).trim() };
      }).filter(a => a.name);

      const newAdversities = adversidades.map(row => {
        return String(row['adversidades'] || row['Adversidades'] || row['adversidad'] || Object.values(row)[0] || '').trim();
      }).filter(Boolean);

      state.students = newStudents;
      state.activities = newActivities;
      state.adversities = newAdversities;
      state.teams = [];
      state.pendingConfirmations = {};
      state.ui.currentUserId = null;
      state.ui.currentRole = null;
      state.ui.currentChallenge = null;
      saveState();
      migrateState();
      renderAll();
      els.estadoCarga.className = 'notice success';
      els.estadoCarga.textContent = `Cargados: ${newStudents.length} estudiantes, ${newActivities.length} actividades y ${newAdversities.length} adversidades.`;
      toast('CSV cargados con éxito.', 'good');
    }).catch(err => {
      console.error(err);
      els.estadoCarga.className = 'notice error';
      els.estadoCarga.textContent = 'Ocurrió un error al leer los archivos.';
      toast('No se pudieron leer los archivos.', 'bad');
    });
  }

  function readFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = reject;
      reader.readAsText(file, 'UTF-8');
    });
  }

  function resetAllData() {
    if (!confirm('¿Seguro que deseas borrar toda la información local?')) return;
    state = defaultState();
    localStorage.removeItem(STORAGE_KEY);
    hydrateIds();
    renderAll();
    toast('Datos reiniciados.', 'good');
  }

  function expandAllStudentCards() {
    const cards = $$('.student-card', els.listaEstudiantesProfesor);
    cards.forEach(card => card.classList.add('open'));
    toast('Todas las fichas se abrieron.', 'good');
  }

  function hydrateIds() {
    if (!state.ui) return;
    state.ui.expandedStudents = state.ui.expandedStudents || [];
    state.ui.expandedTeams = state.ui.expandedTeams || [];
  }

  function confetti() {
    const count = 56;
    for (let i = 0; i < count; i++) {
      const piece = document.createElement('div');
      piece.className = 'confetti';
      piece.style.left = `${Math.random() * 100}vw`;
      piece.style.background = `hsl(${Math.floor(Math.random() * 360)}, 90%, 65%)`;
      piece.style.animationDuration = `${1.4 + Math.random() * 1.4}s`;
      piece.style.transform = `translateY(-10vh) rotate(${Math.random() * 180}deg)`;
      piece.style.width = `${8 + Math.random() * 8}px`;
      piece.style.height = `${10 + Math.random() * 16}px`;
      document.body.appendChild(piece);
      setTimeout(() => piece.remove(), 3200);
    }
  }

  function showCurrentStudentInTeacherProfile() {
    // reservado para ampliación futura
  }

  // Inicialización de permisos y vistas
  function renderNavbarInitialState() {
    renderNavbar();
    updateSessionBadge();
  }

  renderNavbarInitialState();

  // Inyección de criterios de logro de campeón al cambiar ranking
  setInterval(() => {
    updateChampionAchievement();
  }, 5000);
})();
