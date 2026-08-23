#!/usr/bin/env python3
from pathlib import Path
import sys

mode = sys.argv[1] if len(sys.argv) > 1 else 'crc'
target = Path(sys.argv[2]) if len(sys.argv) > 2 else Path('/work/submission/stations.h')
if mode not in ('crc', 'xor'):
    raise SystemExit('usage: gen_mph.py [crc|xor] [header-path]')

names = Path('/work/stations.txt').read_bytes().splitlines()
assert len(names) == 413
assert names == sorted(names)

# CRC32C as implemented by Intel's CRC32 instruction, initial accumulator 0.
table = []
for i in range(256):
    c = i
    for _ in range(8):
        c = (c >> 1) ^ (0x82F63B78 if c & 1 else 0)
    table.append(c)

def crc32c64(x):
    c = 0
    for b in x.to_bytes(8, 'little'):
        c = table[(c ^ b) & 255] ^ (c >> 8)
    return c

def prefix_key(s):
    # First six bytes plus byte length uniquely identify the canonical cities.
    return int.from_bytes((s[:6] + b'\0' * 6)[:6], 'little') | (len(s) << 48)

def station_hash(key):
    if mode == 'crc':
        return crc32c64(key)
    key ^= key >> 26
    key ^= key >> 19
    return key & 0xffffffff

keys = [prefix_key(s) for s in names]
assert len(set(keys)) == len(keys)

# A compact displacement perfect hash: one CRC32C and two L1-resident lookups.
B, S, SHIFT = 128, 512, 7
groups = [[] for _ in range(B)]
for i, key in enumerate(keys):
    h = station_hash(key)
    groups[h & (B - 1)].append((i, h))
g = [0] * B
slots = [None] * S
used = [False] * S
for bucket, group in sorted(enumerate(groups), key=lambda z: -len(z[1])):
    if len(group) <= 1:
        continue
    bases = [(h >> SHIFT) & (S - 1) for _, h in group]
    for d in range(S):
        targets = [(base + d) & (S - 1) for base in bases]
        if len(set(targets)) == len(targets) and not any(used[x] for x in targets):
            g[bucket] = d
            for slot_index, (station, _) in zip(targets, group):
                used[slot_index] = True
                slots[slot_index] = station
            break
    else:
        raise RuntimeError(f'cannot place bucket {bucket}')
free = iter(i for i, val in enumerate(used) if not val)
for bucket, group in enumerate(groups):
    if len(group) == 1:
        station, h = group[0]
        slot_index = next(free)
        g[bucket] = (slot_index - ((h >> SHIFT) & (S - 1))) & (S - 1)
        used[slot_index] = True
        slots[slot_index] = station

for i, key in enumerate(keys):
    h = station_hash(key)
    assert slots[((h >> SHIFT) + g[h & (B - 1)]) & (S - 1)] == i


def c_array(type_name, name, values, width=12):
    lines = []
    for i in range(0, len(values), width):
        lines.append('    ' + ', '.join(str(x) for x in values[i:i+width]) + ',')
    return f'static const {type_name} {name}[{len(values)}] = {{\n' + '\n'.join(lines) + '\n};\n'

def c_bytes(s):
    # Octal escapes are unambiguous even when followed by a digit.
    return '"' + ''.join(chr(b) if 32 <= b <= 126 and b not in (34, 92) else f'\\{b:03o}' for b in s) + '"'

out = []
out.append('/* Generated from the fixed canonical 1BRC station list. */\n')
out.append('#define STATION_COUNT 413\n')
out.append('#define MPH_BUCKETS 128\n#define MPH_SLOT_COUNT 512\n#define MPH_SHIFT 7\n')
out.append(c_array('uint16_t', 'mph_g', g))
out.append(c_array('uint16_t', 'mph_slots', [x if x is not None else 0 for x in slots]))
out.append(c_array('uint64_t', 'prefix_masks', [0, 0xff, 0xffff, 0xffffff, 0xffffffff, 0xffffffffff, 0xffffffffffff, 0xffffffffffff]))
out.append(c_array('uint8_t', 'station_name_lens', [len(s) for s in names]))
out.append('static const char *const station_names[STATION_COUNT] = {\n')
for name in names:
    out.append('    ' + c_bytes(name) + ',\n')
out.append('};\n')
target.write_text(''.join(out))
print('generated', mode, len(names), 'stations; max displacement', max(g), 'occupied slots', sum(used))
