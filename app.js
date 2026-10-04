/* ===========================================================
 * app.js ― 画面の担当
 *
 * sudoku.js が作った問題を受け取って、
 *  ・盤面を描く
 *  ・タップやキーボードを受け取る
 *  ・途中経過をブラウザに保存する
 * をやります。
 * =========================================================== */

// よく使う画面の部品を先に掴んでおく
const boardEl    = document.getElementById('board');
const padEl      = document.getElementById('pad');
const diffChip   = document.getElementById('diffChip');
const timeChip   = document.getElementById('timeChip');
const missChip   = document.getElementById('missChip');
const overlay    = document.getElementById('overlay');
const overlaySub = document.getElementById('overlaySub');
const memoBtn    = document.getElementById('memoBtn');
const undoBtn    = document.getElementById('undoBtn');
const diffSelect = document.getElementById('diffSelect');

const SAVE_KEY = 'sudoku-save-v1';   // ブラウザに保存するときの名前

/* -----------------------------------------------------------
 * ゲームの状態を、この1つのオブジェクトにまとめて持つ。
 * 「今どうなっているか」が全部ここを見れば分かる、という形にしておくと
 * バグを追いかけるのがぐっと楽になります。
 * --------------------------------------------------------- */
const state = {
  difficulty: 'normal',
  puzzle:   [],          // 出題された盤面（0は空白）。0以外のマスは変更できない
  solution: [],          // 答え
  board:    [],          // 今プレイヤーが作っている盤面
  memos:    [],          // 81個の Set。メモ（小さい数字）
  hinted:   new Set(),   // ヒントで埋めたマス
  selected: null,        // 今選んでいるマスの番号
  memoMode: false,
  mistakes: 0,
  hints:    0,
  seconds:  0,
  history:  [],          // 「戻す」用の履歴
  done:     false,
};

let cells = [];          // 81個の <div class="cell">
let timerId = null;


/* -----------------------------------------------------------
 * 画面の部品を最初に1回だけ作る
 * （毎回 HTML を作り直すと遅いので、作るのは1回、あとは中身を書き換える）
 * --------------------------------------------------------- */

function buildBoard() {
  boardEl.innerHTML = '';
  cells = [];

  for (let i = 0; i < 81; i++) {
    const row = Math.floor(i / 9);
    const col = i % 9;

    const cell = document.createElement('div');
    cell.className = 'cell';
    // 3x3 の境目に太い罫線を引くための目印
    if (col === 2 || col === 5) cell.classList.add('edge-right');
    if (row === 2 || row === 5) cell.classList.add('edge-bottom');
    if (col === 8) cell.classList.add('last-col');
    if (row === 8) cell.classList.add('last-row');

    const value = document.createElement('span');
    value.className = 'value';

    const memos = document.createElement('div');
    memos.className = 'memos';
    for (let m = 0; m < 9; m++) memos.appendChild(document.createElement('span'));

    cell.append(value, memos);
    cell.addEventListener('click', () => selectCell(i));

    boardEl.appendChild(cell);
    cells.push(cell);
  }
}

function buildPad() {
  padEl.innerHTML = '';
  for (let v = 1; v <= 9; v++) {
    const btn = document.createElement('button');
    btn.className = 'num';
    btn.innerHTML = v + '<span class="left"></span>';
    btn.addEventListener('click', () => inputNumber(v));
    padEl.appendChild(btn);
  }
}


/* -----------------------------------------------------------
 * 状態 → 画面 に反映する（この関数がこのアプリの心臓部）
 *
 * 大事な考えかた:
 *   「状態を書き換える」と「画面を描く」を分ける。
 *   状態をいじったら最後に render() を呼ぶ、とルールを決めておけば、
 *   画面と中身がズレるバグがほぼ起きなくなります。
 * --------------------------------------------------------- */

function render() {
  const conflicts = Sudoku.findConflicts(state.board);
  const sel = state.selected;
  const selValue = sel === null ? 0 : state.board[sel];

  for (let i = 0; i < 81; i++) {
    const cell  = cells[i];
    const v     = state.board[i];
    const given = state.puzzle[i] !== 0;

    cell.classList.toggle('given',    given);
    cell.classList.toggle('filled',   !given && v !== 0);
    cell.classList.toggle('wrong',    v !== 0 && v !== state.solution[i]);
    cell.classList.toggle('hinted',   state.hinted.has(i));
    cell.classList.toggle('conflict', conflicts.has(i));
    cell.classList.toggle('related',  sel !== null && Sudoku.PEERS[sel].has(i));
    cell.classList.toggle('same',     selValue !== 0 && v === selValue && i !== sel);
    cell.classList.toggle('selected', i === sel);

    cell.querySelector('.value').textContent = v === 0 ? '' : v;

    // メモは、数字が入っていないマスにだけ表示する
    const memoSpans = cell.querySelector('.memos').children;
    for (let m = 1; m <= 9; m++) {
      memoSpans[m - 1].textContent = (v === 0 && state.memos[i].has(m)) ? m : '';
    }
  }

  // 数字ボタンに「あと何個置けるか」を出す
  for (let v = 1; v <= 9; v++) {
    let placed = 0;
    for (let i = 0; i < 81; i++) if (state.board[i] === v) placed++;
    const btn  = padEl.children[v - 1];
    const left = 9 - placed;
    btn.querySelector('.left').textContent = left > 0 ? left : '';
    btn.classList.toggle('done', left <= 0);
  }

  diffChip.textContent = Sudoku.DIFFICULTY[state.difficulty].label;
  timeChip.textContent = formatTime(state.seconds);
  missChip.textContent = 'ミス ' + state.mistakes;
  missChip.classList.toggle('warn', state.mistakes > 0);

  memoBtn.classList.toggle('on', state.memoMode);
  undoBtn.disabled = state.history.length === 0;
}


/* -----------------------------------------------------------
 * 操作
 * --------------------------------------------------------- */

function selectCell(i) {
  if (state.done) return;
  state.selected = i;
  render();
}

// 変更する「直前」に、今の状態をまるごと控えておく（戻す用）
function pushHistory() {
  state.history.push({
    board:    state.board.slice(),
    memos:    state.memos.map(set => [...set]),
    hinted:   [...state.hinted],
    mistakes: state.mistakes,
  });
  if (state.history.length > 100) state.history.shift();   // 増えすぎないように
}

function inputNumber(v) {
  const i = state.selected;
  if (state.done || i === null) return;
  if (state.puzzle[i] !== 0) return;          // 最初からある数字は変えられない

  if (state.memoMode) {
    if (state.board[i] !== 0) return;         // 数字が入っているマスにはメモできない
    pushHistory();
    const memo = state.memos[i];
    if (memo.has(v)) memo.delete(v); else memo.add(v);

  } else {
    pushHistory();
    if (state.board[i] === v) {
      state.board[i] = 0;                     // 同じ数字をもう一度押したら消す
      state.hinted.delete(i);
    } else {
      state.board[i] = v;
      state.memos[i].clear();
      state.hinted.delete(i);
      if (v !== state.solution[i]) {
        state.mistakes++;
      } else {
        clearPeerMemos(i, v);                 // 正解なら、仲間のメモから同じ数字を消す
      }
    }
  }
  afterChange();
}

function erase() {
  const i = state.selected;
  if (state.done || i === null) return;
  if (state.puzzle[i] !== 0) return;
  if (state.board[i] === 0 && state.memos[i].size === 0) return;

  pushHistory();
  state.board[i] = 0;
  state.memos[i].clear();
  state.hinted.delete(i);
  afterChange();
}

function undo() {
  const prev = state.history.pop();
  if (!prev) return;
  state.board    = prev.board;
  state.memos    = prev.memos.map(arr => new Set(arr));
  state.hinted   = new Set(prev.hinted);
  state.mistakes = prev.mistakes;
  afterChange();
}

function toggleMemo() {
  state.memoMode = !state.memoMode;
  render();
}

function hint() {
  if (state.done) return;

  // 選んでいるマスがまだ正解でなければそこを、そうでなければ残りからランダムに1つ
  let i = state.selected;
  if (i === null || state.board[i] === state.solution[i]) {
    const remaining = [];
    for (let k = 0; k < 81; k++) {
      if (state.board[k] !== state.solution[k]) remaining.push(k);
    }
    if (remaining.length === 0) return;
    i = remaining[Math.floor(Math.random() * remaining.length)];
  }

  pushHistory();
  state.board[i] = state.solution[i];
  state.memos[i].clear();
  state.hinted.add(i);
  state.hints++;
  state.selected = i;
  clearPeerMemos(i, state.board[i]);
  afterChange();
}

// マス i に v を確定したので、同じ行・列・ブロックのメモから v を消す
function clearPeerMemos(i, v) {
  for (const p of Sudoku.PEERS[i]) state.memos[p].delete(v);
}

// 何か変更したら必ず通る場所。「完成チェック → 描画 → 保存」をまとめてやる
function afterChange() {
  checkDone();
  render();
  save();
}

function checkDone() {
  for (let i = 0; i < 81; i++) {
    if (state.board[i] !== state.solution[i]) return;   // まだ違うマスがある
  }
  state.done = true;
  stopTimer();

  let text = Sudoku.DIFFICULTY[state.difficulty].label
           + '　' + formatTime(state.seconds)
           + '　ミス ' + state.mistakes + '回';
  if (state.hints > 0) text += '　ヒント ' + state.hints + '回';
  overlaySub.textContent = text;
  overlay.hidden = false;
}


/* -----------------------------------------------------------
 * タイマー
 * --------------------------------------------------------- */

function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

function startTimer() {
  stopTimer();
  timerId = setInterval(() => {
    if (state.done) return;
    state.seconds++;
    timeChip.textContent = formatTime(state.seconds);
    if (state.seconds % 10 === 0) save();   // 10秒ごとに保存
  }, 1000);
}

function stopTimer() {
  if (timerId !== null) clearInterval(timerId);
  timerId = null;
}


/* -----------------------------------------------------------
 * 途中経過の保存（ブラウザを閉じても続きから遊べる）
 *
 * localStorage は「ブラウザの中の小さなメモ帳」。
 * 文字しか入れられないので、JSON という形式に変換して出し入れします。
 * --------------------------------------------------------- */

function save() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      difficulty: state.difficulty,
      puzzle:     state.puzzle,
      solution:   state.solution,
      board:      state.board,
      memos:      state.memos.map(set => [...set]),
      hinted:     [...state.hinted],
      mistakes:   state.mistakes,
      hints:      state.hints,
      seconds:    state.seconds,
      done:       state.done,
    }));
  } catch (e) {
    // 保存できなくてもゲームは続けられるので、黙って無視する
  }
}

function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;

    const d = JSON.parse(raw);
    if (!Array.isArray(d.puzzle) || d.puzzle.length !== 81) return false;
    if (!Array.isArray(d.solution) || d.solution.length !== 81) return false;
    if (!Array.isArray(d.board) || d.board.length !== 81) return false;
    if (!Sudoku.DIFFICULTY[d.difficulty]) return false;

    state.difficulty = d.difficulty;
    state.puzzle     = d.puzzle;
    state.solution   = d.solution;
    state.board      = d.board;
    state.memos      = (d.memos || []).map(arr => new Set(arr));
    state.hinted     = new Set(d.hinted || []);
    state.mistakes   = d.mistakes || 0;
    state.hints      = d.hints || 0;
    state.seconds    = d.seconds || 0;
    state.done       = !!d.done;
    state.selected   = null;
    state.history    = [];
    state.memoMode   = false;

    // メモの数が足りなければ埋める（古い保存データ対策）
    while (state.memos.length < 81) state.memos.push(new Set());
    return true;
  } catch (e) {
    return false;   // 壊れたデータなら諦めて新規ゲームにする
  }
}


/* -----------------------------------------------------------
 * 新しいゲーム
 * --------------------------------------------------------- */

function newGame(difficulty) {
  const { puzzle, solution } = Sudoku.createPuzzle(difficulty);

  state.difficulty = difficulty;
  state.puzzle     = puzzle;
  state.solution   = solution;
  state.board      = puzzle.slice();
  state.memos      = Array.from({ length: 81 }, () => new Set());
  state.hinted     = new Set();
  state.selected   = null;
  state.memoMode   = false;
  state.mistakes   = 0;
  state.hints      = 0;
  state.seconds    = 0;
  state.history    = [];
  state.done       = false;

  overlay.hidden = true;
  startTimer();
  render();
  save();
}


/* -----------------------------------------------------------
 * キーボード操作（パソコンで遊ぶとき用）
 * --------------------------------------------------------- */

function moveSelection(dRow, dCol) {
  const cur = state.selected === null ? 0 : state.selected;
  let row = Math.floor(cur / 9) + dRow;
  let col = (cur % 9) + dCol;
  row = Math.min(8, Math.max(0, row));
  col = Math.min(8, Math.max(0, col));
  selectCell(row * 9 + col);
}

document.addEventListener('keydown', (e) => {
  if (e.key >= '1' && e.key <= '9') {
    inputNumber(Number(e.key));
  } else if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') {
    erase();
  } else if (e.key === 'm' || e.key === 'M') {
    toggleMemo();
  } else if (e.key === 'ArrowUp') {
    moveSelection(-1, 0); e.preventDefault();
  } else if (e.key === 'ArrowDown') {
    moveSelection(1, 0); e.preventDefault();
  } else if (e.key === 'ArrowLeft') {
    moveSelection(0, -1); e.preventDefault();
  } else if (e.key === 'ArrowRight') {
    moveSelection(0, 1); e.preventDefault();
  }
});


/* -----------------------------------------------------------
 * ボタンの配線と、起動
 * --------------------------------------------------------- */

undoBtn.addEventListener('click', undo);
document.getElementById('eraseBtn').addEventListener('click', erase);
memoBtn.addEventListener('click', toggleMemo);
document.getElementById('hintBtn').addEventListener('click', hint);

document.getElementById('newBtn').addEventListener('click', () => {
  const touched = state.board.some((v, i) => v !== state.puzzle[i]);
  if (!state.done && touched) {
    if (!confirm('今のゲームをやめて、新しい問題にしますか？')) return;
  }
  newGame(diffSelect.value);
});

document.getElementById('overlayNew').addEventListener('click', () => {
  newGame(state.difficulty);
});

// 難易度の選択肢を sudoku.js の定義から自動で作る
for (const [key, info] of Object.entries(Sudoku.DIFFICULTY)) {
  const opt = document.createElement('option');
  opt.value = key;
  opt.textContent = info.label;
  diffSelect.appendChild(opt);
}

buildBoard();
buildPad();

// 前回の続きがあればそれを、無ければ新しいゲームを始める
if (load()) {
  diffSelect.value = state.difficulty;
  if (state.done) {
    checkDone();      // クリア済みならお祝い画面を出す
  } else {
    startTimer();
  }
  render();
} else {
  diffSelect.value = 'normal';
  newGame('normal');
}
