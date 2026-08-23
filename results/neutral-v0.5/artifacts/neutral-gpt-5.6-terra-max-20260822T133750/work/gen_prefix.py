#!/usr/bin/env python3
from pathlib import Path
names = Path('/work/stations.txt').read_bytes().splitlines()
MULT = 0x84a1feae4d3e8219
SENTINEL = 65535
groups = {}
for station, name in enumerate(names):
    key = int.from_bytes((name[:6] + b'\0' * 6)[:6], 'little')
    groups.setdefault(key, []).append((station, name))
slots = [0] * 8192
for key, group in groups.items():
    slot = ((key * MULT) & ((1 << 64) - 1)) >> 51
    assert slots[slot] == 0
    slots[slot] = group[0][0] if len(group) == 1 else SENTINEL
assert sum(v == SENTINEL for v in slots) == 2
for key, group in groups.items():
    slot = ((key * MULT) & ((1 << 64) - 1)) >> 51
    assert slots[slot] == (group[0][0] if len(group) == 1 else SENTINEL)
lines = ['#define PREFIX_HASH_MULTIPLIER UINT64_C(0x84a1feae4d3e8219)\n', '#define PREFIX_SENTINEL 65535u\n', 'static const uint16_t prefix_slots[8192] = {\n']
for i in range(0, len(slots), 16):
    lines.append('    ' + ', '.join(map(str, slots[i:i+16])) + ',\n')
lines.append('};\n')
Path('/work/submission/prefix_map.h').write_text(''.join(lines))
print('generated prefix map', len(groups), 'unique prefixes', [v for v in groups.values() if len(v)>1])
