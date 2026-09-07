// Setback — mobile table UI and game controller.
import {
  Card, Rank, Bid, ALL_BIDS, BID_NAMES, Seat, SEAT_NAMES, SUIT_CHARS, SUIT_NAMES,
  Team, TEAM_NAMES, TEAM_LONG_NAMES, teamOfSeat, seatIncr, partnerOf,
  Auction, Trick, Playout, ClosedDeal, OpenDeal, Game, Score,
} from './engine.js';
import { chooseAction } from './ai.js';

const USER = Seat.South;
const STORAGE_KEY = 'lis-setback-v1';
const SETTINGS_KEY = 'lis-setback-settings-v1';
const rng = Math.random;

const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------ persistence

function load(key) {
  try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : null; } catch { return null; }
}
function store(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode etc. */ }
}

let settings = Object.assign({ speed: 'normal', hints: false }, load(SETTINGS_KEY) || {});
const saveSettings = () => store(SETTINGS_KEY, settings);

function freshState() {
  return { version: 1, gamesWon: [0, 0], finished: null, game: Game.create(rng, Seat.South) };
}
function validState(s) {
  try {
    return s && s.version === 1 && Array.isArray(s.gamesWon) && s.game && s.game.Deal
      && s.game.Deal.ClosedDeal && Array.isArray(s.game.Deal.Hands) && s.game.Deal.Hands.length === 4
      && Array.isArray(s.game.Score);
  } catch { return false; }
}
let pers = load(STORAGE_KEY);
if (!validState(pers)) pers = freshState();
const save = () => store(STORAGE_KEY, pers);

// timing per speed setting
const timing = () => settings.speed === 'fast'
  ? { think: 120, bid: 260, play: 240, trickShow: 650, dealIn: 250 }
  : { think: 420, bid: 600, play: 520, trickShow: 1250, dealIn: 450 };

// number of sampled worlds for the AI; adapts to device speed
let numWorlds = 200;

// ephemeral UI state
const ui = {
  awaiting: null,      // { type: 'bid'|'play', legal: [...], resolve }
  hint: null,          // action suggested for the user
  showTrick: null,     // a completed trick kept on the table for a moment
  trickWinner: null,
  thinking: null,      // seat currently "thinking"
  dealId: null,        // used to animate a fresh deal
  animateDeal: false,
  lastBidSeat: null,
};

// ------------------------------------------------------------- rendering

const isRed = (card) => Card.suit(card) === 1 || Card.suit(card) === 2;
const rankChar = (card) => {
  const r = Card.rank(card);
  return r === 10 ? '10' : 'JQKA'[r - 11] || String(r);
};
const suitHtml = (suit) => `<span class="${suit === 1 || suit === 2 ? 'suit-red' : ''}">${SUIT_CHARS[suit]}</span>`;

function cardHtml(card, classes = '', attrs = '') {
  const suit = Card.suit(card), rank = Card.rank(card);
  const face = rank >= Rank.Jack;
  const cls = `card ${isRed(card) ? 'red' : ''} ${face ? 'face' : ''} ${classes}`;
  const rc = rankChar(card), sc = SUIT_CHARS[suit];
  const pip = face ? rc : sc;
  return `<button type="button" class="${cls}" data-card="${card}" aria-label="${rc} of ${SUIT_NAMES[suit]}" ${attrs}>` +
    `<span class="corner tl">${rc}<small>${sc}</small></span>` +
    `<span class="pip">${pip}</span>` +
    `<span class="corner br">${rc}<small>${sc}</small></span>` +
    `</button>`;
}

const seatLabel = (seat) => seat === USER ? 'You' : seat === partnerOf(USER) ? `${SEAT_NAMES[seat]} (partner)` : SEAT_NAMES[seat];
const seatName = (seat) => seat === USER ? 'You' : SEAT_NAMES[seat];
const teamOfUser = teamOfSeat(USER);

// sort hand for display: trump first, then alternating colours, high to low
function sortedHand(hand, trump) {
  const order = [3, 2, 0, 1]; // ♠ ♥ ♣ ♦
  if (trump !== null) {
    order.splice(order.indexOf(trump), 1);
    order.unshift(trump);
  }
  return hand.slice().sort((a, b) => {
    const sa = order.indexOf(Card.suit(a)), sb = order.indexOf(Card.suit(b));
    if (sa !== sb) return sa - sb;
    return Card.rank(b) - Card.rank(a);
  });
}

function render() {
  const game = pers.game;
  const deal = game.Deal;
  const cd = deal.ClosedDeal;
  const auction = cd.Auction;
  const playout = cd.Playout;
  const trump = playout ? playout.Trump : null;
  const complete = OpenDeal.isComplete(deal);
  const current = complete ? null : OpenDeal.currentPlayer(deal);

  // scores
  $('ewScore').textContent = game.Score[0];
  $('nsScore').textContent = game.Score[1];
  $('ewGames').textContent = pers.gamesWon[0];
  $('nsGames').textContent = pers.gamesWon[1];

  // contract line
  let contract;
  if (playout) {
    const b = auction.HighBidder;
    contract = `<strong>${seatName(b)} bid ${auction.HighBid}</strong><br>` +
      (trump !== null ? `Trump ${suitHtml(trump)} ${SUIT_NAMES[trump]}` : 'Trump: first card led');
  } else if (Auction.isComplete(auction)) {
    contract = '<strong>Everyone passed</strong>';
  } else {
    contract = `Bidding<br><span style="opacity:.75">${seatName(auction.Dealer)} dealt</span>`;
  }
  $('contract').innerHTML = contract;

  // status chips: deal points so far
  const status = $('status');
  if (playout) {
    const h = Playout.pointHolders(playout);
    const g = playout.GameScore;
    const chip = (label, team) => {
      const cls = team === null ? '' : team === 0 ? 'ew' : 'ns';
      return `<span class="chip ${cls}">${label} <b>${team === null ? '–' : TEAM_NAMES[team]}</b></span>`;
    };
    status.innerHTML = chip('High', h.High) + chip('Low', h.Low) + chip('Jack', h.Jack) +
      `<span class="chip">Game <b class="ew-b">${g[0]}</b> · <b>${g[1]}</b></span>`;
  } else {
    status.innerHTML = '<span class="chip">High · Low · Jack · Game</span>';
  }

  // seats
  const bidsBySeat = new Map(Auction.playerBids(auction));
  for (let seat = 0; seat < 4; seat++) {
    const el = $('seat' + seat);
    const isActive = current === seat && !complete;
    const isWinner = ui.trickWinner === seat;
    let html = `<div class="name">${auction.Dealer === seat ? '<span class="dealer-badge" title="Dealer">D</span>' : ''}${seatLabel(seat)}` +
      (ui.thinking === seat ? ' <span class="dots">…</span>' : '') + `</div>`;
    if (seat !== USER) {
      const n = deal.Hands[seat].length;
      html += `<div class="backs" aria-label="${n} cards">${'<span class="mini-back"></span>'.repeat(n)}</div>`;
    }
    if (bidsBySeat.has(seat) && !(playout && Playout.numCardsPlayed(playout) > 0 && Playout.numCardsPlayed(playout) >= 4)) {
      const bid = bidsBySeat.get(seat);
      const won = playout && auction.HighBidder === seat;
      html += `<div class="bubble ${bid === Bid.Pass ? 'pass' : ''} ${won ? 'won' : ''}">${bid === Bid.Pass ? 'Pass' : bid}</div>`;
    } else if (playout && auction.HighBidder === seat) {
      html += `<div class="bubble won">bid ${auction.HighBid}</div>`;
    }
    el.innerHTML = html;
    el.classList.toggle('active', isActive);
    el.classList.toggle('winner', isWinner);
  }

  // trick
  const trick = ui.showTrick || (playout ? playout.CurrentTrick : null);
  for (let seat = 0; seat < 4; seat++) $('slot' + seat).innerHTML = '';
  if (trick) {
    const plays = Trick.plays(trick);
    const winnerSeat = ui.trickWinner !== null && Trick.isComplete(trick) ? trick.HighPlay.seat : null;
    plays.forEach(([seat, card], i) => {
      const cls = `small ${Card.suit(card) === trump ? 'trump' : ''} ${winnerSeat === seat ? 'win' : ''} ${i === plays.length - 1 ? 'pop' : ''}`;
      $('slot' + seat).innerHTML = cardHtml(card, cls, `style="z-index:${i + 1}" tabindex="-1"`);
    });
  }

  // hand
  const handEl = $('hand');
  const hand = sortedHand(deal.Hands[USER], trump);
  const awaitingPlay = ui.awaiting && ui.awaiting.type === 'play';
  const legalSet = new Set(awaitingPlay ? ui.awaiting.legal.map((a) => a.card) : []);
  const hintCard = ui.hint && ui.hint.card !== undefined ? ui.hint.card : null;
  const dealKey = deal.ClosedDeal.Auction.Dealer + ':' + deal.Hands.map((h) => h.join(',')).join('|');
  let handHtml = '';
  hand.forEach((card, i) => {
    let cls = Card.suit(card) === trump ? 'trump' : '';
    if (awaitingPlay) cls += legalSet.has(card) ? ' legal' : ' dim';
    if (hintCard === card) cls += ' hint';
    if (ui.animateDeal) cls += ' deal';
    handHtml += cardHtml(card, cls, ui.animateDeal ? `style="animation-delay:${i * 60}ms"` : '');
  });
  if (handEl.dataset.key !== dealKey + '|' + (awaitingPlay ? 'p' : '-') + '|' + hintCard + '|' + trump) {
    handEl.innerHTML = handHtml;
    handEl.dataset.key = dealKey + '|' + (awaitingPlay ? 'p' : '-') + '|' + hintCard + '|' + trump;
  }
  ui.animateDeal = false;

  // prompt
  const prompt = $('prompt');
  prompt.classList.remove('you');
  if (ui.awaiting && ui.awaiting.type === 'bid') { prompt.textContent = 'Your bid'; prompt.classList.add('you'); }
  else if (awaitingPlay) {
    const lead = trick && trick.Cards.length === 0;
    prompt.textContent = lead ? (trump === null ? 'Your lead — the suit you lead becomes trump' : 'Your lead') : 'Your play — tap a card';
    prompt.classList.add('you');
  }
  else if (complete) prompt.textContent = 'Deal over';
  else if (current !== null) prompt.textContent = `${SEAT_NAMES[current]} is ${playout ? 'playing' : 'bidding'}…`;
  else prompt.textContent = '';

  // bid panel
  const panel = $('bidPanel');
  if (ui.awaiting && ui.awaiting.type === 'bid') {
    const legal = new Set(ui.awaiting.legal.map((a) => a.bid));
    const hintBid = ui.hint && ui.hint.bid !== undefined ? ui.hint.bid : null;
    panel.innerHTML = ALL_BIDS.map((b) =>
      `<button type="button" class="bid-btn ${hintBid === b ? 'hint' : ''}" data-bid="${b}" ${legal.has(b) ? '' : 'disabled'}>` +
      (b === Bid.Pass ? 'Pass' : `${b}<small>${BID_NAMES[b]}</small>`) + `</button>`).join('');
    panel.hidden = false;
  } else {
    panel.hidden = true;
  }
}

// -------------------------------------------------------------- widgets

let toastTimer = null;
function toast(msg, ms = 1400) {
  const el = $('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, ms);
  return sleep(ms);
}

/// Shows a bottom sheet; resolves with the data-action of the button tapped.
function showSheet(html) {
  return new Promise((resolve) => {
    const overlay = $('overlay'), sheet = $('sheet');
    sheet.innerHTML = html;
    overlay.hidden = false;
    const onClick = (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      sheet.removeEventListener('click', onClick);
      overlay.hidden = true;
      resolve(btn.dataset.action);
    };
    sheet.addEventListener('click', onClick);
  });
}

function dealSummaryHtml(cd) {
  const auction = cd.Auction, p = cd.Playout;
  const ds = ClosedDeal.getDealScore(cd);
  const raw = Playout.getRawDealScore(p);
  const h = Playout.pointHolders(p);
  const bidder = auction.HighBidder, bid = auction.HighBid, bidderTeam = teamOfSeat(bidder);
  const set = raw[bidderTeam] < bid;
  const row = (label, team) => `<tr><td>${label}</td><td>${team === 0 ? '✓' : ''}</td><td>${team === 1 ? '✓' : ''}</td></tr>`;
  const cell = (v) => `<td class="tot ${v < 0 ? 'neg' : ''}">${v > 0 ? '+' : ''}${v}</td>`;
  let headline;
  if (set) headline = `${TEAM_LONG_NAMES[bidderTeam]} bid ${bid} and took ${raw[bidderTeam]} — <b>set back ${bid}</b>.`;
  else headline = `${TEAM_LONG_NAMES[bidderTeam]} bid ${bid} and made it.`;
  const g = p.GameScore;
  return `<h2>${seatName(bidder)} bid ${bid} in ${suitHtml(p.Trump)} ${SUIT_NAMES[p.Trump]}</h2>` +
    `<p>${headline}</p>` +
    `<table><thead><tr><th></th><th>E+W</th><th>N+S</th></tr></thead><tbody>` +
    row('High', h.High) + row('Low', h.Low) + row(`Jack${h.Jack === null ? ' (not dealt / not taken)' : ''}`, h.Jack) +
    `<tr><td>Game <span class="sub">(${g[0]} – ${g[1]} game points)</span></td><td>${h.Game === 0 ? '✓' : ''}</td><td>${h.Game === 1 ? '✓' : ''}</td></tr>` +
    `<tr><td><b>This deal</b></td>${cell(ds[0])}${cell(ds[1])}</tr>` +
    `<tr><td><b>Game score</b></td><td class="tot">${pers.game.Score[0]}</td><td class="tot">${pers.game.Score[1]}</td></tr>` +
    `</tbody></table>` +
    `<div class="actions"><button type="button" class="btn" data-action="next">Next deal</button></div>`;
}

function gameOverHtml(winner) {
  const you = winner === teamOfUser;
  return `<h2 class="${you ? 'win' : ''}">${you ? 'You win!' : `${TEAM_LONG_NAMES[winner]} win the game`}</h2>` +
    `<p>${TEAM_LONG_NAMES[winner]} reach ${Math.max(...pers.game.Score)} points.</p>` +
    `<table><thead><tr><th></th><th>E+W</th><th>N+S</th></tr></thead><tbody>` +
    `<tr><td>Final score</td><td class="tot">${pers.game.Score[0]}</td><td class="tot">${pers.game.Score[1]}</td></tr>` +
    `<tr><td>Games won</td><td class="tot">${pers.gamesWon[0]}</td><td class="tot">${pers.gamesWon[1]}</td></tr>` +
    `</tbody></table>` +
    `<div class="actions"><button type="button" class="btn" data-action="next">New game</button></div>`;
}

async function showMenu() {
  const html = () =>
    `<h2>Setback</h2>` +
    `<div class="actions">` +
    `<button type="button" class="btn row" data-action="hints"><span>Show hints (★ marks the computer's choice)</span><span>${settings.hints ? 'On' : 'Off'}</span></button>` +
    `<button type="button" class="btn row" data-action="speed"><span>Speed</span><span>${settings.speed === 'fast' ? 'Fast' : 'Normal'}</span></button>` +
    `<a class="btn secondary row" href="rules.html" style="text-decoration:none;display:flex"><span>Rules of Setback</span><span>›</span></a>` +
    `<button type="button" class="btn danger" data-action="newgame">Abandon this game and start over</button>` +
    `<button type="button" class="btn secondary" data-action="close">Close</button>` +
    `</div>` +
    `<p class="credit">You play South; North is your partner. Rules and scoring follow ` +
    `<a href="https://www.bernsrite.com/Setback/" target="_blank" rel="noopener">Brian Berns' Setback</a>, whose F# game engine ` +
    `(<a href="https://github.com/brianberns/Setback" target="_blank" rel="noopener">source</a>) this page ports to JavaScript. ` +
    `The computer players here use a Monte Carlo search that runs entirely on your phone. Progress is saved on this device.</p>`;
  while (true) {
    const action = await showSheet(html());
    if (action === 'hints') { settings.hints = !settings.hints; saveSettings(); if (ui.awaiting && settings.hints) requestHint(); if (!settings.hints) { ui.hint = null; render(); } continue; }
    if (action === 'speed') { settings.speed = settings.speed === 'fast' ? 'normal' : 'fast'; saveSettings(); continue; }
    if (action === 'newgame') {
      if (confirm('Abandon the current game and start a new one? Games-won totals are kept.')) {
        pers.game = Game.create(rng, seatIncr(1, pers.game.Deal.ClosedDeal.Auction.Dealer));
        pers.finished = null;
        save();
        location.reload(); // simplest way to unwind the game loop
      }
      return;
    }
    return;
  }
}

// ---------------------------------------------------------- game flow

let hintToken = 0;
async function requestHint() {
  if (!settings.hints || !ui.awaiting) return;
  const token = ++hintToken;
  await sleep(30);
  if (!ui.awaiting || token !== hintToken) return;
  const info = Game.currentInfoSet(pers.game);
  const { action } = chooseAction(info, rng, numWorlds);
  if (!ui.awaiting || token !== hintToken) return;
  ui.hint = action;
  render();
}

function userAction(info) {
  return new Promise((resolve) => {
    ui.awaiting = {
      type: info.Deal.Playout ? 'play' : 'bid',
      legal: info.LegalActions,
      resolve: (a) => { ui.awaiting = null; ui.hint = null; hintToken++; resolve(a); },
    };
    render();
    requestHint();
  });
}

async function aiAction(info) {
  ui.thinking = info.Player;
  render();
  await sleep(timing().think);
  const t0 = performance.now();
  const { action } = chooseAction(info, rng, numWorlds);
  const dt = performance.now() - t0;
  if (dt > 400 && numWorlds > 32) numWorlds = Math.max(32, Math.floor(numWorlds * 0.7));
  else if (dt < 120 && numWorlds < 400) numWorlds = Math.min(400, Math.floor(numWorlds * 1.25));
  ui.thinking = null;
  return action;
}

async function applyAction(action, seat) {
  const before = pers.game;
  pers.game = Game.addAction(action, pers.game);
  save();
  const t = timing();
  if (action.bid !== undefined) {
    render();
    await sleep(t.bid);
    return;
  }
  const pBefore = before.Deal.ClosedDeal.Playout;
  const trump = pBefore.Trump === null ? Card.suit(action.card) : pBefore.Trump;
  const trickAfter = Trick.addPlay(trump, action.card, pBefore.CurrentTrick);
  if (Trick.isComplete(trickAfter)) {
    ui.showTrick = trickAfter;
    render();
    await sleep(t.play);
    ui.trickWinner = trickAfter.HighPlay.seat;
    render();
    await sleep(t.trickShow);
    ui.showTrick = null;
    ui.trickWinner = null;
    render();
  } else {
    render();
    await sleep(t.play);
  }
}

async function runDeal() {
  const dealKey = pers.game.Deal.Hands.map((h) => h.join(',')).join('|');
  if (ui.dealId !== dealKey) {
    ui.dealId = dealKey;
    ui.animateDeal = Playout.numCardsPlayed(pers.game.Deal.ClosedDeal.Playout || { CompletedTricks: [], CurrentTrick: null }) === 0;
  }
  render();
  if (ui.animateDeal) await sleep(timing().dealIn);
  while (!OpenDeal.isComplete(pers.game.Deal)) {
    const info = Game.currentInfoSet(pers.game);
    const action = info.Player === USER ? await userAction(info) : await aiAction(info);
    await applyAction(action, info.Player);
  }
  const cd = pers.game.Deal.ClosedDeal;
  render();
  if (cd.Auction.HighBid === Bid.Pass) {
    await toast('Everyone passed — dealing again', 1500);
  } else {
    await showSheet(dealSummaryHtml(cd));
  }
}

async function runGame() {
  while (true) {
    if (pers.finished === null) await runDeal();
    const winner = pers.finished !== null ? pers.finished : Game.tryGetWinningTeam(pers.game);
    if (winner !== null) {
      if (pers.finished === null) {
        pers.finished = winner;
        pers.gamesWon[winner] += 1;
        save();
      }
      render();
      await showSheet(gameOverHtml(winner));
      pers.game = Game.create(rng, seatIncr(1, pers.game.Deal.ClosedDeal.Auction.Dealer));
      pers.finished = null;
      save();
      return;
    }
    pers.game = Game.startNextDeal(rng, pers.game);
    save();
  }
}

async function main() {
  $('hand').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-card]');
    if (!btn || !ui.awaiting || ui.awaiting.type !== 'play') return;
    const card = Number(btn.dataset.card);
    const legal = ui.awaiting.legal.find((a) => a.card === card);
    if (legal) ui.awaiting.resolve(legal);
  });
  $('bidPanel').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-bid]');
    if (!btn || btn.disabled || !ui.awaiting || ui.awaiting.type !== 'bid') return;
    const bid = Number(btn.dataset.bid);
    const legal = ui.awaiting.legal.find((a) => a.bid === bid);
    if (legal) ui.awaiting.resolve(legal);
  });
  $('menuBtn').addEventListener('click', () => { if ($('overlay').hidden) showMenu(); });

  try {
    while (true) await runGame();
  } catch (err) {
    console.error(err);
    const action = await showSheet(`<h2>Something went wrong</h2><p class="sub">${String(err && err.message || err)}</p>` +
      `<div class="actions"><button type="button" class="btn" data-action="reset">Reset the game</button></div>`);
    if (action === 'reset') { pers = freshState(); save(); location.reload(); }
  }
}

main();
