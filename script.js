const $ = id => document.getElementById(id);
const LABELS = { focus: 'Focus', short: 'Break', long: 'Long Break' };

function load(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
    catch { return fallback; }
}
function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { }
}
function today() { return new Date().toLocaleDateString('en-CA'); }
function getStats() {
    const s = load('pomodoro_stats', null);
    return s && s.date === today() ? s : { date: today(), count: 0 };
}

let settings = load('pomodoro_settings', { focus: 25, short: 5, long: 15 });
let mode = 'focus';
let remaining = settings.focus * 60;
let endTime = null;
let timerId = null;
const music = new Audio();
music.loop = true;
music.volume = 0.3;
let track = load('pomodoro_track', 'none');

function playMusic() {
    if (track === 'none') return;
    if (!music.src.endsWith(track)) music.src = track;
    music.play().catch(() => { });
}

function render() {
    const m = String(Math.floor(remaining / 60)).padStart(2, '0');
    const s = String(remaining % 60).padStart(2, '0');
    $('time').textContent = `${m}:${s}`;
    $('mode').textContent = LABELS[mode];
    $('count').textContent = getStats().count;
    document.title = `${m}:${s} · ${LABELS[mode]}`;
    document.body.className = mode;
}

let audioCtx;
function unlockAudio() {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
}
function playNotes(notes) {
    if (!audioCtx) return;
    notes.forEach(([freq, start, dur]) => {
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        const t0 = audioCtx.currentTime + start;
        o.type = 'sine';
        o.frequency.value = freq;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.25, t0 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        o.connect(g); g.connect(audioCtx.destination);
        o.start(t0);
        o.stop(t0 + dur + 0.05);
    });
}

// Each note is [frequency in Hz, start time in seconds, length in seconds]
function twice(notes, gap) {
    const end = Math.max(...notes.map(([f, s, d]) => s + d));
    const offset = end + gap;
    return [...notes, ...notes.map(([f, s, d]) => [f, s + offset, d])];
}

const FOCUS_NOTES = [[880, 0, 0.15], [880, 0.25, 0.15], [880, 0.5, 0.15]];
const SHORT_NOTES = [[523, 0, 0.4], [659, 0.3, 0.4], [784, 0.6, 0.8]];

const SOUNDS = {
    focus: () => playNotes(twice(FOCUS_NOTES, 0.4)),
    short: () => playNotes(twice(SHORT_NOTES, 0.4)),
    long: () => playNotes([
        [523, 0, 0.5], [659, 0.25, 0.5], [784, 0.5, 0.5], [1047, 0.75, 0.6],   // rising run
        [523, 1.2, 2.2], [659, 1.2, 2.2], [784, 1.2, 2.2]                       // held chord
    ])
};

function duration(m) { return settings[m] * 60; }

function tick() {
    remaining = Math.max(0, Math.round((endTime - Date.now()) / 1000));
    render();
    if (remaining === 0) finish();
}
function start() {
    if (timerId) return;
    unlockAudio();
    playMusic();
    endTime = Date.now() + remaining * 1000;
    timerId = setInterval(tick, 250);
}
function pause() {
    if (!timerId) return;
    remaining = Math.max(0, Math.round((endTime - Date.now()) / 1000));
    clearInterval(timerId);
    music.pause();
    timerId = null;
    render();
}
function reset() {
    clearInterval(timerId);
    music.pause();
    timerId = null;
    remaining = duration(mode);
    render();
}

function finish() {
    clearInterval(timerId);
    timerId = null;
    if (mode === 'focus') {
        const stats = getStats();
        stats.count++;
        save('pomodoro_stats', stats);
        mode = stats.count % 4 === 0 ? 'long' : 'short';
    } else {
        mode = 'focus';
    }

    SOUNDS[mode]();            // plays the sound for the session that is starting
    remaining = duration(mode);
    render();
    start();
}

$('start').addEventListener('click', start);
$('pause').addEventListener('click', pause);
$('reset').addEventListener('click', reset);

const inputs = { focus: 'focusMin', short: 'shortMin', long: 'longMin' };
for (const [key, id] of Object.entries(inputs)) {
    $(id).value = settings[key];
    $(id).addEventListener('change', e => {
        const v = parseFloat(e.target.value);
        if (!(v > 0)) { e.target.value = settings[key]; return; }
        settings[key] = v;
        save('pomodoro_settings', settings);
        if (!timerId) { remaining = duration(mode); render(); }
    });
}

const sel = $('musicSelect');
sel.value = track;
if (sel.value !== track) { track = 'none'; sel.value = 'none'; }

sel.addEventListener('change', () => {
    track = sel.value;
    save('pomodoro_track', track);
    music.pause();
    if (track !== 'none' && timerId) playMusic();
});
render();