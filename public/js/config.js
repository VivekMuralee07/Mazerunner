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

// Four sunlit biomes of the living labyrinth. Colours drive fog, sky, lights and materials.
export const BIOMES = [
  {
    id: 'hedge', name: 'The Sunlit Garden Maze',
    fog: 0xd3ecd9, fogDensity: 0.0105, skyTop: 0x4aa3ff, skyBottom: 0xe3f5ff, star: 0,
    ambient: 0xe6f4ff, ground: 0xb8c79a, ambientI: 1.35, sun: 0xfff0cc, sunI: 2.7, torch: 0xffa93a, accent: 0xff9f1c,
    wall: 'hedge', floor: 'cobble', trim: 0x8fb083,
  },
  {
    id: 'stone', name: 'The Golden Ruins',
    fog: 0xf3e2cf, fogDensity: 0.0115, skyTop: 0x5fa8ff, skyBottom: 0xffeed6, star: 0,
    ambient: 0xfff1e2, ground: 0xcfb597, ambientI: 1.35, sun: 0xffe3b0, sunI: 2.7, torch: 0xff9a3c, accent: 0xff7b54,
    wall: 'stone', floor: 'flag', trim: 0xb9a58c,
  },
  {
    id: 'crystal', name: 'The Frozen Crystal Gardens',
    fog: 0xd2edf9, fogDensity: 0.0115, skyTop: 0x3d98ee, skyBottom: 0xe9faff, star: 0,
    ambient: 0xe2f4ff, ground: 0xa9c9d8, ambientI: 1.4, sun: 0xf2fbff, sunI: 2.5, torch: 0x2ec8ff, accent: 0x18b8e0,
    wall: 'crystal', floor: 'slate', trim: 0x86b6cc,
  },
  {
    id: 'lava', name: 'The Ember Canyon',
    fog: 0xf8d9c1, fogDensity: 0.0115, skyTop: 0xff8e4a, skyBottom: 0xffe6c4, star: 0,
    ambient: 0xfff0e4, ground: 0xd3a789, ambientI: 1.3, sun: 0xffd3a1, sunI: 2.6, torch: 0xff5a1f, accent: 0xff6a1a,
    wall: 'basalt', floor: 'ember', trim: 0xc28a68,
  },
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
