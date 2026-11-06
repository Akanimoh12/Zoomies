/* Pixel sprites drawn once into offscreen canvases. Browser only. */

type Pal = Record<string, string>;
function sprite(rows: string[], pal: Pal, p: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = rows[0].length * p;
  c.height = rows.length * p;
  const g = c.getContext('2d')!;
  rows.forEach((r, y) =>
    [...r].forEach((ch, x) => {
      if (pal[ch]) {
        g.fillStyle = pal[ch];
        g.fillRect(x * p, y * p, p, p);
      }
    }),
  );
  return c;
}

const DOG_PAL: Pal = { B: '#7A4A22', T: '#D9A066', K: '#141A2E', G: '#F2B53A', W: '#F5EFE0', L: '#B07A44', R: '#E8735A' };
const DOG_BODY = [
  '...........B....',
  '...........BB...',
  '..........TTTTT.',
  '..........TTTKTT',
  'T.........TTTTTB',
  'TT........TTTTR.',
  '.TTTTTTTTGGG....',
  '.TTTTTTTTTWW....',
  '..TTTTTTTTWW....',
  '..TTTTTTTTT.....',
];
const LEGS_A = ['..L.L...L.L.....', '.L..L....L.L....'];
const LEGS_B = ['...LL....LL.....', '...LL....LL.....'];
const LEGS_J = ['..LL.....LL.....', '................'];
const SLIDE = [
  '............B...',
  '...........TTTT.',
  'T..........TTKTT',
  'TTTTTTTTTTGGTTTB',
  '.TTTTTTTTTWWTT..',
  '.TTTTTTTTTTT....',
  'LL..........LL..',
];

function dogSet(pal: Pal) {
  return {
    run1: sprite([...DOG_BODY, ...LEGS_A], pal, 5),
    run2: sprite([...DOG_BODY, ...LEGS_B], pal, 5),
    jump: sprite([...DOG_BODY, ...LEGS_J], pal, 5),
    slide: sprite(SLIDE, pal, 5),
  };
}

const TREE = ['....XX....', '....XX....', '...XXXX...', '...XXXX...', '...XXXX...', '..XXXXXX..', '..XXXXXX..', '..XXXXXX..', '.XXXXXXXX.', '.XXXXXXXX.', '.XXXXXXXX.', 'XXXXXXXXXX', 'XXXXXXXXXX', 'XXXXXXXXXX', '....XX....', '....XX....'];

function build() {
  return {
    dog: dogSet(DOG_PAL),
    hydrant: sprite(['..RR..', '.RRRR.', 'DRHRRD', '.RHRR.', '.RHRR.', '.RRRR.', '.RRRR.', 'DDDDDD'], { R: '#D6453D', D: '#9E2F2A', H: '#F08A7E' }, 5),
    cone: sprite(['...O...', '..OOO..', '..WWW..', '.OOOOO.', '.OOOOO.', '.WWWWW.', 'OOOOOOO', 'OOOOOOO', 'DDDDDDD'], { O: '#FF7A2F', W: '#F5EFE0', D: '#7A3A1A' }, 4),
    trash: sprite(
      ['...HHH...', '.LLLLLLL.', 'LLLLLLLLL', '.GGGGGGG.', '.GDGGDGG.', '.GDGGDGG.', '.GDGGDGG.', '.GDGGDGG.', '.GDGGDGG.', '.GDGGDGG.', '.GDGGDGG.', '.GGGGGGG.', '..GGGGG..', '..K...K..'],
      { L: '#9AA6C2', H: '#5F6B85', G: '#6E7A96', D: '#4E5873', K: '#2A3148' },
      4,
    ),
    bench: sprite(
      ['BBBBBBBBBBBBBBBBBBBBBBBB', 'LLLLLLLLLLLLLLLLLLLLLLLL', '........................', 'BBBBBBBBBBBBBBBBBBBBBBBB', 'LLLLLLLLLLLLLLLLLLLLLLLL', '.II..................II.', '.II..................II.', '.II..................II.'],
      { B: '#C98A4B', L: '#8A5A2E', I: '#3A4256' },
      4,
    ),
    crate: sprite(['DDDDDDDDDDDD', 'DLLLLDDLLLLD', 'DLDLLDDLLDLD', 'DDDDDDDDDDDD', 'DLLLLDDLLLLD', 'DLLDLDDLDLLD', 'DDDDDDDDDDDD'], { L: '#B07A44', D: '#7A4A22' }, 5),
    skate: sprite(['.RRRRRRRRRRR.', 'RRYYRRRRRYYRR', '.DDDDDDDDDDD.', '..K.......K..', '.KKK.....KKK.'], { R: '#4A7FC1', Y: '#F2B53A', D: '#2A3F6A', K: '#141A2E' }, 4),
    pigeon1: sprite(['......D...', '.....DD...', '.KGGGGGGG.', 'OGGGGGGGGG', '...GGGGG..', '..........'], { G: '#9AA6C8', D: '#6F7BA0', K: '#141A2E', O: '#F2B53A' }, 4),
    pigeon2: sprite(['..........', '..........', '.KGGGGGGG.', 'OGGGGGGGGG', '...GGGGD..', '....DD....'], { G: '#9AA6C8', D: '#6F7BA0', K: '#141A2E', O: '#F2B53A' }, 4),
    bone: sprite(['GG....GG', 'GGGGGGGG', '.GGGGGG.', 'GGGGGGGG', 'GG....GG'], { G: '#F2B53A' }, 3),
    treeFar: sprite(TREE, { X: '#2A1F4E' }, 6),
    treeNear: sprite(TREE, { X: '#22183F' }, 6),
  };
}

export type Sprites = ReturnType<typeof build>;
let cache: Sprites | null = null;
export const getSprites = (): Sprites => (cache ??= build());
