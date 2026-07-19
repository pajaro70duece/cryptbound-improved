'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const THEMES = [
  ['Stone Crypt', '#776a58', '#2b2520'], ['Spider Caves', '#675b47', '#241f19'],
  ['Haunted Prison', '#617078', '#1a242b'], ['Goblin Mines', '#716343', '#292616'],
  ['Frozen Catacombs', '#76a8bb', '#1b3039'], ['Poison Temple', '#607b46', '#202b19'],
  ['Demon Fortress', '#8b493b', '#321916'], ['Sunken Ruins', '#397b79', '#132b2d'],
  ['Dragon Keep', '#825630', '#2c1b10'], ['Shadow Realm', '#5a477d', '#171122']
];
const BOSS_NAMES = [
  'The Grave Butcher', 'Broodmother Xarra', 'The Hollow Warden', 'King Ironfang', 'The Ice Revenant',
  'Venom Oracle', 'Ashlord Kael', 'The Drowned Idol', 'Embermaw', 'The Shadow King'
];
const CLASSES = {
  warrior: { name: 'Warrior', hp: 130, mana: 55, damage: 20, spell: 'War Cry', portrait: '/warrior-portrait.svg' },
  mage: { name: 'Mage', hp: 90, mana: 110, damage: 15, spell: 'Arc Bolt', portrait: '/mage-portrait.svg' }
};
const OBJECTIVES = ['Find the exit', 'Defeat all enemies', 'Recover the relic', 'Find 3 rune keys', 'Survive the ambush'];
const ENEMY_ART = { spider: '/enemy-spider.svg', skeleton: '/enemy-skeleton.svg', wraith: '/enemy-wraith.svg', boss: '/enemy-boss.svg' };

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = Math.imul(1664525, s) + 1013904223 >>> 0) / 4294967296);
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function placeOpenTile(map, r, minX, maxX, minY, maxY) {
  let x = 2, y = 2, tries = 0;
  do {
    x = minX + Math.floor(r() * (maxX - minX));
    y = minY + Math.floor(r() * (maxY - minY));
    tries++;
  } while (map[y]?.[x] !== 0 && tries < 200);
  return { x: x + 0.5, y: y + 0.5 };
}

function makeLevel(level) {
  const r = rng(level * 982451653);
  const w = 18;
  const h = 18;
  const map = Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => x === 0 || y === 0 || x === w - 1 || y === h - 1 ? 1 : 0));
  for (let i = 0; i < 56; i++) {
    const x = 2 + Math.floor(r() * (w - 4));
    const y = 2 + Math.floor(r() * (h - 4));
    if (!(x < 5 && y < 5) && !(x > w - 6 && y > h - 6)) map[y][x] = r() > .18 ? 1 : 2;
  }
  for (let i = 1; i < w - 1; i++) map[2][i] = 0;
  for (let i = 2; i < h - 2; i++) map[i][w - 3] = 0;
  for (let y = 1; y < 5; y++) for (let x = 1; x < 5; x++) map[y][x] = 0;
  for (let y = h - 5; y < h - 1; y++) for (let x = w - 5; x < w - 1; x++) map[y][x] = 0;

  const enemyCount = Math.min(3 + Math.floor(level / 3), 14);
  const enemies = [];
  for (let i = 0; i < enemyCount; i++) {
    const pos = placeOpenTile(map, r, 4, w - 3, 4, h - 3);
    enemies.push({
      id: i,
      x: pos.x,
      y: pos.y,
      hp: 28 + level * 4,
      maxHp: 28 + level * 4,
      kind: level % 10 === 0 && i === 0 ? 'boss' : ['spider', 'skeleton', 'wraith'][Math.floor(r() * 3)],
      alive: true,
      bob: r() * Math.PI * 2,
      roam: r() * Math.PI * 2,
      attackCooldown: 0
    });
  }

  const chestCount = 1 + Math.floor((level % 4) / 2);
  const chests = [];
  for (let i = 0; i < chestCount; i++) {
    const pos = placeOpenTile(map, r, 3, w - 3, 3, h - 3);
    chests.push({ id: `c${level}-${i}`, x: pos.x, y: pos.y, open: false, gold: 12 + Math.floor(r() * 40) + level * 2, rare: r() > .72 });
  }

  const potionCount = r() > .45 ? 1 : 2;
  const potions = [];
  for (let i = 0; i < potionCount; i++) {
    const pos = placeOpenTile(map, r, 3, w - 3, 3, h - 3);
    potions.push({ id: `p${level}-${i}`, x: pos.x, y: pos.y, taken: false });
  }

  return {
    map,
    enemies,
    chests,
    potions,
    exit: { x: w - 3.5, y: h - 3.5 },
    relic: { x: w - 4.5, y: 3.5, taken: false },
    objective: level % 10 === 0 ? 'Defeat the floor guardian' : OBJECTIVES[(level - 1) % OBJECTIVES.length],
    theme: THEMES[Math.floor((level - 1) / 10)],
    boss: level % 10 === 0,
    bossName: BOSS_NAMES[Math.floor((level - 1) / 10)]
  };
}

function vibrate(pattern) {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    try { navigator.vibrate(pattern); } catch {}
  }
}

export default function Home() {
  const canvasRef = useRef(null);
  const minimapRef = useRef(null);
  const stateRef = useRef(null);
  const actionsRef = useRef({ forward: false, back: false, strafeLeft: false, strafeRight: false, turnLeft: false, turnRight: false });
  const audioRef = useRef({ ctx: null, musicTimer: null, enabled: true });
  const popupTimersRef = useRef([]);
  const imagesRef = useRef({});
  const texturesRef = useRef({});
  const [screen, setScreen] = useState('menu');
  const [heroClass, setHeroClass] = useState('warrior');
  const [level, setLevel] = useState(1);
  const [hud, setHud] = useState({ hp: 100, maxHp: 100, mana: 50, maxMana: 50, xp: 0, gold: 0, enemies: 0, objective: '', toast: '', combo: 0 });
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [levelSelect, setLevelSelect] = useState(false);
  const [unlocked, setUnlocked] = useState(1);
  const [popups, setPopups] = useState([]);
  const [bossIntro, setBossIntro] = useState(null);
  const [audioEnabled, setAudioEnabled] = useState(true);

  useEffect(() => {
    const save = JSON.parse(localStorage.getItem('cryptbound-save') || '{}');
    setUnlocked(save.unlocked || 1);
    if (save.heroClass) setHeroClass(save.heroClass);
    if (typeof save.audioEnabled === 'boolean') {
      setAudioEnabled(save.audioEnabled);
      audioRef.current.enabled = save.audioEnabled;
    }
    return () => popupTimersRef.current.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const makeStoneTexture = (baseHex, accentHex, mortarHex, roughness = 18) => {
      const c = document.createElement('canvas');
      c.width = 128; c.height = 128;
      const cx = c.getContext('2d');
      cx.fillStyle = baseHex;
      cx.fillRect(0, 0, 128, 128);

      for (let row = 0; row < 8; row++) {
        const by = row * 16;
        const offset = row % 2 ? 10 : 0;
        for (let bx = -offset; bx < 128 + 18; bx += 34) {
          const variance = ((row * 17 + bx * 7) % roughness) - roughness / 2;
          cx.fillStyle = accentHex;
          cx.fillRect(bx + 1, by + 1, 31, 13);
          cx.fillStyle = `rgba(255,255,255,${0.05 + ((bx + row) % 5) * 0.01})`;
          cx.fillRect(bx + 2, by + 2, 27, 2);
          cx.fillStyle = `rgba(0,0,0,${0.08 + Math.abs(variance) * 0.006})`;
          cx.fillRect(bx + 2, by + 11, 27, 2);
        }
      }

      cx.strokeStyle = mortarHex;
      cx.lineWidth = 2;
      for (let y = 15; y < 128; y += 16) {
        cx.beginPath(); cx.moveTo(0, y); cx.lineTo(128, y); cx.stroke();
      }
      for (let row = 0; row < 8; row++) {
        const offset = row % 2 ? 10 : 0;
        for (let x = 0; x < 128; x += 34) {
          cx.beginPath(); cx.moveTo(x + offset, row * 16); cx.lineTo(x + offset, row * 16 + 16); cx.stroke();
        }
      }

      for (let i = 0; i < 120; i++) {
        const x = (i * 37) % 128;
        const y = (i * 61) % 128;
        cx.fillStyle = `rgba(255,255,255,${0.03 + (i % 4) * 0.01})`;
        cx.fillRect(x, y, 2, 2);
        cx.fillStyle = 'rgba(0,0,0,0.08)';
        cx.fillRect((x + 8) % 128, (y + 3) % 128, 2, 2);
      }

      cx.strokeStyle = 'rgba(25,18,16,0.55)';
      cx.lineWidth = 1.5;
      for (let i = 0; i < 14; i++) {
        const x = (i * 23) % 128;
        const y = (i * 41) % 128;
        cx.beginPath();
        cx.moveTo(x, y);
        cx.lineTo(x + ((i % 2) ? 9 : -7), y + 9);
        cx.lineTo(x + ((i % 3) ? 14 : -10), y + 18);
        cx.stroke();
      }
      return c;
    };

    texturesRef.current.wall = makeStoneTexture('#5f5a55', '#746d65', '#332c28');
    texturesRef.current.wallAlt = makeStoneTexture('#5f493e', '#7a5c4d', '#2d2019');

    Object.entries(ENEMY_ART).forEach(([key, src]) => {
      const img = new Image();
      img.src = src;
      imagesRef.current[key] = img;
    });
  }, []);

  const addPopup = useCallback((text, tone = 'gold') => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setPopups(prev => [...prev, { id, text, tone, left: 48 + Math.random() * 18 }]);
    const timer = setTimeout(() => setPopups(prev => prev.filter(p => p.id !== id)), 1650);
    popupTimersRef.current.push(timer);
  }, []);

  const ensureAudio = useCallback(async () => {
    if (!audioRef.current.enabled) return null;
    if (!audioRef.current.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      audioRef.current.ctx = new AC();
    }
    if (audioRef.current.ctx.state === 'suspended') {
      try { await audioRef.current.ctx.resume(); } catch {}
    }
    return audioRef.current.ctx;
  }, []);

  const playSound = useCallback(async (kind) => {
    const ctx = await ensureAudio();
    if (!ctx) return;
    const now = ctx.currentTime;
    const gain = ctx.createGain();
    gain.connect(ctx.destination);

    if (kind === 'chest') {
      const o1 = ctx.createOscillator();
      const o2 = ctx.createOscillator();
      o1.type = 'triangle'; o2.type = 'sine';
      o1.frequency.setValueAtTime(620, now); o1.frequency.exponentialRampToValueAtTime(980, now + 0.16);
      o2.frequency.setValueAtTime(310, now); o2.frequency.exponentialRampToValueAtTime(720, now + 0.16);
      gain.gain.setValueAtTime(0.0001, now); gain.gain.exponentialRampToValueAtTime(0.06, now + 0.01); gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
      o1.connect(gain); o2.connect(gain); o1.start(now); o2.start(now); o1.stop(now + 0.22); o2.stop(now + 0.22);
      return;
    }

    if (kind === 'spell') {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(280, now);
      osc.frequency.exponentialRampToValueAtTime(520, now + 0.15);
      gain.gain.setValueAtTime(0.0001, now); gain.gain.exponentialRampToValueAtTime(0.05, now + 0.01); gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
      osc.connect(gain); osc.start(now); osc.stop(now + 0.18);
      return;
    }

    if (kind === 'hurt') {
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.setValueAtTime(140, now);
      osc.frequency.exponentialRampToValueAtTime(80, now + 0.12);
      gain.gain.setValueAtTime(0.0001, now); gain.gain.exponentialRampToValueAtTime(0.055, now + 0.01); gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
      osc.connect(gain); osc.start(now); osc.stop(now + 0.16);
      return;
    }

    if (kind === 'boss') {
      const o1 = ctx.createOscillator();
      const o2 = ctx.createOscillator();
      o1.type = 'sawtooth'; o2.type = 'triangle';
      o1.frequency.setValueAtTime(90, now); o2.frequency.setValueAtTime(180, now);
      o1.frequency.exponentialRampToValueAtTime(50, now + 0.45); o2.frequency.exponentialRampToValueAtTime(110, now + 0.45);
      gain.gain.setValueAtTime(0.0001, now); gain.gain.exponentialRampToValueAtTime(0.09, now + 0.02); gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);
      o1.connect(gain); o2.connect(gain); o1.start(now); o2.start(now); o1.stop(now + 0.55); o2.stop(now + 0.55);
      return;
    }

    const osc = ctx.createOscillator();
    osc.type = kind === 'hit' ? 'triangle' : 'square';
    osc.frequency.setValueAtTime(kind === 'hit' ? 210 : 170, now);
    osc.frequency.exponentialRampToValueAtTime(kind === 'hit' ? 120 : 110, now + 0.1);
    gain.gain.setValueAtTime(0.0001, now); gain.gain.exponentialRampToValueAtTime(0.05, now + 0.01); gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);
    osc.connect(gain); osc.start(now); osc.stop(now + 0.14);
  }, [ensureAudio]);

  const startMusic = useCallback(async () => {
    const ctx = await ensureAudio();
    if (!ctx) return;
    if (audioRef.current.musicTimer) return;
    const notes = [110, 146.8, 130.8, 98, 123.4, 164.8];
    let step = 0;
    audioRef.current.musicTimer = window.setInterval(() => {
      if (!audioRef.current.enabled || !audioRef.current.ctx) return;
      const c = audioRef.current.ctx;
      const now = c.currentTime;
      [0, 0.35, 0.75].forEach((offset, idx) => {
        const osc = c.createOscillator();
        const gain = c.createGain();
        osc.type = idx === 0 ? 'triangle' : 'sine';
        osc.frequency.setValueAtTime(notes[(step + idx * 2) % notes.length], now + offset);
        gain.gain.setValueAtTime(0.0001, now + offset);
        gain.gain.linearRampToValueAtTime(idx === 0 ? 0.022 : 0.014, now + offset + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 1.0);
        osc.connect(gain); gain.connect(c.destination);
        osc.start(now + offset); osc.stop(now + offset + 1.05);
      });
      step = (step + 1) % notes.length;
    }, 1900);
  }, [ensureAudio]);

  const stopMusic = useCallback(() => {
    if (audioRef.current.musicTimer) {
      clearInterval(audioRef.current.musicTimer);
      audioRef.current.musicTimer = null;
    }
  }, []);

  const toggleAudio = useCallback(() => {
    const next = !audioRef.current.enabled;
    audioRef.current.enabled = next;
    setAudioEnabled(next);
    const save = JSON.parse(localStorage.getItem('cryptbound-save') || '{}');
    save.audioEnabled = next;
    localStorage.setItem('cryptbound-save', JSON.stringify(save));
    if (next) startMusic(); else stopMusic();
  }, [startMusic, stopMusic]);

  const syncHud = useCallback((s, toast = '') => {
    setHud({
      hp: Math.max(0, Math.ceil(s.hp)),
      maxHp: s.maxHp,
      mana: Math.ceil(s.mana),
      maxMana: s.maxMana,
      xp: s.xp,
      gold: s.gold,
      enemies: s.world.enemies.filter(e => e.alive).length,
      objective: s.world.objective,
      combo: s.combo || 0,
      toast
    });
  }, []);

  const saveGame = useCallback((s) => {
    const save = { unlocked: Math.max(unlocked, s.level), heroClass, gold: s.gold, xp: s.xp, upgrades: s.upgrades, audioEnabled: audioRef.current.enabled };
    localStorage.setItem('cryptbound-save', JSON.stringify(save));
  }, [heroClass, unlocked]);

  const startLevel = useCallback((chosen = level) => {
    const c = CLASSES[heroClass];
    const save = JSON.parse(localStorage.getItem('cryptbound-save') || '{}');
    const upgrades = save.upgrades || { vitality: 0, power: 0, focus: 0 };
    const world = makeLevel(chosen);
    const introDuration = world.boss ? 2300 : 0;
    const s = {
      level: chosen,
      x: 2.5,
      y: 2.5,
      angle: 0,
      hp: c.hp + upgrades.vitality * 10,
      maxHp: c.hp + upgrades.vitality * 10,
      mana: c.mana + upgrades.focus * 8,
      maxMana: c.mana + upgrades.focus * 8,
      damage: c.damage + upgrades.power * 3,
      xp: save.xp || 0,
      gold: save.gold || 0,
      keys: 0,
      world,
      lastAttack: 0,
      lastHit: 0,
      upgrades,
      completed: false,
      effects: [],
      combo: 0,
      shake: 0,
      introUntil: performance.now() + introDuration
    };
    actionsRef.current = { forward: false, back: false, strafeLeft: false, strafeRight: false, turnLeft: false, turnRight: false };
    stateRef.current = s;
    setLevel(chosen);
    setScreen('game');
    setInventoryOpen(false);
    setLevelSelect(false);
    syncHud(s, `Level ${chosen}: ${world.theme[0]}`);
    startMusic();
    if (world.boss) {
      setBossIntro({ title: world.bossName, subtitle: `Boss Dungeon — Level ${chosen}` });
      playSound('boss');
      setTimeout(() => setBossIntro(null), 2300);
    } else {
      setBossIntro(null);
    }
  }, [heroClass, level, playSound, startMusic, syncHud]);

  const canWalkSquare = useCallback((map, x, y, radius) => {
    const checks = [
      [x - radius, y - radius], [x + radius, y - radius], [x - radius, y + radius], [x + radius, y + radius],
      [x, y - radius], [x, y + radius], [x - radius, y], [x + radius, y]
    ];
    return checks.every(([cx, cy]) => map[Math.floor(cy)]?.[Math.floor(cx)] === 0);
  }, []);

  const canCompleteObjective = useCallback((s) => {
    const objective = s.world.objective;
    if (objective.includes('Recover')) return s.world.relic.taken;
    if (objective.includes('rune keys')) return s.world.chests.every(c => c.open);
    if (objective.includes('Survive') || objective.includes('Defeat')) return s.world.enemies.every(e => !e.alive);
    return true;
  }, []);

  const completeLevel = useCallback((s) => {
    if (s.completed) return;
    s.completed = true;
    const next = Math.min(100, s.level + 1);
    const newUnlocked = Math.max(unlocked, next);
    setUnlocked(newUnlocked);
    s.gold += 25 + s.level * 2;
    s.xp += 30;
    localStorage.setItem('cryptbound-save', JSON.stringify({ unlocked: newUnlocked, heroClass, gold: s.gold, xp: s.xp, upgrades: s.upgrades, audioEnabled: audioRef.current.enabled }));
    addPopup(`+${25 + s.level * 2} GOLD`, 'gold');
    syncHud(s, s.level === 100 ? 'The Shadow King has fallen!' : `Level cleared! Level ${next} unlocked.`);
    vibrate([25, 30, 25, 30, 50]);
    setTimeout(() => setScreen('victory'), 900);
  }, [addPopup, heroClass, syncHud, unlocked]);

  const tryMove = useCallback((forward, strafe, turn, dt = 1) => {
    const s = stateRef.current;
    if (!s || s.completed || performance.now() < s.introUntil) return;
    s.angle += turn * dt;
    const speed = .076 * dt;
    const mx = Math.cos(s.angle) * forward * speed + Math.cos(s.angle + Math.PI / 2) * strafe * speed;
    const my = Math.sin(s.angle) * forward * speed + Math.sin(s.angle + Math.PI / 2) * strafe * speed;
    const testX = s.x + mx;
    const testY = s.y + my;
    const radius = 0.28;

    if (canWalkSquare(s.world.map, testX, s.y, radius)) s.x = testX;
    if (canWalkSquare(s.world.map, s.x, testY, radius)) s.y = testY;

    const exitDist = Math.hypot(s.x - s.world.exit.x, s.y - s.world.exit.y);
    if (exitDist < 1.05 && canCompleteObjective(s)) completeLevel(s);
  }, [canCompleteObjective, canWalkSquare, completeLevel]);

  const attack = useCallback((spell = false) => {
    const s = stateRef.current;
    if (!s || s.completed || performance.now() < s.introUntil) return;
    const now = performance.now();
    if (now - s.lastAttack < (spell ? 800 : 420)) return;
    if (spell && s.mana < 18) {
      syncHud(s, 'Not enough mana');
      return;
    }
    s.lastAttack = now;
    if (spell) s.mana -= 18;
    s.effects.push({ type: spell ? 'spellCast' : 'slash', until: now + (spell ? 260 : 180) });

    let best = null;
    let bestDist = spell ? 6 : 2.15;
    for (const e of s.world.enemies) if (e.alive) {
      const dx = e.x - s.x;
      const dy = e.y - s.y;
      const dist = Math.hypot(dx, dy);
      const diff = Math.atan2(Math.sin(Math.atan2(dy, dx) - s.angle), Math.cos(Math.atan2(dy, dx) - s.angle));
      if (dist < bestDist && Math.abs(diff) < (spell ? .45 : .7)) {
        best = e;
        bestDist = dist;
      }
    }

    if (spell) playSound('spell'); else playSound('hit');

    if (best) {
      const crit = Math.random() < 0.18;
      let dmg = spell ? s.damage * 1.65 : s.damage;
      if (crit) dmg *= 1.8;
      best.hp -= dmg;
      s.effects.push({ type: 'impact', x: best.x, y: best.y, color: crit ? '#ffe45e' : (spell ? '#67dbff' : '#ffb36a'), until: now + 300 });
      if (crit) { addPopup('CRITICAL!', 'epic'); vibrate(30); }
      if (best.hp <= 0) {
        best.alive = false;
        s.combo = (s.combo || 0) + 1;
        const comboMult = 1 + Math.min(s.combo - 1, 8) * 0.12;
        const goldGain = Math.round((best.kind === 'boss' ? 100 : 8) * comboMult);
        const xpGain = Math.round((best.kind === 'boss' ? 80 : 15) * comboMult);
        s.gold += goldGain;
        s.xp += xpGain;
        addPopup(`+${goldGain} GOLD`, 'gold');
        addPopup(`+${xpGain} XP`, 'xp');
        if (s.combo >= 3) addPopup(`${s.combo}x COMBO`, 'epic');
        syncHud(s, best.kind === 'boss' ? 'Boss defeated!' : `+${goldGain} gold  +${xpGain} XP`);
        playSound(best.kind === 'boss' ? 'boss' : 'chest');
        vibrate(best.kind === 'boss' ? [40, 30, 60] : 18);
      } else {
        syncHud(s, crit ? 'Critical strike!' : (spell ? 'Arcane hit!' : 'Strike!'));
      }
    } else {
      syncHud(s, spell ? 'Spell missed' : 'Swing missed');
    }
  }, [addPopup, playSound, syncHud]);

  const upgrade = (type) => {
    const s = stateRef.current;
    if (!s) return;
    const cost = 50 + s.upgrades[type] * 35;
    if (s.gold < cost) {
      syncHud(s, 'Not enough gold');
      return;
    }
    s.gold -= cost;
    s.upgrades[type]++;
    if (type === 'vitality') { s.maxHp += 10; s.hp += 10; }
    if (type === 'power') s.damage += 3;
    if (type === 'focus') { s.maxMana += 8; s.mana += 8; }
    saveGame(s);
    addPopup(`${type.toUpperCase()} UP`, 'xp');
    playSound('chest');
    syncHud(s, `${type} upgraded`);
  };

  const setAction = useCallback((name, value) => {
    actionsRef.current[name] = value;
    if (value) startMusic();
  }, [startMusic]);

  const makeControlProps = useCallback((name) => ({
    onPointerDown: (e) => { e.preventDefault(); e.currentTarget.setPointerCapture?.(e.pointerId); setAction(name, true); },
    onPointerUp: (e) => { e.preventDefault(); setAction(name, false); },
    onPointerCancel: () => setAction(name, false),
    onPointerLeave: () => setAction(name, false),
    onContextMenu: (e) => e.preventDefault()
  }), [setAction]);

  useEffect(() => {
    if (screen !== 'game') return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { alpha: false });
    let frame;
    let lastTime = performance.now();

    const resize = () => {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      canvas.width = innerWidth * dpr;
      canvas.height = innerHeight * dpr;
      canvas.style.width = `${innerWidth}px`;
      canvas.style.height = `${innerHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = true;
    };

    const parseColor = (color) => {
      if (color[0] === '#') {
        const value = parseInt(color.slice(1), 16);
        return { r: value >> 16 & 255, g: value >> 8 & 255, b: value & 255 };
      }
      const m = color.match(/[\d.]+/g) || [0, 0, 0];
      return { r: +m[0], g: +m[1], b: +m[2] };
    };

    const mixColor = (a, b, t) => {
      const c1 = parseColor(a); const c2 = parseColor(b);
      const r = Math.round(c1.r + (c2.r - c1.r) * t);
      const g = Math.round(c1.g + (c2.g - c1.g) * t);
      const b2 = Math.round(c1.b + (c2.b - c1.b) * t);
      return `rgb(${r},${g},${b2})`;
    };

    const drawWallSlice = (x, y, w, h, hit, shade, dist, tint, themeDark, texX = 0.5, side = 0) => {
      const texture = hit === 2 ? texturesRef.current.wallAlt : texturesRef.current.wall;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.clip();

      if (texture) {
        const sx = Math.max(0, Math.min(texture.width - 1, Math.floor(texX * (texture.width - 1))));
        ctx.globalAlpha = 0.96;
        ctx.drawImage(texture, sx, 0, 1, texture.height, x, y, w + 0.8, h);
      } else {
        ctx.fillStyle = tint;
        ctx.fillRect(x, y, w, h);
      }

      ctx.globalAlpha = 0.28;
      const tintGrad = ctx.createLinearGradient(0, y, 0, y + h);
      tintGrad.addColorStop(0, mixColor(tint, '#f2dcc6', 0.2));
      tintGrad.addColorStop(0.55, tint);
      tintGrad.addColorStop(1, mixColor(tint, '#070707', 0.58));
      ctx.fillStyle = tintGrad;
      ctx.fillRect(x, y, w, h);

      ctx.globalAlpha = clamp((1 - shade) * 0.85 + (side ? 0.14 : 0), 0.06, 0.78);
      ctx.fillStyle = mixColor(themeDark, '#000000', 0.42);
      ctx.fillRect(x, y, w, h);

      ctx.globalAlpha = 0.16 * shade;
      ctx.fillStyle = '#fff8e5';
      ctx.fillRect(x, y, 1.2, h);
      ctx.globalAlpha = 0.08 * shade;
      ctx.fillRect(x, y, w, h * 0.08);

      ctx.globalAlpha = clamp(0.12 + dist / 28, 0.08, 0.36);
      ctx.fillStyle = '#000';
      ctx.fillRect(x, y + h * 0.82, w, h * 0.18);
      ctx.restore();
    };

    const drawFloorAndCeiling = (W, H, horizon, s, themeDark) => {
      const ceiling = ctx.createLinearGradient(0, 0, 0, horizon);
      ceiling.addColorStop(0, '#0a0b10');
      ceiling.addColorStop(0.55, mixColor(themeDark, '#17120f', 0.35));
      ceiling.addColorStop(1, '#15100d');
      ctx.fillStyle = ceiling;
      ctx.fillRect(0, 0, W, horizon);

      for (let i = 0; i < 7; i++) {
        const beamY = i * (horizon / 7);
        ctx.fillStyle = 'rgba(0,0,0,0.12)';
        ctx.fillRect(0, beamY, W, 8);
        ctx.fillStyle = 'rgba(255,245,210,0.02)';
        ctx.fillRect(0, beamY + 8, W, 2);
      }

      const torchXs = [0.18, 0.5, 0.82];
      torchXs.forEach((p, idx) => {
        const tx = W * p;
        const flicker = 0.78 + Math.sin(performance.now() / 210 + idx * 1.4) * 0.08;
        const glow = ctx.createRadialGradient(tx, horizon * 0.44, 4, tx, horizon * 0.46, 110 * flicker);
        glow.addColorStop(0, 'rgba(255,214,140,0.38)');
        glow.addColorStop(0.25, 'rgba(255,144,44,0.15)');
        glow.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(tx - 120, horizon * 0.2, 240, 180);
        ctx.fillStyle = '#3d2f23';
        ctx.fillRect(tx - 3, horizon * 0.44, 6, 28);
        ctx.fillStyle = '#ffb84d';
        ctx.beginPath(); ctx.ellipse(tx, horizon * 0.43, 4, 7, 0, 0, Math.PI * 2); ctx.fill();
      });

      const floor = ctx.createLinearGradient(0, horizon, 0, H);
      floor.addColorStop(0, '#514941');
      floor.addColorStop(0.45, '#2a241f');
      floor.addColorStop(1, '#090909');
      ctx.fillStyle = floor;
      ctx.fillRect(0, horizon, W, H - horizon);

      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.beginPath();
      ctx.moveTo(W * 0.32, horizon); ctx.lineTo(W * 0.68, horizon); ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath();
      ctx.fill();

      for (let i = 0; i < 34; i++) {
        const p = i / 34;
        const y = horizon + Math.pow(p, 1.58) * (H - horizon);
        ctx.strokeStyle = `rgba(255,255,255,${0.075 * (1 - p)})`;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      }
      for (let i = -15; i <= 15; i++) {
        const x = W / 2 + i * 54;
        ctx.strokeStyle = 'rgba(255,255,255,.03)';
        ctx.beginPath(); ctx.moveTo(x, horizon); ctx.lineTo(W / 2 + i * 190, H); ctx.stroke();
      }

      for (let i = 0; i < 7; i++) {
        const stainX = ((s.level * 133 + i * 211) % W);
        const stainY = horizon + 50 + ((s.level * 79 + i * 97) % Math.max(80, H - horizon - 90));
        ctx.fillStyle = 'rgba(80,16,15,0.16)';
        ctx.beginPath(); ctx.ellipse(stainX, stainY, 10 + (i % 4) * 8, 5 + (i % 3) * 6, i * 0.6, 0, Math.PI * 2); ctx.fill();
      }

      const fog = ctx.createLinearGradient(0, horizon - 28, 0, H);
      fog.addColorStop(0, 'rgba(0,0,0,0)');
      fog.addColorStop(1, 'rgba(0,0,0,.52)');
      ctx.fillStyle = fog;
      ctx.fillRect(0, horizon - 28, W, H - horizon + 28);

      for (let i = 0; i < 14; i++) {
        const cx = ((i * 173 + s.level * 29) % W);
        const cy = (i * 91 + s.level * 17) % H;
        const pulse = 0.04 + Math.sin(performance.now() / 700 + i) * 0.016;
        ctx.fillStyle = `rgba(255,220,150,${pulse})`;
        ctx.beginPath(); ctx.arc(cx, cy, 1 + (i % 3), 0, Math.PI * 2); ctx.fill();
      }
    };

    const worldToScreen = (sp, s, W, H, rays, zbuf) => {
      const dx = sp.x - s.x;
      const dy = sp.y - s.y;
      const dist = Math.hypot(dx, dy);
      const ang = Math.atan2(Math.sin(Math.atan2(dy, dx) - s.angle), Math.cos(Math.atan2(dy, dx) - s.angle));
      if (Math.abs(ang) > .68 || dist < .25) return null;
      const sx = W / 2 + (ang / 1.12) * W;
      const size = Math.min(H * .85, H / dist * (sp.type === 'enemy' ? 1 : .72));
      const rayIndex = Math.max(0, Math.min(rays - 1, Math.floor((sx / W) * rays)));
      if (dist > zbuf[rayIndex] + .35) return null;
      return { dist, ang, sx, size };
    };

    const drawSprite = (sp, screenPos, horizon, t) => {
      const { sx, size } = screenPos;
      if (sp.type === 'enemy') {
        const bob = Math.sin(t / 260 + (sp.bob || 0)) * size * 0.02;
        const img = imagesRef.current[sp.kind === 'boss' ? 'boss' : sp.kind];
        ctx.save();
        ctx.translate(sx, horizon + size * .05 + bob);
        ctx.shadowBlur = sp.enraged ? 30 : sp.kind === 'boss' ? 26 : 18;
        ctx.shadowColor = sp.enraged ? '#ff2a1a' : sp.kind === 'boss' ? '#ff4a38' : 'rgba(0,0,0,.68)';
        if (img?.complete) {
          const drawW = size * (sp.kind === 'spider' ? 0.86 : sp.kind === 'boss' ? 0.92 : 0.8);
          const drawH = size * (sp.kind === 'wraith' ? 0.94 : sp.kind === 'spider' ? 0.62 : sp.kind === 'boss' ? 0.98 : 0.9);
          ctx.drawImage(img, -drawW / 2, -drawH * 0.78, drawW, drawH);
        } else {
          ctx.fillStyle = sp.kind === 'boss' ? '#7a241c' : sp.kind === 'wraith' ? '#8b80db' : sp.kind === 'skeleton' ? '#d7d0c0' : '#5a3725';
          ctx.beginPath();
          ctx.ellipse(0, 0, size * 0.18, size * 0.22, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#24110d';
        ctx.fillRect(-size * .24, -size * .5, size * .48, 7);
        ctx.fillStyle = '#e43b32';
        ctx.fillRect(-size * .24, -size * .5, size * .48 * (sp.hp / sp.maxHp), 7);
        ctx.restore();
        return;
      }

      ctx.save();
      ctx.translate(screenPos.sx, horizon + Math.sin(t / 450) * 2);
      ctx.shadowBlur = 22;
      if (sp.type === 'exit') {
        ctx.shadowColor = '#5ee5ff';
        ctx.fillStyle = '#4ca9b7';
        ctx.fillRect(-screenPos.size * .18, -screenPos.size * .45, screenPos.size * .36, screenPos.size * .8);
        ctx.fillStyle = '#08151b';
        ctx.fillRect(-screenPos.size * .11, -screenPos.size * .36, screenPos.size * .22, screenPos.size * .66);
        ctx.fillStyle = '#7ff0ff';
        ctx.fillRect(screenPos.size * .05, -screenPos.size * .02, screenPos.size * .04, screenPos.size * .04);
      }
      if (sp.type === 'relic') {
        ctx.shadowColor = '#ffd85e';
        const relic = ctx.createRadialGradient(0, 0, screenPos.size * .03, 0, 0, screenPos.size * .28);
        relic.addColorStop(0, '#fff8cd'); relic.addColorStop(.35, '#ffd357'); relic.addColorStop(1, '#9f6b14');
        ctx.fillStyle = relic;
        ctx.beginPath(); ctx.moveTo(0, -screenPos.size * .28); ctx.lineTo(screenPos.size * .18, 0); ctx.lineTo(0, screenPos.size * .28); ctx.lineTo(-screenPos.size * .18, 0); ctx.closePath(); ctx.fill();
      }
      if (sp.type === 'potion') {
        ctx.shadowColor = '#ff5ea0';
        const glass = ctx.createLinearGradient(0, -screenPos.size * .26, 0, screenPos.size * .1);
        glass.addColorStop(0, '#ffd7e6'); glass.addColorStop(.5, '#ff5ea0'); glass.addColorStop(1, '#7d1240');
        ctx.fillStyle = glass;
        ctx.beginPath();
        ctx.moveTo(-screenPos.size * .07, -screenPos.size * .26);
        ctx.lineTo(screenPos.size * .07, -screenPos.size * .26);
        ctx.lineTo(screenPos.size * .11, screenPos.size * .02);
        ctx.quadraticCurveTo(0, screenPos.size * .12, -screenPos.size * .11, screenPos.size * .02);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#c98c56';
        ctx.fillRect(-screenPos.size * .04, -screenPos.size * .33, screenPos.size * .08, screenPos.size * .08);
      }
      if (sp.type === 'chest') {
        ctx.shadowColor = 'rgba(255,215,114,.45)';
        ctx.fillStyle = '#6a3c1f';
        ctx.fillRect(-screenPos.size * .2, -screenPos.size * .12, screenPos.size * .4, screenPos.size * .22);
        ctx.fillStyle = '#8c5a34';
        ctx.beginPath();
        ctx.moveTo(-screenPos.size * .2, -screenPos.size * .12);
        ctx.quadraticCurveTo(0, -screenPos.size * .28, screenPos.size * .2, -screenPos.size * .12);
        ctx.fill();
        ctx.fillStyle = '#d6ab4f';
        ctx.fillRect(-screenPos.size * .02, -screenPos.size * .05, screenPos.size * .04, screenPos.size * .08);
      }
      ctx.restore();
    };

    const drawEffects = (effects, s, W, H, horizon, rays, zbuf, t) => {
      effects.forEach(effect => {
        const progress = 1 - (effect.until - t) / (effect.type === 'impact' ? 300 : 240);
        if (effect.type === 'slash') {
          ctx.save();
          ctx.translate(W * .69, H * .75);
          ctx.rotate(-0.65 + progress * 1.2);
          ctx.strokeStyle = `rgba(255,210,150,${0.65 - progress * 0.4})`;
          ctx.lineWidth = 8;
          ctx.beginPath(); ctx.arc(0, 0, 120, -1.5, -.1); ctx.stroke();
          ctx.restore();
        }
        if (effect.type === 'spellCast') {
          ctx.save();
          ctx.fillStyle = `rgba(84,222,255,${0.22 - progress * 0.18})`;
          ctx.beginPath(); ctx.arc(W * .72, H * .84, 22 + progress * 44, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        }
        if (effect.type === 'impact') {
          const pos = worldToScreen({ x: effect.x, y: effect.y, type: 'enemy' }, s, W, H, rays, zbuf);
          if (!pos) return;
          ctx.save();
          ctx.translate(pos.sx, horizon + pos.size * .02);
          ctx.strokeStyle = effect.color;
          ctx.globalAlpha = 0.85 - progress * 0.7;
          ctx.lineWidth = 4;
          ctx.beginPath(); ctx.arc(0, 0, 8 + progress * 24, 0, Math.PI * 2); ctx.stroke();
          for (let i = 0; i < 6; i++) {
            const ang = (i / 6) * Math.PI * 2 + progress * 2;
            ctx.beginPath(); ctx.moveTo(Math.cos(ang) * 8, Math.sin(ang) * 8); ctx.lineTo(Math.cos(ang) * (18 + progress * 18), Math.sin(ang) * (18 + progress * 18)); ctx.stroke();
          }
          ctx.restore();
        }
      });
    };

    const drawMinimap = (s) => {
      const mm = minimapRef.current;
      if (!mm) return;
      const mctx = mm.getContext('2d');
      const size = 140;
      const map = s.world.map;
      const cell = size / map.length;
      mctx.clearRect(0, 0, size, size);
      mctx.fillStyle = 'rgba(6,5,7,0.72)';
      mctx.beginPath();
      mctx.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2);
      mctx.fill();
      mctx.save();
      mctx.beginPath();
      mctx.arc(size / 2, size / 2, size / 2 - 3, 0, Math.PI * 2);
      mctx.clip();
      const camX = s.x * cell;
      const camY = s.y * cell;
      const offX = size / 2 - camX;
      const offY = size / 2 - camY;
      const range = 5.5;
      for (let y = Math.max(0, Math.floor(s.y - range)); y < Math.min(map.length, s.y + range); y++) {
        for (let x = Math.max(0, Math.floor(s.x - range)); x < Math.min(map[0].length, s.x + range); x++) {
          if (map[y][x] === 0) {
            mctx.fillStyle = 'rgba(220,205,180,0.16)';
            mctx.fillRect(x * cell + offX, y * cell + offY, cell + .5, cell + .5);
          }
        }
      }
      if (!s.world.relic.taken) {
        mctx.fillStyle = '#ffd85e';
        mctx.beginPath(); mctx.arc(s.world.relic.x * cell + offX, s.world.relic.y * cell + offY, 3, 0, Math.PI * 2); mctx.fill();
      }
      s.world.chests.filter(c => !c.open).forEach(c => {
        mctx.fillStyle = '#ffb14d';
        mctx.fillRect(c.x * cell + offX - 2, c.y * cell + offY - 2, 4, 4);
      });
      mctx.fillStyle = '#5ee5ff';
      mctx.beginPath(); mctx.arc(s.world.exit.x * cell + offX, s.world.exit.y * cell + offY, 3.5, 0, Math.PI * 2); mctx.fill();
      s.world.enemies.filter(e => e.alive && Math.hypot(e.x - s.x, e.y - s.y) < range).forEach(e => {
        mctx.fillStyle = e.kind === 'boss' ? '#ff3b30' : '#e0574a';
        mctx.beginPath(); mctx.arc(e.x * cell + offX, e.y * cell + offY, e.kind === 'boss' ? 4 : 2.5, 0, Math.PI * 2); mctx.fill();
      });
      mctx.save();
      mctx.translate(size / 2, size / 2);
      mctx.rotate(s.angle);
      mctx.fillStyle = '#fff';
      mctx.beginPath();
      mctx.moveTo(7, 0); mctx.lineTo(-5, -5); mctx.lineTo(-5, 5); mctx.closePath(); mctx.fill();
      mctx.restore();
      mctx.restore();
      mctx.strokeStyle = 'rgba(230,200,150,0.5)';
      mctx.lineWidth = 2;
      mctx.beginPath(); mctx.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2); mctx.stroke();
    };

    resize();
    addEventListener('resize', resize);

    const render = (t) => {
      const s = stateRef.current;
      if (!s) return;
      const dt = clamp((t - lastTime) / 16.67, 0.6, 1.55);
      lastTime = t;
      const W = innerWidth;
      const H = innerHeight;
      const horizon = H * .48;
      const rays = Math.min(560, Math.floor(W * 0.68));
      const [, wall, dark] = s.world.theme;

      const a = actionsRef.current;
      const forwardInput = (a.forward ? 1 : 0) + (a.back ? -1 : 0);
      const strafeInput = (a.strafeRight ? 1 : 0) + (a.strafeLeft ? -1 : 0);
      const turnInput = (a.turnRight ? 1 : 0) + (a.turnLeft ? -1 : 0);
      if (forwardInput || strafeInput || turnInput) tryMove(forwardInput, strafeInput, turnInput * .06, dt);

      for (const e of s.world.enemies) {
        if (!e.alive) continue;
        const dist = Math.hypot(e.x - s.x, e.y - s.y);
        if (dist < 8 && dist > (e.kind === 'boss' ? 1.15 : 0.84) && performance.now() > s.introUntil) {
          const angleToPlayer = Math.atan2(s.y - e.y, s.x - e.x);
          const enraged = e.hp < e.maxHp * 0.3;
          e.enraged = enraged;
          const baseSpeed = (e.kind === 'wraith' ? 0.03 : e.kind === 'boss' ? 0.034 : 0.026);
          const speed = baseSpeed * (enraged ? 1.55 : 1) * dt;
          const wiggle = Math.sin(t / 400 + e.roam) * (enraged ? 0.08 : 0.18);
          const tx = e.x + Math.cos(angleToPlayer + wiggle) * speed;
          const ty = e.y + Math.sin(angleToPlayer + wiggle) * speed;
          if (canWalkSquare(s.world.map, tx, e.y, 0.22)) e.x = tx;
          if (canWalkSquare(s.world.map, e.x, ty, 0.22)) e.y = ty;
        }
      }

      for (const chest of s.world.chests) {
        if (!chest.open && Math.hypot(chest.x - s.x, chest.y - s.y) < .85) {
          chest.open = true;
          s.gold += chest.gold;
          addPopup(`+${chest.gold} GOLD`, chest.rare ? 'epic' : 'gold');
          if (chest.rare) addPopup('RARE LOOT', 'epic');
          s.effects.push({ type: 'impact', x: chest.x, y: chest.y, color: chest.rare ? '#ffcf52' : '#ffeeb2', until: performance.now() + 320 });
          playSound('chest');
          vibrate(chest.rare ? [20, 20, 20] : 15);
          syncHud(s, chest.rare ? 'Rare treasure found!' : 'Treasure chest opened!');
        }
      }

      s.shake = Math.max(0, (s.shake || 0) - dt * 1.4);
      const shakeMag = s.shake;
      const shakeX = shakeMag ? (Math.random() - 0.5) * shakeMag : 0;
      const shakeY = shakeMag ? (Math.random() - 0.5) * shakeMag * 0.6 : 0;
      ctx.save();
      ctx.translate(shakeX, shakeY);

      drawFloorAndCeiling(W, H, horizon, s, dark);

      const wallTint = mixColor('#6d6761', wall, 0.22);
      const wallAltTint = mixColor('#7a5948', wall, 0.32);

      const zbuf = [];
      const dirX = Math.cos(s.angle);
      const dirY = Math.sin(s.angle);
      const planeX = -dirY * 0.66;
      const planeY = dirX * 0.66;
      for (let i = 0; i < rays; i++) {
        const cameraX = 2 * i / rays - 1;
        const rayDirX = dirX + planeX * cameraX;
        const rayDirY = dirY + planeY * cameraX;
        let mapX = Math.floor(s.x);
        let mapY = Math.floor(s.y);
        const deltaDistX = rayDirX === 0 ? 1e30 : Math.abs(1 / rayDirX);
        const deltaDistY = rayDirY === 0 ? 1e30 : Math.abs(1 / rayDirY);
        let stepX, stepY, sideDistX, sideDistY;
        if (rayDirX < 0) { stepX = -1; sideDistX = (s.x - mapX) * deltaDistX; } else { stepX = 1; sideDistX = (mapX + 1 - s.x) * deltaDistX; }
        if (rayDirY < 0) { stepY = -1; sideDistY = (s.y - mapY) * deltaDistY; } else { stepY = 1; sideDistY = (mapY + 1 - s.y) * deltaDistY; }
        let hit = 0;
        let side = 0;
        while (!hit) {
          if (sideDistX < sideDistY) {
            sideDistX += deltaDistX;
            mapX += stepX;
            side = 0;
          } else {
            sideDistY += deltaDistY;
            mapY += stepY;
            side = 1;
          }
          const cell = s.world.map[mapY]?.[mapX];
          if (cell === undefined) { hit = 1; break; }
          hit = cell;
        }
        let perpWallDist = side === 0 ? (mapX - s.x + (1 - stepX) / 2) / rayDirX : (mapY - s.y + (1 - stepY) / 2) / rayDirY;
        perpWallDist = Math.max(0.01, perpWallDist);
        let wallX = side === 0 ? s.y + perpWallDist * rayDirY : s.x + perpWallDist * rayDirX;
        wallX -= Math.floor(wallX);
        zbuf[i] = perpWallDist;
        const colW = W / rays + 1.1;
        const h = Math.min(H * 1.85, H / perpWallDist);
        const shade = clamp((1 - perpWallDist / 18) * (side ? 0.88 : 1.08), .13, .98);
        drawWallSlice(i * W / rays, horizon - h / 2, colW, h, hit, shade, perpWallDist, hit === 2 ? wallAltTint : wallTint, dark, wallX, side);
        ctx.save();
        ctx.globalAlpha = 0.08 * shade;
        ctx.fillStyle = wallX > .45 && wallX < .55 ? '#fff6d8' : '#000';
        ctx.fillRect(i * W / rays, horizon - h / 2, colW, h);
        ctx.restore();
      }

      const sprites = [
        ...s.world.enemies.filter(e => e.alive).map(e => ({ ...e, type: 'enemy' })),
        { ...s.world.exit, type: 'exit' },
        ...(s.world.relic.taken ? [] : [{ ...s.world.relic, type: 'relic' }]),
        ...s.world.chests.filter(c => !c.open).map(c => ({ ...c, type: 'chest' })),
        ...s.world.potions.filter(p => !p.taken).map(p => ({ ...p, type: 'potion' }))
      ];
      sprites.sort((a2, b2) => Math.hypot(b2.x - s.x, b2.y - s.y) - Math.hypot(a2.x - s.x, a2.y - s.y));
      for (const sp of sprites) {
        const pos = worldToScreen(sp, s, W, H, rays, zbuf);
        if (!pos) continue;
        drawSprite(sp, pos, horizon, t);
      }

      s.effects = s.effects.filter(effect => effect.until > performance.now());
      drawEffects(s.effects, s, W, H, horizon, rays, zbuf, performance.now());

      ctx.restore();

      const vignette = ctx.createRadialGradient(W / 2, H / 2, H * .12, W / 2, H / 2, H * .78);
      vignette.addColorStop(.45, 'rgba(0,0,0,0)');
      vignette.addColorStop(1, 'rgba(0,0,0,.48)');
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, W, H);

      ctx.strokeStyle = 'rgba(255,255,255,.7)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(W / 2 - 8, H / 2); ctx.lineTo(W / 2 + 8, H / 2);
      ctx.moveTo(W / 2, H / 2 - 8); ctx.lineTo(W / 2, H / 2 + 8);
      ctx.stroke();

      ctx.save();
      ctx.translate(W * .76, H * .9);
      ctx.rotate(-.24 + Math.sin(t / 210) * .018);
      const sword = ctx.createLinearGradient(0, -15, 180, 16);
      sword.addColorStop(0, '#d5dde1'); sword.addColorStop(.45, '#f8fbff'); sword.addColorStop(1, '#81919b');
      ctx.fillStyle = '#7a5735'; ctx.fillRect(-16, -11, 135, 24);
      ctx.fillStyle = '#b38d58'; ctx.fillRect(-27, -5, 24, 12);
      ctx.fillStyle = sword;
      ctx.beginPath(); ctx.moveTo(0, -14); ctx.lineTo(170, -7); ctx.lineTo(205, 0); ctx.lineTo(170, 7); ctx.lineTo(0, 14); ctx.closePath(); ctx.fill();
      ctx.restore();

      for (const e of s.world.enemies) {
        if (e.alive && Math.hypot(e.x - s.x, e.y - s.y) < .72 && t - s.lastHit > 850 && performance.now() > s.introUntil) {
          s.lastHit = t;
          s.hp -= e.kind === 'boss' ? 18 : 7;
          s.combo = 0;
          s.shake = e.kind === 'boss' ? 18 : 10;
          s.effects.push({ type: 'impact', x: s.x + Math.cos(s.angle) * .6, y: s.y + Math.sin(s.angle) * .6, color: '#ff5353', until: performance.now() + 240 });
          syncHud(s, 'You were hit!');
          playSound('hurt');
          vibrate(e.kind === 'boss' ? [50, 40, 50] : 35);
          if (s.hp <= 0) {
            saveGame(s);
            setScreen('defeat');
          }
        }
      }

      if (s.mana < s.maxMana) s.mana = Math.min(s.maxMana, s.mana + .018 * dt);
      if (!s.world.relic.taken && Math.hypot(s.x - s.world.relic.x, s.y - s.world.relic.y) < .8) {
        s.world.relic.taken = true;
        s.gold += 40;
        addPopup('+40 GOLD', 'gold');
        addPopup('ANCIENT RELIC', 'xp');
        playSound('chest');
        vibrate(25);
        syncHud(s, 'Ancient relic recovered!');
      }

      for (const potion of s.world.potions) {
        if (!potion.taken && Math.hypot(potion.x - s.x, potion.y - s.y) < .7) {
          potion.taken = true;
          const healAmount = Math.round(s.maxHp * 0.3);
          s.hp = Math.min(s.maxHp, s.hp + healAmount);
          addPopup(`+${healAmount} HP`, 'heal');
          playSound('chest');
          vibrate(15);
          syncHud(s, 'Healing draught consumed!');
        }
      }

      drawMinimap(s);

      frame = requestAnimationFrame(render);
    };

    frame = requestAnimationFrame(render);

    const keyDown = (e) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      if (k === 'w' || e.key === 'ArrowUp') setAction('forward', true);
      if (k === 's' || e.key === 'ArrowDown') setAction('back', true);
      if (k === 'a') setAction('strafeLeft', true);
      if (k === 'd') setAction('strafeRight', true);
      if (e.key === 'ArrowLeft') setAction('turnLeft', true);
      if (e.key === 'ArrowRight') setAction('turnRight', true);
      if (e.key === ' ') attack(false);
      if (k === 'e') attack(true);
      if (k === 'm') toggleAudio();
    };

    const keyUp = (e) => {
      const k = e.key.toLowerCase();
      if (k === 'w' || e.key === 'ArrowUp') setAction('forward', false);
      if (k === 's' || e.key === 'ArrowDown') setAction('back', false);
      if (k === 'a') setAction('strafeLeft', false);
      if (k === 'd') setAction('strafeRight', false);
      if (e.key === 'ArrowLeft') setAction('turnLeft', false);
      if (e.key === 'ArrowRight') setAction('turnRight', false);
    };

    const clearActions = () => { actionsRef.current = { forward: false, back: false, strafeLeft: false, strafeRight: false, turnLeft: false, turnRight: false }; };

    addEventListener('keydown', keyDown);
    addEventListener('keyup', keyUp);
    addEventListener('blur', clearActions);

    return () => {
      cancelAnimationFrame(frame);
      removeEventListener('resize', resize);
      removeEventListener('keydown', keyDown);
      removeEventListener('keyup', keyUp);
      removeEventListener('blur', clearActions);
    };
  }, [addPopup, attack, canWalkSquare, playSound, saveGame, screen, setAction, syncHud, toggleAudio, tryMove]);

  useEffect(() => {
    if (screen !== 'game') return;
    let last = null;
    const down = (e) => {
      if (e.target.closest('button') || inventoryOpen) return;
      last = e.clientX;
      startMusic();
    };
    const drag = (e) => {
      if (last === null) return;
      const delta = e.clientX - last;
      tryMove(0, 0, delta * .005);
      last = e.clientX;
    };
    const up = () => { last = null; };
    addEventListener('pointerdown', down);
    addEventListener('pointermove', drag);
    addEventListener('pointerup', up);
    addEventListener('pointercancel', up);
    return () => {
      removeEventListener('pointerdown', down);
      removeEventListener('pointermove', drag);
      removeEventListener('pointerup', up);
      removeEventListener('pointercancel', up);
    };
  }, [inventoryOpen, screen, startMusic, tryMove]);

  const portraitUrl = CLASSES[heroClass].portrait;

  if (screen === 'menu') {
    return <main className="menu">
      <div className="menuFx">
        {Array.from({ length: 8 }, (_, i) => <span key={i} className={`spark s${i + 1}`}>✦</span>)}
      </div>
      <div className="titleScene">
        <div className="gate"><div className="gateGlow" /></div>
        <div className="titleOrnament left" />
        <div className="titleOrnament right" />
      </div>
      <div className="logo"><span>CRYPT</span>BOUND</div>
      <p className="tag">100 LEVELS. TEN REALMS. ONE WAY OUT.</p>
      <div className="classRow">
        {Object.entries(CLASSES).map(([k, c]) => <button key={k} className={`classCard ${heroClass === k ? 'selected' : ''}`} onClick={() => setHeroClass(k)}>
          <div className="classPortrait" style={{ backgroundImage: `url(${c.portrait})` }} />
          <div className="classCopy"><b>{c.name}</b><small>{k === 'warrior' ? 'Heavy armor • powerful melee' : 'High mana • stronger spells'}</small></div>
        </button>)}
      </div>
      <div className="menuActions">
        <button className="primary" onClick={() => startLevel(Math.min(unlocked, 100))}>CONTINUE — LEVEL {unlocked}</button>
        <button className="secondary" onClick={() => setLevelSelect(true)}>LEVEL SELECT</button>
        <button className="secondary soundBtn" onClick={toggleAudio}>{audioEnabled ? 'SOUND ON' : 'SOUND OFF'}</button>
      </div>
      {levelSelect && <div className="modal"><h2>Select Level</h2><div className="levels">{Array.from({ length: 100 }, (_, i) => i + 1).map(n => <button disabled={n > unlocked} onClick={() => startLevel(n)} key={n}>{n}</button>)}</div><button className="secondary" onClick={() => setLevelSelect(false)}>Close</button></div>}
      <div className="features">Boss intros • live AI • spell effects • treasure chests • synth audio • autosave</div>
    </main>;
  }

  if (screen === 'victory' || screen === 'defeat') {
    return <main className="menu endscreen">
      <div className="logo">{screen === 'victory' ? 'LEVEL CLEARED' : 'YOU FELL'}</div>
      <p className="tag">{hud.toast}</p>
      <div className="endPortrait" style={{ backgroundImage: `url(${portraitUrl})` }} />
      {screen === 'victory' && level < 100 ? <button className="primary" onClick={() => startLevel(level + 1)}>ENTER LEVEL {level + 1}</button> : <button className="primary" onClick={() => startLevel(level)}>TRY AGAIN</button>}
      <button className="secondary" onClick={() => setScreen('menu')}>MAIN MENU</button>
    </main>;
  }

  return <main className="game">
    <canvas ref={canvasRef} />
    <div className="topHud">
      <div className="portrait" style={{ backgroundImage: `url(${portraitUrl})` }} />
      <div className="bars"><div className="bar"><i style={{ width: `${hud.hp / hud.maxHp * 100}%` }} /><span>{hud.hp}/{hud.maxHp}</span></div><div className="bar mana"><i style={{ width: `${hud.mana / hud.maxMana * 100}%` }} /><span>{hud.mana}/{hud.maxMana}</span></div></div>
      <div className="levelInfo"><b>LEVEL {level}</b><small>{stateRef.current?.world.theme[0]}</small></div>
      <button className="iconBtn mini" onClick={toggleAudio}>{audioEnabled ? '♪' : '✕'}</button>
      <button className="iconBtn" onClick={() => setInventoryOpen(true)}>☰</button>
    </div>
    <div className="objective"><b>{hud.objective}</b><span>Enemies: {hud.enemies} · Gold: {hud.gold} · XP: {hud.xp}{hud.combo > 1 ? ` · ${hud.combo}x combo` : ''}</span></div>
    <canvas ref={minimapRef} className="minimap" width={140} height={140} />
    {hud.toast && <div className="toast">{hud.toast}</div>}
    <div className="popupStack">{popups.map(p => <div key={p.id} className={`lootPopup ${p.tone}`} style={{ left: `${p.left}%` }}>{p.text}</div>)}</div>
    {bossIntro && <div className="bossIntro"><small>{bossIntro.subtitle}</small><b>{bossIntro.title}</b></div>}
    <div className="pad"><button {...makeControlProps('turnLeft')}>↶</button><button {...makeControlProps('forward')}>▲</button><button {...makeControlProps('turnRight')}>↷</button><button {...makeControlProps('strafeLeft')}>◀</button><button {...makeControlProps('back')}>▼</button><button {...makeControlProps('strafeRight')}>▶</button></div>
    <div className="actions"><button className="spell" onPointerDown={() => { startMusic(); attack(true); }}>✦<small>{CLASSES[heroClass].spell}</small></button><button className="attack" onPointerDown={() => { startMusic(); attack(false); }}>⚔<small>ATTACK</small></button></div>
    <div className="hint">Swipe the dungeon to look around · Chests open when you get close</div>
    {inventoryOpen && <div className="modal inventory"><h2>Hero & Upgrades</h2><div className="inventoryHero"><div className="portrait big" style={{ backgroundImage: `url(${portraitUrl})` }} /><div className="stats"><span>Damage <b>{stateRef.current?.damage}</b></span><span>Gold <b>{hud.gold}</b></span><span>XP <b>{hud.xp}</b></span></div></div>{['vitality', 'power', 'focus'].map(type => <button className="upgrade" key={type} onClick={() => upgrade(type)}><b>{type.toUpperCase()} +1</b><small>Cost: {50 + (stateRef.current?.upgrades[type] || 0) * 35} gold</small></button>)}<button className="secondary" onClick={() => setInventoryOpen(false)}>Return to dungeon</button><button className="secondary danger" onClick={() => { saveGame(stateRef.current); setScreen('menu'); }}>Save & quit</button></div>}
  </main>;
}
