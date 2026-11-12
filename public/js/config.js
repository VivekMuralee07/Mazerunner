// Central tuning: every gameplay number lives here.

export const LANES = [-2.4, 0, 2.4];
export const LANE_COUNT = 3;
export const CORRIDOR_HALF = 4.0;       // inner half-width of the corridor
export const SEG_LEN = 24;              // length of one corridor segment
export const VIEW_AHEAD = 190;          // how far ahead segments exist
export const KEEP_BEHIND = 70;
export const BIOME_LEN = 1500;          // metres per biome

export const PLAYER = {
  halfDepth: 0.35,
  halfWidth: 0.3,
  height: 1.75,
  rollHeight: 0.8,
  jumpHeight: 2.35,
  gravity: 40,
  fastFall: 70,
  laneSpeed: 30,
  rollTime: 0.62,
  stepUp: 0.42,   // how much a surface may rise in one go before it counts as a wall
};

export const SPEED = {
  start: 15,
  max: 36,
  accel: 0.115,     // m/s per second
  stumblePenalty: 0.72,
};

export const CHASER = {
  farZ: 13,
  nearZ: 2.6,
  nearTime: 7,      // seconds the beast stays on your heels after a stumble
};

export const POWERUPS = {
  magnet: { name: 'Magnet', icon: '🧲', color: '#ff5470', base: 8, step: 2.5, desc: 'Pulls coins toward you', cost: [200, 400, 800, 1600, 3200] },
  double: { name: 'Double Points', icon: '✖2', color: '#ffd23f', base: 9, step: 2.5, desc: 'Doubles every point you earn', cost: [200, 400, 800, 1600, 3200] },
  boots:  { name: 'Spring Boots', icon: '👢', color: '#37e08a', base: 9, step: 2.5, desc: 'Jump much higher', cost: [200, 400, 800, 1600, 3200] },
  wings:  { name: 'Wings', icon: '🪽', color: '#6fd6ff', base: 6, step: 1.2, desc: 'Fly over the maze, safely', cost: [300, 600, 1200, 2400, 4800] },
  jetpack: { name: 'Jetpack', icon: '🚀', color: '#ff7a1a', base: 15, step: 0, desc: 'Blast over the maze for 15 seconds, collecting sky coins', cost: [] },
  car: { name: 'Bonus Car', icon: '🚗', color: '#ff4a5e', base: 60, step: 0, desc: 'Drive a car for 1 minute', cost: [] },
  heart: { name: 'Revive Heart', icon: '❤', color: '#ff4f8b', base: 0, step: 0, desc: 'Brings your buddy back', cost: [] },
  shield: { name: 'Spirit Shield', icon: '🛡', color: '#b388ff', base: 0, step: 0, desc: 'Absorbs one crash', cost: [] },
};
export const MAX_UPGRADE = 5;

export const SKINS = [
  { id: 'explorer', name: 'Explorer',  cost: 0,    skin: 0xf1c7a0, tunic: 0x2f7d6d, pants: 0x3b3a4a, accent: 0xffb703, hair: 0x4a2c1a, glow: 0xffb703 },
  { id: 'shadow',   name: 'Shadow',    cost: 400,  skin: 0xd9ad8c, tunic: 0x22222e, pants: 0x14141c, accent: 0xb388ff, hair: 0x111118, glow: 0xb388ff },
  { id: 'ember',    name: 'Ember',     cost: 900,  skin: 0xe6b894, tunic: 0xc2410c, pants: 0x3a1d12, accent: 0xff7b00, hair: 0x7a1f0a, glow: 0xff7b00 },
  { id: 'frost',    name: 'Frost',     cost: 1600, skin: 0xe8d2c0, tunic: 0x2c6e9b, pants: 0x1d2b46, accent: 0x7de2ff, hair: 0xd6f4ff, glow: 0x7de2ff },
  { id: 'emerald',  name: 'Druid',     cost: 2500, skin: 0xc9a07c, tunic: 0x1f6b3a, pants: 0x3b2a1a, accent: 0x7dff6b, hair: 0x2a4a1a, glow: 0x7dff6b },
  { id: 'gold',     name: 'Pharaoh',   cost: 5000, skin: 0xd8a779, tunic: 0xe0a400, pants: 0xf4f1de, accent: 0x00e5ff, hair: 0x0b0b0b, glow: 0xffe066 },
];

// Eight biomes of the living labyrinth, 1.5 km each, blending into one another. Colours drive fog, sky, lights and materials.
// fog/sky colours are deliberately mid-tone (not near-white) so the horizon doesn't glow.
export const BIOMES = [
  { id: 'hedge', name: 'The Sunlit Garden Maze',
    fog: 0xb5d6bf, fogDensity: 0.0105, skyTop: 0x3f94f0, skyBottom: 0xbcdcf2, star: 0,
    ambient: 0xdceaff, ground: 0x9db386, ambientI: 0.95, sun: 0xffeccb, sunI: 2.3, torch: 0xffa93a, accent: 0xff9f1c,
    wall: 'hedge', floor: 'cobble', trim: 0x7fa174, mode: [-0.5, 2.4, 0xb6d84a] },
  { id: 'blossom', name: 'The Cherry Blossom Gardens',
    fog: 0xe8c8d6, fogDensity: 0.0105, skyTop: 0x5aa0f0, skyBottom: 0xf6d9e6, star: 0,
    ambient: 0xffeaf2, ground: 0xc3a0ae, ambientI: 0.95, sun: 0xffe4d2, sunI: 2.3, torch: 0xffa0c0, accent: 0xff6fa5,
    wall: 'blossom', floor: 'pinkpath', trim: 0xb08a8f, mode: [-0.4, 2.8, 0xffb7d1] },
  { id: 'stone', name: 'The Golden Ruins',
    fog: 0xe4cdb0, fogDensity: 0.0115, skyTop: 0x4f9cf4, skyBottom: 0xf0d6b4, star: 0,
    ambient: 0xfff0e0, ground: 0xb89c7c, ambientI: 0.95, sun: 0xffdea8, sunI: 2.3, torch: 0xff9a3c, accent: 0xff7b54,
    wall: 'stone', floor: 'flag', trim: 0xa8937a, mode: [0.12, 1.4, 0xffe3a6] },
  { id: 'autumn', name: 'The Autumn Orchard',
    fog: 0xe6c3a0, fogDensity: 0.011, skyTop: 0x5a9ae6, skyBottom: 0xf3d2a8, star: 0,
    ambient: 0xffe9d2, ground: 0xb08a62, ambientI: 0.95, sun: 0xffd9a0, sunI: 2.3, torch: 0xff8a2a, accent: 0xff8a2a,
    wall: 'autumn', floor: 'leaflitter', trim: 0x9a6a3e, mode: [-0.6, 2.6, 0xff9a3a] },
  { id: 'hollow', name: 'The Hollow Realm',
    fog: 0x3a1224, fogDensity: 0.0165, skyTop: 0x12041a, skyBottom: 0x6a1c2c, star: 0,
    ambient: 0x8a6a9a, ground: 0x3a2030, ambientI: 0.62, sun: 0xff7a5a, sunI: 0.95, torch: 0xff2a3a, accent: 0xff2a3a,
    wall: 'veined', floor: 'ash', trim: 0x3a2030, mode: [0.28, 2.3, 0xff7a6a], storm: true },
  { id: 'crystal', name: 'The Frozen Crystal Gardens',
    fog: 0xbadcec, fogDensity: 0.0115, skyTop: 0x2f86e6, skyBottom: 0xcdeaf8, star: 0,
    ambient: 0xdceeff, ground: 0x93b3c4, ambientI: 1.0, sun: 0xeaf6ff, sunI: 2.1, torch: 0x2ec8ff, accent: 0x18b8e0,
    wall: 'crystal', floor: 'slate', trim: 0x74a0b8, mode: [-0.35, 1.8, 0xffffff] },
  { id: 'jungle', name: 'The Overgrown Temple',
    fog: 0xb4d4b0, fogDensity: 0.0125, skyTop: 0x3a96c8, skyBottom: 0xc6e6cf, star: 0,
    ambient: 0xe0f2dc, ground: 0x7a9468, ambientI: 0.9, sun: 0xfff0c0, sunI: 2.2, torch: 0x7dff6a, accent: 0x3fd18a,
    wall: 'mossy', floor: 'mossflag', trim: 0x6a8a62, mode: [0.1, 1.8, 0xd8ff7a] },
  { id: 'lava', name: 'The Ember Canyon',
    fog: 0xe6bfa4, fogDensity: 0.0115, skyTop: 0xf0803e, skyBottom: 0xf6d2ac, star: 0,
    ambient: 0xffeadb, ground: 0xb98a6c, ambientI: 0.92, sun: 0xffcb98, sunI: 2.3, torch: 0xff5a1f, accent: 0xff6a1a,
    wall: 'basalt', floor: 'ember', trim: 0xb07a58, mode: [0.55, 1.6, 0xff7a2a] },
  { id: 'coral', name: 'The Sunken Coral Palace',
    fog: 0xa9dcdc, fogDensity: 0.0125, skyTop: 0x1f9ccc, skyBottom: 0xb8ece6, star: 0,
    ambient: 0xd8f6f4, ground: 0x7fb4b0, ambientI: 1.0, sun: 0xeaffff, sunI: 2.1, torch: 0xff8aa8, accent: 0xff6f8f,
    wall: 'coral', floor: 'pearl', trim: 0xc09a86, mode: [0.5, 2.0, 0xffffff] },
];

export const MISSION_TEMPLATES = [
  { id: 'dist',   text: (n) => `Run ${n} metres in a single run`,       key: 'distance', goals: [800, 1500, 2500, 4000, 6000], single: true },
  { id: 'coins',  text: (n) => `Collect ${n} coins in a single run`,    key: 'coins',    goals: [40, 80, 140, 220, 320], single: true },
  { id: 'jumps',  text: (n) => `Jump ${n} times`,                       key: 'jumps',    goals: [30, 60, 120, 200, 320] },
  { id: 'rolls',  text: (n) => `Roll ${n} times`,                       key: 'rolls',    goals: [30, 60, 120, 200, 320] },
  { id: 'power',  text: (n) => `Collect ${n} power-ups`,                key: 'powerups', goals: [4, 8, 14, 22, 32] },
  { id: 'score',  text: (n) => `Score ${n.toLocaleString()} in a single run`, key: 'score', goals: [8000, 20000, 45000, 90000, 160000], single: true },
  { id: 'lanes',  text: (n) => `Switch lanes ${n} times`,               key: 'lanes',    goals: [60, 120, 220, 360, 560] },
  { id: 'climb',  text: (n) => `Climb onto ${n} stone slabs`,           key: 'climbs',   goals: [4, 8, 14, 22, 32] },
];
export const MAX_MULTIPLIER = 10;

// ---- Co-op (two-player) team missions. Progress = your stat + your buddy's stat. key = field of the stats each phone shares.
export const COOP_MISSIONS = [          // versus: the first player to reach each goal claims it
  { id: 'coins', key: 'c', text: (n) => `First to collect ${n} coins`, goals: [80, 140, 220] },
  { id: 'dist', key: 'd', text: (n) => `First to run ${n.toLocaleString()} m`, goals: [1200, 2200, 3600] },
  { id: 'jumps', key: 'j', text: (n) => `First to jump ${n} times`, goals: [25, 45, 70] },
  { id: 'rolls', key: 'r', text: (n) => `First to roll ${n} times`, goals: [15, 28, 45] },
  { id: 'boulders', key: 'b', text: (n) => `First to dodge ${n} boulders`, goals: [1, 2, 3] },
  { id: 'power', key: 'p', text: (n) => `First to grab ${n} power-ups`, goals: [3, 5, 8] },
  { id: 'score', key: 'sc', text: (n) => `First to score ${n.toLocaleString()}`, goals: [6000, 12000, 25000] },
];
export const COOP_REWARD = 120, COOP_ALL_BONUS = 250;   // per mission claimed / for winning the match
export const CAR = { score: 25000, repeat: 60000, time: 60, speedMul: 1.3, nitroMul: 1.45, nitroTime: 2, nitroCooldown: 5, steer: 12, halfWidth: 0.95, height: 1.4, bonusCoins: 100 };
