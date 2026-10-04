// 数独を「オフラインでも遊べるアプリ」にするための Service Worker。
//
// Service Worker は、ブラウザとネットワークの間に立つ小さな番人です。
// ページがファイルを取りに行くたびに、ここを経由します。
// おかげで、電波が無くてもキャッシュから返してあげられる＝圏外でも遊べる。

const CACHE = 'sudoku-v2';

// アプリを動かすのに必要な全ファイル。これだけキャッシュしておけばオフラインで動く。
const SHELL = [
  './',
  './index.html',
  './style.css',
  './sudoku.js',
  './app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon.png',
];

// インストール時：必要なファイルを先にまとめて取っておく
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting())   // 新しい版をすぐ有効にする
  );
});

// 有効化時：古い版のキャッシュを捨てる
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// ファイル取得時：ネットワーク優先、ダメならキャッシュ。
//
// 「キャッシュ優先」にすると起動は速いのですが、更新してもスマホに反映されません。
// GitHub Pages はブラウザに10分間のキャッシュを許すので、
// no-cache を付けて毎回サーバーに「新しくなってる?」と確認させます。
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // 自分のサイトのファイルだけ扱う

  e.respondWith(
    fetch(req, { cache: 'no-cache' })
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();   // 本体は返すので、複製のほうをしまう
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html')))
  );
});
