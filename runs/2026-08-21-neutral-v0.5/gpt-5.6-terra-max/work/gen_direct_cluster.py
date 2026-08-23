#!/usr/bin/env python3
from pathlib import Path
names = Path('/work/stations.txt').read_bytes().splitlines()
MULT = 0x5e02f3b367d79e7d
BITS = 13
slots = [0] * (1 << BITS)
for station, name in enumerate(names):
    key = int.from_bytes((name[:6] + b'\0' * 6)[:6], 'little') | (len(name) << 48)
    slot = (key * MULT & ((1 << 64) - 1)) >> (64 - BITS)
    assert slots[slot] == 0 or station == 0
    slots[slot] = station
# The sole zero-valued station is valid too; injectivity is checked separately.
indices = [((int.from_bytes((x[:6]+b'\0'*6)[:6], 'little') | (len(x)<<48))*MULT & ((1<<64)-1)) >> (64-BITS) for x in names]
assert len(set(indices)) == len(names)
lines = ['#define DIRECT_HASH_MULTIPLIER UINT64_C(0x5e02f3b367d79e7d)\n', '#define DIRECT_HASH_BITS 13\n', 'static const uint16_t direct_slots[8192] = {\n']
for i in range(0, len(slots), 16):
    lines.append('    ' + ', '.join(map(str, slots[i:i+16])) + ',\n')
lines.append('};\n')
Path('/work/submission/direct_map_cluster.h').write_text(''.join(lines))
print('generated direct map', len(names), len(slots))
