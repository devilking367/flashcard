const $ = (s) => document.querySelector(s), app = $('#app');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const api = async (p, m = 'GET', b) => {
  const r = await fetch('/api' + p, { method: m, headers: { 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(d.error || 'Có lỗi xảy ra'), { status: r.status });
  return d;
};
let user = null;

const shell = (html) => {
  app.innerHTML = `<header><a class="logo" href="#/">🗂️ Flashcard</a><span>${user ? `${esc(user)} <button class="ghost" id="out">Đăng xuất</button>` : ''}</span></header><main>${html}</main>`;
  if ($('#out')) $('#out').onclick = async () => { await api('/logout', 'POST'); user = null; location.hash = '#/login'; route(); };
};

function authView(reg) {
  app.innerHTML = `<header><a class="logo" href="#/">🗂️ Flashcard</a></header>
  <form class="auth" id="f"><h1>${reg ? 'Tạo tài khoản' : 'Đăng nhập'}</h1>
  <input name="username" placeholder="Tên đăng nhập" autocomplete="username" required>
  <input name="password" type="password" placeholder="Mật khẩu" autocomplete="${reg ? 'new-password' : 'current-password'}" required>
  ${reg ? '<input name="password2" type="password" placeholder="Nhập lại mật khẩu" autocomplete="new-password" required>' : ''}
  <p class="err" id="e"></p><button>${reg ? 'Đăng ký' : 'Đăng nhập'}</button>
  <p class="mu c">${reg ? 'Đã có tài khoản? <a href="#/login">Đăng nhập</a>' : 'Chưa có tài khoản? <a href="#/register">Đăng ký</a>'}</p></form>`;
  $('#f').onsubmit = async (e) => {
    e.preventDefault();
    try {
      const r = await api(reg ? '/register' : '/login', 'POST', Object.fromEntries(new FormData(e.target)));
      user = r.username; location.hash = '#/'; route();
    } catch (err) { $('#e').textContent = err.message; }
  };
}

async function decksView() {
  const decks = await api('/decks');
  shell(`<h1>Bộ thẻ của bạn</h1>
  <form id="f" class="row"><input name="title" placeholder="Tên bộ thẻ mới" required><input name="description" placeholder="Mô tả (không bắt buộc)"><button>Tạo bộ thẻ</button></form>
  ${decks.map((d) => `<a class="deck" href="#/deck/${d.id}"><b>${esc(d.title)}</b><br><span class="mu">${d.count} thẻ${d.description ? ' · ' + esc(d.description) : ''}</span></a>`).join('') || '<p class="mu">Chưa có bộ thẻ nào. Tạo bộ đầu tiên ở trên.</p>'}`);
  $('#f').onsubmit = async (e) => {
    e.preventDefault();
    const r = await api('/decks', 'POST', Object.fromEntries(new FormData(e.target)));
    location.hash = '#/deck/' + r.id;
  };
}

async function deckView(id) {
  const { deck, cards } = await api('/decks/' + id);
  shell(`<p><a href="#/">← Tất cả bộ thẻ</a></p><h1>${esc(deck.title)}</h1><p class="mu">${esc(deck.description)}</p>
  <div class="row"><a class="btn" href="#/study/${id}">Học ${cards.length} thẻ</a><button class="ghost" id="ren">Đổi tên</button><button class="danger" id="del">Xoá bộ thẻ</button></div>
  <h3>Thêm thẻ</h3>
  <form id="f" class="row"><input name="front" placeholder="Thuật ngữ" required><input name="back" placeholder="Định nghĩa" required><button>Thêm thẻ</button></form>
  <details><summary>Nhập nhiều thẻ cùng lúc</summary><textarea id="bulk" rows="5" placeholder="Mỗi dòng một thẻ: thuật ngữ | định nghĩa"></textarea><button id="imp">Nhập thẻ</button></details>
  <h3>Danh sách thẻ</h3>
  ${cards.map((c) => `<div class="row item" data-id="${c.id}"><input data-k="front" value="${esc(c.front)}"><input data-k="back" value="${esc(c.back)}"><button class="ghost x" title="Xoá thẻ">✕</button></div>`).join('') || '<p class="mu">Chưa có thẻ nào.</p>'}`);
  const again = () => deckView(id);
  $('#f').onsubmit = async (e) => { e.preventDefault(); await api(`/decks/${id}/cards`, 'POST', Object.fromEntries(new FormData(e.target))); again(); };
  $('#imp').onclick = async () => {
    const list = $('#bulk').value.split('\n').map((l) => l.split('|')).filter((p) => p.length >= 2).map((p) => ({ front: p[0], back: p.slice(1).join('|') }));
    if (list.length) { await api(`/decks/${id}/cards`, 'POST', { cards: list }); again(); }
  };
  $('#ren').onclick = async () => { const t = prompt('Tên mới:', deck.title); if (t) { await api('/decks/' + id, 'PUT', { title: t }); again(); } };
  $('#del').onclick = async () => { if (confirm('Xoá bộ thẻ này và toàn bộ thẻ bên trong?')) { await api('/decks/' + id, 'DELETE'); location.hash = '#/'; } };
  document.querySelectorAll('.item').forEach((row) => {
    const cid = row.dataset.id;
    row.querySelectorAll('input').forEach((i) => (i.onchange = () => api('/cards/' + cid, 'PUT', { front: row.querySelector('[data-k=front]').value, back: row.querySelector('[data-k=back]').value })));
    row.querySelector('.x').onclick = async () => { await api('/cards/' + cid, 'DELETE'); again(); };
  });
}

async function studyView(id) {
  const { deck, cards } = await api('/decks/' + id);
  if (!cards.length) { location.hash = '#/deck/' + id; return; }
  let list = [...cards], i = 0, flipped = false;
  const flip = () => { flipped = !flipped; $('#fc').classList.toggle('flip'); };
  const go = (d) => { i = (i + d + list.length) % list.length; flipped = false; draw(); };
  const draw = () => {
    const c = list[i];
    shell(`<p><a href="#/deck/${id}">← ${esc(deck.title)}</a></p><p class="mu c">${i + 1} / ${list.length}</p>
    <div class="fc" id="fc" tabindex="0"><div class="in"><div class="face">${esc(c.front)}</div><div class="face back">${esc(c.back)}</div></div></div>
    <div class="row c"><button id="pv" class="ghost">← Trước</button><button id="sh" class="ghost">Trộn thẻ</button><button id="nx">Tiếp →</button></div>
    <p class="mu c">Nhấn vào thẻ hoặc phím Space để lật. Dùng phím ← → để chuyển thẻ.</p>`);
    $('#fc').onclick = flip; $('#pv').onclick = () => go(-1); $('#nx').onclick = () => go(1);
    $('#sh').onclick = () => { list.sort(() => Math.random() - 0.5); i = 0; flipped = false; draw(); };
  };
  document.onkeydown = (e) => {
    if (e.code === 'Space') { e.preventDefault(); flip(); }
    else if (e.key === 'ArrowRight') go(1);
    else if (e.key === 'ArrowLeft') go(-1);
  };
  draw();
}

async function route() {
  document.onkeydown = null;
  const [, page, id] = location.hash.split('/');
  try {
    if (!user) { const m = await api('/me').catch(() => null); user = m && m.username; }
    if (!user) return authView(page === 'register');
    if (page === 'deck') return await deckView(id);
    if (page === 'study') return await studyView(id);
    return await decksView();
  } catch (e) {
    if (e.status === 401) { user = null; return authView(false); }
    shell(`<p class="err">${esc(e.message)}</p><a href="#/">Về trang chủ</a>`);
  }
}
addEventListener('hashchange', route);
route();
