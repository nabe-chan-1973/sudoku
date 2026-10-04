/* ===========================================================
 * sudoku.js  ―  数独の「頭脳」
 *
 * ここには画面(HTML)の話は一切出てきません。
 * 「問題を作る」「答えを数える」といった計算だけを担当します。
 *
 * 盤面の表しかた:
 *   9x9 のマスを、長さ 81 のただの配列で表します。0 は空白。
 *   左上が 0 番、その右が 1 番 … 右下が 80 番。
 *
 *     マス i の 行 = Math.floor(i / 9)
 *     マス i の 列 = i % 9
 * =========================================================== */


/* -----------------------------------------------------------
 * 1. 小さな道具たち
 * --------------------------------------------------------- */

// 配列の中身をランダムに並べ替える（フィッシャー・イェーツのシャッフル）
// 毎回ちがう問題を作るために使います。
function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];   // 入れ替え
  }
  return array;
}

// マス i と「同じ行・同じ列・同じ3x3ブロック」にあるマスの番号一覧。
// 数独のルールは全部この「仲間(peers)」の中で数字が重複しないこと、に集約されます。
function peersOf(i) {
  const row = Math.floor(i / 9);
  const col = i % 9;
  const boxTop  = Math.floor(row / 3) * 3;   // 3x3ブロックの左上の行
  const boxLeft = Math.floor(col / 3) * 3;   // 3x3ブロックの左上の列

  const set = new Set();
  for (let k = 0; k < 9; k++) {
    set.add(row * 9 + k);                                     // 横一列
    set.add(k * 9 + col);                                     // 縦一列
    set.add((boxTop + Math.floor(k / 3)) * 9 + (boxLeft + k % 3)); // 3x3ブロック
  }
  set.delete(i);        // 自分自身は仲間に含めない
  return set;
}

// 81マス分の「仲間リスト」を最初に1回だけ作っておく（毎回計算すると遅いので）
const PEERS = Array.from({ length: 81 }, (_, i) => peersOf(i));


/* -----------------------------------------------------------
 * 2. ルールのチェック
 * --------------------------------------------------------- */

// マス i に数字 v を置ける？ 仲間の中に同じ数字が無ければ置けます。
function canPlace(board, i, v) {
  for (const p of PEERS[i]) {
    if (board[p] === v) return false;
  }
  return true;
}

// 今の盤面で「ルール違反になっているマス」の番号を集める。
// （同じ行に 5 が2つある、みたいな状態を画面で赤く見せるために使う）
function findConflicts(board) {
  const bad = new Set();
  for (let i = 0; i < 81; i++) {
    if (board[i] === 0) continue;
    for (const p of PEERS[i]) {
      if (board[p] === board[i]) {
        bad.add(i);
        bad.add(p);
      }
    }
  }
  return bad;
}


/* -----------------------------------------------------------
 * 3. 盤面を埋める（＝答えを作る）
 *
 * 「バックトラック法」という考え方を使います。
 *   ① 空いてる最初のマスに、置ける数字を1つ入れてみる
 *   ② その先も同じやり方で埋めていく
 *   ③ 行き詰まったら、さっき入れた数字を消して別の数字で試し直す
 * 人間が数独を解くときの「とりあえず入れてみて、ダメなら戻る」と同じです。
 * --------------------------------------------------------- */

function fillBoard(board) {
  const i = board.indexOf(0);
  if (i === -1) return true;              // 空白が無い＝完成！

  for (const v of shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9])) {
    if (canPlace(board, i, v)) {
      board[i] = v;
      if (fillBoard(board)) return true;  // この先もうまくいった
      board[i] = 0;                       // ダメだった → 元に戻す（これがバックトラック）
    }
  }
  return false;                           // どの数字もダメ → 一つ前に戻ってもらう
}

// 完成した盤面（＝答え）を1つ作る
function createSolution() {
  const board = new Array(81).fill(0);
  fillBoard(board);
  return board;
}


/* -----------------------------------------------------------
 * 4. 答えが何通りあるか数える
 *
 * 良い数独の問題は「答えがぴったり1通り」でなければいけません。
 * 2通り以上あると、どっちが正解か決められない＝欠陥問題になります。
 * 2つ見つかった時点で "1通りではない" と分かるので、そこで打ち切ります。
 * --------------------------------------------------------- */

// 空きマスの中から「入る数字の候補が一番少ないマス」を選ぶ。
// 人間も「ここは 3 か 7 しかない」というマスから手をつけますよね。同じ発想です。
// 闇雲に左上から埋めるより、探索が何十倍も速くなります。
function pickBestCell(board) {
  let best = -1;
  let bestCount = 10;

  for (let i = 0; i < 81; i++) {
    if (board[i] !== 0) continue;

    let count = 0;
    for (let v = 1; v <= 9; v++) {
      if (canPlace(board, i, v)) count++;
    }

    if (count < bestCount) {
      bestCount = count;
      best = i;
      if (count <= 1) break;   // 0個(詰み)か1個(確定)なら、これ以上探す意味はない
    }
  }
  return best;   // -1 なら空きマスが無い＝完成
}

function countSolutions(board, limit = 2) {
  const work = board.slice();   // 元の盤面を壊さないようにコピーして作業
  let count = 0;

  function search() {
    const i = pickBestCell(work);
    if (i === -1) {
      count++;
      return count >= limit;    // true を返すと、以降の探索を打ち切る
    }
    for (let v = 1; v <= 9; v++) {
      if (canPlace(work, i, v)) {
        work[i] = v;
        const stop = search();
        work[i] = 0;
        if (stop) return true;
      }
    }
    return false;
  }

  search();
  return count;
}


/* -----------------------------------------------------------
 * 5. 問題を作る
 *
 * 作りかた:
 *   ① まず完成形（答え）を作る
 *   ② そこからマスを1つずつ消していく
 *   ③ 消した結果「答えが1通り」でなくなったら、その数字は戻す
 * 消せる数が多いほど難しい問題になります。
 * --------------------------------------------------------- */

const DIFFICULTY = {
  // holes = 空白にするマスの数。symmetric = 点対称に消すか。
  // 対称に消すと見た目は美しいが、そのぶん消せる数が減る。
  // 「鬼」だけは対称をあきらめて、限界まで消す。
  easy:   { label: 'かんたん',   holes: 40, symmetric: true  },
  normal: { label: 'ふつう',     holes: 48, symmetric: true  },
  hard:   { label: 'むずかしい', holes: 54, symmetric: true  },
  expert: { label: '鬼',         holes: 60, symmetric: false },
};

function createPuzzle(difficulty = 'normal') {
  const solution = createSolution();
  const puzzle = solution.slice();
  const setting = DIFFICULTY[difficulty] || DIFFICULTY.normal;
  const target = setting.holes;

  let holes = 0;
  const order = shuffle([...Array(81).keys()]);

  for (const i of order) {
    if (holes >= target) break;

    // 点対称の位置もセットで消すと、本物の数独らしい美しい模様になります。
    // 対称にしない場合は、自分自身だけを消します。
    const pair = setting.symmetric ? 80 - i : i;
    if (puzzle[i] === 0 && puzzle[pair] === 0) continue;

    const backupA = puzzle[i];
    const backupB = puzzle[pair];

    let removed = 0;
    if (puzzle[i] !== 0) removed++;
    if (pair !== i && puzzle[pair] !== 0) removed++;

    puzzle[i] = 0;
    puzzle[pair] = 0;

    if (countSolutions(puzzle) === 1) {
      holes += removed;              // 消してOK
    } else {
      puzzle[i] = backupA;           // 答えが1通りでなくなった → 元に戻す
      puzzle[pair] = backupB;
    }
  }

  return { puzzle, solution };
}


/* -----------------------------------------------------------
 * 外に公開するもの
 * （ブラウザでは window に、Node では module.exports に付ける）
 * --------------------------------------------------------- */
const Sudoku = {
  PEERS,
  DIFFICULTY,
  canPlace,
  findConflicts,
  createSolution,
  countSolutions,
  pickBestCell,
  createPuzzle,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Sudoku;   // Node で test したいとき用
} else {
  window.Sudoku = Sudoku;    // ブラウザ用
}
