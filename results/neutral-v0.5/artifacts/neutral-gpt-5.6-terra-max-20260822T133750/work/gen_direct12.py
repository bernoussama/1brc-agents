#!/usr/bin/env python3
from pathlib import Path
names = Path('/work/stations.txt').read_bytes().splitlines()
MULT = 0x9924e25d2b2bfdf3
SENTINEL = 65535
slots = [[] for _ in range(4096)]
for station, name in enumerate(names):
    key = int.from_bytes((name[:6] + b'\0' * 6)[:6], 'little') | (len(name) << 48)
    slots[((key * MULT) & ((1 << 64) - 1)) >> 52].append((station, name))
special = [0] * 256
outslots = []
for group in slots:
    if len(group) == 1:
        outslots.append(group[0][0])
    elif not group:
        outslots.append(0)
    else:
        outslots.append(SENTINEL)
        for station, name in group:
            first = name[0]
            assert special[first] == 0 or station == 0
            special[first] = station
assert sum(x == SENTINEL for x in outslots) == 3
lines = ['#define DIRECT12_HASH_MULTIPLIER UINT64_C(0x9924e25d2b2bfdf3)\n', '#define DIRECT12_SENTINEL 65535u\n', 'static const uint16_t direct12_slots[4096] = {\n']
for i in range(0, len(outslots), 16):
    lines.append('    ' + ', '.join(map(str, outslots[i:i+16])) + ',\n')
lines.append('};\nstatic const uint16_t direct12_special_by_first[256] = {\n')
for i in range(0, len(special), 16):
    lines.append('    ' + ', '.join(map(str, special[i:i+16])) + ',\n')
lines.append('};\n')
Path('/work/submission/direct12_map.h').write_text(''.join(lines))
print('generated direct12', sum(len(x)>1 for x in slots), sum(len(x) for x in slots if len(x)>1))
