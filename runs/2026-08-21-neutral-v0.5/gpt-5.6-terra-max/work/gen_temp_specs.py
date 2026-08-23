#!/usr/bin/env python3
from pathlib import Path
values = [0] * 256
for a in range(10):
    values[a | (14 << 4)] = 1024 | (a * 10)
    for b in range(10):
        values[a | (b << 4)] = a * 100 + b * 10
lines = ['static const uint16_t temperature_specs[256] = {\n']
for i in range(0, 256, 16):
    lines.append('    ' + ', '.join(map(str, values[i:i+16])) + ',\n')
lines.append('};\n')
Path('/work/submission/temp_specs.h').write_text(''.join(lines))
