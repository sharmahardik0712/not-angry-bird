"""World 1 layouts, compact and tall so each fortress fills the screen.

Run from the project root:  python scripts/levels_w1.py   (then: npm run solve -- --calibrate)
Coordinates are block centers in px. Ground top is y=620.
"""
import json
import os

G = 620
R = {'coin': 11.2, 'gem': 12.8, 'cash': 13.44, 'idol': 19.2}


def blk(t, x, y, w, h, **k):
    return dict(type=t, x=x, y=y, w=w, h=h, **k)


def on_ground(t, x, w, h, **k):
    return blk(t, x, G - h / 2, w, h, **k)


def loot(t, x, top, v, bonus=False):
    d = dict(type=t, x=x, y=round(top - R[t] - 0.5, 2), value=v)
    if bonus:
        d['bonus'] = True
    return d


def level(n, name, thieves, required, style, blocks, loots, hint, score=1000):
    return dict(id=f'w1-{n:02d}', name=name, world=1, width=1300, gravity=1.0, slingshot=dict(x=150, y=500),
                thieves=thieves, goal=dict(type='loot', required=required),
                stars=dict(score=score, style=style), blocks=blocks, loot=loots, hint=hint)


L = []

# 1. Opening Hours: two-storey wood house plus a crate stack. Teaches the fling.
L.append(level(1, 'Opening Hours', ['bouncer', 'bouncer', 'bouncer'], 300, dict(type='max_thieves', value=1), [
    on_ground('wood', 700, 24, 120), on_ground('wood', 860, 24, 120), blk('wood', 780, 488, 200, 24),
    blk('wood', 716, 426, 24, 100), blk('wood', 844, 426, 24, 100), blk('wood', 780, 364, 200, 24),
    on_ground('wood', 990, 56, 56), blk('wood', 990, 536, 56, 56), blk('wood', 990, 480, 56, 56),
], [
    loot('cash', 780, G, 200), loot('coin', 780, 476, 100), loot('coin', 780, 352, 100), loot('coin', 990, 452, 100),
], 'Drag back and let go. Knock the loot down to the street.'))

# 2. Over the Wall: steel wall, loot right behind it. Teaches the Bouncer's redirect.
L.append(level(2, 'Over the Wall', ['bouncer', 'bouncer'], 400, dict(type='bonus_loot'), [
    blk('steel', 560, 460, 40, 320),
    on_ground('wood', 660, 56, 56), on_ground('wood', 716, 56, 56), blk('wood', 688, 536, 56, 56),
    on_ground('wood', 840, 24, 120), on_ground('wood', 980, 24, 120), blk('wood', 910, 488, 180, 24),
    blk('wood', 910, 446, 60, 60),
], [
    loot('gem', 688, 508, 250, True), loot('cash', 910, G, 200), loot('coin', 910, 416, 100),
], 'Tap mid-air to send the Bouncer toward your finger.'))

# 3. Hard Stone: stone bunker. Teaches the Bomber.
L.append(level(3, 'Hard Stone', ['bomber', 'bomber', 'bouncer'], 400, dict(type='max_thieves', value=2), [
    on_ground('stone', 700, 40, 140), on_ground('stone', 880, 40, 140), blk('stone', 790, 458, 240, 44),
    blk('wood', 790, 406, 60, 60),
    on_ground('wood', 1000, 24, 120), on_ground('wood', 1100, 24, 120), blk('wood', 1050, 488, 140, 24),
    blk('stone', 1050, 446, 60, 60),
], [
    loot('cash', 790, G, 300), loot('coin', 750, G, 100), loot('coin', 1050, 416, 100),
], 'Stone shrugs off hits. Tap to drop a bomb on it.'))

# 4. Powder Keg: three-storey tower over TNT. Teaches chain reactions.
L.append(level(4, 'Powder Keg', ['bouncer', 'bomber'], 450, dict(type='combo', value=3), [
    on_ground('tnt', 640, 44, 44),
    on_ground('wood', 720, 24, 120), on_ground('wood', 900, 24, 120), blk('wood', 810, 488, 220, 24),
    on_ground('tnt', 810, 44, 44),
    blk('wood', 720, 416, 24, 120), blk('wood', 900, 416, 24, 120), blk('wood', 810, 344, 220, 24),
    blk('wood', 732, 277, 24, 110), blk('wood', 888, 277, 24, 110), blk('wood', 810, 210, 200, 24),
], [
    loot('cash', 810, 476, 200), loot('gem', 810, 332, 250), loot('idol', 810, 198, 500, True),
], 'Wood is weak. What happens if the TNT goes?'))

# 5. Spread the Love: three stacks. Teaches the Splitter.
L.append(level(5, 'Spread the Love', ['splitter', 'splitter', 'bouncer'], 450, dict(type='max_thieves', value=1), [
    on_ground('wood', 640, 56, 56), blk('wood', 640, 536, 56, 56),
    on_ground('wood', 820, 56, 56), blk('wood', 820, 536, 56, 56), blk('wood', 820, 480, 56, 56), blk('wood', 820, 424, 56, 56),
    on_ground('wood', 1000, 56, 56), blk('wood', 1000, 536, 56, 56), blk('wood', 1000, 480, 56, 56),
    on_ground('stone', 1100, 44, 88),
], [
    loot('coin', 640, 508, 150), loot('coin', 820, 396, 150), loot('coin', 1000, 452, 150), loot('cash', 1100, 532, 200),
], 'Tap and the Splitter becomes three.'))

# 6. Pull Job: coins on a covered shelf plus a vault. Teaches the Magnet.
L.append(level(6, 'Pull Job', ['magnet', 'magnet', 'bomber'], 500, dict(type='bonus_loot'), [
    blk('steel', 760, 330, 280, 20), blk('steel', 760, 230, 280, 20),
    blk('glass', 632, 280, 16, 80),
    on_ground('steel', 960, 20, 110), on_ground('steel', 1080, 20, 110), blk('vault', 1020, 495, 140, 30),
], [
    loot('coin', 680, 320, 100), loot('coin', 730, 320, 100), loot('coin', 780, 320, 100), loot('coin', 830, 320, 100), loot('coin', 880, 320, 100),
    loot('idol', 1020, G, 500, True),
], 'Tap to make the Magnet hover and pull. Vaults need a bomb.'))

out = os.path.join(os.path.dirname(__file__), '..', 'src', 'levels', 'world1')
for lv in L:
    with open(os.path.join(out, lv['id'].split('-')[1] + '.json'), 'w') as f:
        f.write(json.dumps(lv, indent=2) + '\n')
print('wrote', len(L), 'levels')
