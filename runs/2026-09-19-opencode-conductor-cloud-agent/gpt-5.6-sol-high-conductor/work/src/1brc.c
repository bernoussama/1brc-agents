// 1BRC Round A v2: mmap + pthreads, per-thread compact hash tables.
// Input: lines "name;temp" (temp with one fractional digit, [-99.9, 99.9]).
// Output: {name=min/mean/max, ...} sorted bytewise, half-away-from-zero mean.
#define _GNU_SOURCE
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include <fcntl.h>
#include <unistd.h>
#include <sys/mman.h>
#include <sys/stat.h>
#include <pthread.h>
#include <math.h>
#include <immintrin.h>

#ifndef CAP_BITS
#define CAP_BITS 12
#endif

#ifndef ARENA_INIT
#define ARENA_INIT (1u << 16)   // fits all 413 canonical names
#endif

typedef struct {
    const uint8_t *name;  // NULL == empty slot
    uint32_t len;
    uint64_t key;         // first <=8 bytes, zero padded
    int16_t mn, mx;
    int64_t sum;
    uint32_t cnt;
} Entry;

typedef struct {
    uint32_t cap;    // power of two
    uint32_t used;
    Entry *e;
    uint8_t *arena;  // copies of names (hot cache), grows
    uint32_t arena_used, arena_cap;
} Table;

static uint64_t g_hash_mul = 0x9E3779B97F4A7C15ULL;

static inline uint64_t load_key(const uint8_t *p, uint32_t n) {
    uint64_t k = 0;
    if (n >= 8) memcpy(&k, p, 8);
    else memcpy(&k, p, n);
    return k;
}

// Exact name-tail comparator. The caller has already established that `key`
// (first min(len,8) bytes) matches, so bytes [0,min(len,8)) are equal and need
// no recheck. Never reads outside [a, a+len) / [b, b+len): stored arena names
// hold exactly len bytes and input names end at the ';'.
static inline __attribute__((always_inline))
int name_tail_eq(const uint8_t *a, const uint8_t *b, uint32_t len) {
    if (len <= 8) return 1;              // whole name covered by key
    if (len >= 16) {
        uint64_t x, y;
        memcpy(&x, a + 8, 8);            // bytes 8..15, in-bounds both sides
        memcpy(&y, b + 8, 8);
        if (x != y) return 0;
        if (len == 16) return 1;
        return memcmp(a + 16, b + 16, len - 16) == 0;
    }
    // 9 <= len <= 15: one 8-byte window ending at the name end. It overlaps the
    // key-covered prefix (start = len-8 <= 7), which is already equal, so
    // equality is exact for the uncovored bytes [8, len) and both loads stay
    // inside [0, len). This avoids a variable-length memcpy/memcmp call.
    uint64_t x, y;
    memcpy(&x, a + len - 8, 8);
    memcpy(&y, b + len - 8, 8);
    return x == y;
}

// Find ';' and load the name key from the same 16-byte vector when possible.
// The 16-byte SSE load is only done when at least 16 bytes remain in
// [p,end), so it can never touch memory past the mapped end (end == base+size).
static inline const uint8_t *find_semi(const uint8_t *p, const uint8_t *end, uint64_t *key) {
    if ((size_t)(end - p) >= 16) {
        __m128i v = _mm_loadu_si128((const __m128i *)p);
        unsigned m = (unsigned)_mm_movemask_epi8(_mm_cmpeq_epi8(v, _mm_set1_epi8(';')));
        if (m) {
            uint32_t idx = (uint32_t)__builtin_ctz(m);
            uint64_t k = (uint64_t)_mm_cvtsi128_si64(v);
            if (idx < 8) k &= (1ULL << (idx * 8)) - 1ULL;
            *key = k;
            return p + idx;
        }
    }
    const uint8_t *s = (const uint8_t *)memchr(p, ';', (size_t)(end - p));
    if (!s) return NULL;
    *key = load_key(p, (uint32_t)(s - p));
    return s;
}

static void table_grow_entries(Table *t);

static inline Entry *table_slot(Table *t, const uint8_t *name, uint32_t len,
                                uint64_t key, uint64_t h) {
    uint32_t mask = t->cap - 1;
    uint32_t i = (uint32_t)(h >> (64 - CAP_BITS)) & mask;
    for (;;) {
        Entry *e = &t->e[i];
        const uint8_t *en = e->name;
        if (!en) return e;
        if (e->len == len && e->key == key && name_tail_eq(en, name, len))
            return e;
        i = (i + 1) & mask;
    }
}

// Ensure `need` more arena bytes. If the arena moves, every Entry name that
// points into the old arena is rebased, so no pointer is left dangling.
// Arenas are preallocated large (65536) so this path is normally never hit
// for the canonical 413 names; it stays correct for arbitrary names.
static void arena_reserve(Table *t, uint32_t need) {
    if (t->arena_used + need <= t->arena_cap) return;
    uint32_t ncap = t->arena_cap ? t->arena_cap : 65536;
    while ((uint64_t)t->arena_used + need > ncap) ncap *= 2;
    uintptr_t od = (uintptr_t)t->arena;
    uint8_t *na = realloc(t->arena, ncap);
    if (!na) { perror("realloc"); exit(1); }
    if ((uintptr_t)na != od) {
        uintptr_t nd = (uintptr_t)na;
        for (uint32_t i = 0; i < t->cap; i++) {
            uintptr_t nm = (uintptr_t)t->e[i].name;
            if (nm >= od && nm < od + t->arena_used)
                t->e[i].name = (const uint8_t *)(nm - od + nd);
        }
    }
    t->arena = na;
    t->arena_cap = ncap;
}

static void table_insert(Table *t, Entry *slot, const uint8_t *name, uint32_t len,
                         uint64_t key, int t10) {
    // Copy name into the per-thread arena for cache-friendly compares.
    arena_reserve(t, len);
    uint8_t *dst = t->arena + t->arena_used;
    memcpy(dst, name, len);
    t->arena_used += len;

    slot->name = dst;
    slot->len = len;
    slot->key = key;
    slot->mn = slot->mx = (int16_t)t10;
    slot->sum = t10;
    slot->cnt = 1;
    t->used++;
    if (t->used * 9 >= t->cap * 4) {  // >44% load
        table_grow_entries(t);
    }
}

static void table_grow_entries(Table *t) {
    uint32_t ncap = t->cap * 2;
    Entry *ne = calloc(ncap, sizeof(Entry));
    if (!ne) { perror("calloc"); exit(1); }
    uint32_t nmask = ncap - 1;
    for (uint32_t i = 0; i < t->cap; i++) {
        Entry *s = &t->e[i];
        if (!s->name) continue;
        uint64_t h = (s->key ^ (uint64_t)s->len) * g_hash_mul;
        uint32_t j = (uint32_t)(h >> (64 - CAP_BITS)) & nmask;
        while (ne[j].name) j = (j + 1) & nmask;
        ne[j] = *s;
    }
    free(t->e);
    t->e = ne;
    t->cap = ncap;
}

typedef struct {
    const uint8_t *start, *end;
    Table *t;
} Job;

static void *worker(void *arg) {
    Job *j = (Job *)arg;
    const uint8_t *p = j->start;
    const uint8_t *end = j->end;
    Table *t = j->t;

    while (p < end) {
        uint64_t key;
        const uint8_t *semi = find_semi(p, end, &key);
        if (!semi) break;
        uint32_t len = (uint32_t)(semi - p);
        uint64_t h = (key ^ (uint64_t)len) * g_hash_mul;

        // parse temperature: [-]ddd.d\n
        const uint8_t *q = semi + 1;
        int neg = (*q == '-');
        q += neg;
        int v = 0;
        while (*q != '.') { v = v * 10 + (*q - '0'); q++; }
        q++;
        int t10 = v * 10 + (*q - '0');
        q++;
        if (neg) t10 = -t10;

        Entry *e = table_slot(t, p, len, key, h);
        if (!e->name) {
            table_insert(t, e, p, len, key, t10);
        } else {
            if (t10 < e->mn) e->mn = (int16_t)t10;
            else if (t10 > e->mx) e->mx = (int16_t)t10;
            e->sum += t10;
            e->cnt++;
        }
        p = q + 1; // skip '\n'
    }
    return NULL;
}

static int cmp_entry(const void *A, const void *B) {
    const Entry *x = (const Entry *)A, *y = (const Entry *)B;
    uint32_t m = x->len < y->len ? x->len : y->len;
    int c = memcmp(x->name, y->name, m);
    if (c) return c;
    return (x->len > y->len) - (x->len < y->len);
}

int main(int argc, char **argv) {
    if (argc < 2) { fprintf(stderr, "usage: %s <file>\n", argv[0]); return 1; }
    int fd = open(argv[1], O_RDONLY);
    if (fd < 0) { perror("open"); return 1; }
    struct stat st;
    if (fstat(fd, &st) != 0) { perror("fstat"); return 1; }
    size_t size = (size_t)st.st_size;
    if (size == 0) { fputs("{}", stdout); return 0; }

    uint8_t *base = mmap(NULL, size, PROT_READ, MAP_PRIVATE, fd, 0);
    if (base == MAP_FAILED) { perror("mmap"); return 1; }

    long ncpu = sysconf(_SC_NPROCESSORS_ONLN);
    int T = 4;
    if (ncpu > 0 && ncpu < T) T = (int)ncpu;
    if (T < 1) T = 1;

    size_t *bounds = malloc(sizeof(size_t) * (T + 1));
    if (!bounds) { perror("malloc"); return 1; }
    bounds[0] = 0;
    for (int i = 1; i < T; i++) {
        size_t approx = (size / (size_t)T) * (size_t)i;
        if (approx == 0) { bounds[i] = 0; continue; }
        const uint8_t *nl = memchr(base + approx, '\n', size - approx);
        bounds[i] = nl ? (size_t)(nl - base) + 1 : size;
    }
    bounds[T] = size;

    Table *tables = calloc((size_t)T, sizeof(Table));
    Job *jobs = calloc((size_t)T, sizeof(Job));
    pthread_t *th = calloc((size_t)T, sizeof(pthread_t));
    if (!tables || !jobs || !th) { perror("calloc"); return 1; }

    for (int i = 0; i < T; i++) {
        tables[i].cap = 1u << CAP_BITS;
        tables[i].e = calloc(tables[i].cap, sizeof(Entry));
        if (!tables[i].e) { perror("calloc"); return 1; }
        tables[i].arena_cap = 1u << 16;   // fits all 413 canonical names
        tables[i].arena = malloc(tables[i].arena_cap);
        if (!tables[i].arena) { perror("malloc"); return 1; }
    }

    for (int i = 0; i < T; i++) {
        jobs[i].start = base + bounds[i];
        jobs[i].end = base + bounds[i + 1];
        jobs[i].t = &tables[i];
    }
    for (int i = 1; i < T; i++) pthread_create(&th[i], NULL, worker, &jobs[i]);
    worker(&jobs[0]);
    for (int i = 1; i < T; i++) pthread_join(th[i], NULL);

    // Merge tables.
    Table merged; memset(&merged, 0, sizeof(merged));
    merged.cap = 1u << CAP_BITS;
    merged.e = calloc(merged.cap, sizeof(Entry));
    if (!merged.e) { perror("calloc"); return 1; }
    merged.arena_cap = 1u << 16;
    merged.arena = malloc(merged.arena_cap);
    if (!merged.arena) { perror("malloc"); return 1; }
    for (int i = 0; i < T; i++) {
        Table *t = &tables[i];
        for (uint32_t k = 0; k < t->cap; k++) {
            Entry *s = &t->e[k];
            if (!s->name) continue;
            uint64_t h = (s->key ^ (uint64_t)s->len) * g_hash_mul;
            Entry *d = table_slot(&merged, s->name, s->len, s->key, h);
            if (!d->name) {
                // Copy name into merged arena (thread arenas stay alive too).
                arena_reserve(&merged, s->len);
                uint8_t *dst = merged.arena + merged.arena_used;
                memcpy(dst, s->name, s->len);
                merged.arena_used += s->len;
                *d = *s;
                d->name = dst;
                merged.used++;
            } else {
                if (s->mn < d->mn) d->mn = s->mn;
                if (s->mx > d->mx) d->mx = s->mx;
                d->sum += s->sum;
                d->cnt += s->cnt;
            }
        }
    }

    Entry *arr = malloc(sizeof(Entry) * (merged.used ? merged.used : 1));
    if (!arr) { perror("malloc"); return 1; }
    uint32_t n = 0;
    for (uint32_t k = 0; k < merged.cap; k++)
        if (merged.e[k].name) arr[n++] = merged.e[k];
    qsort(arr, n, sizeof(Entry), cmp_entry);

    size_t cap = 2;
    for (uint32_t i = 0; i < n; i++) cap += (size_t)arr[i].len + 32;
    char *out = malloc(cap);
    if (!out) { perror("malloc"); return 1; }
    size_t o = 0;
    out[o++] = '{';
    for (uint32_t i = 0; i < n; i++) {
        Entry *e = &arr[i];
        if (i) { out[o++] = ','; out[o++] = ' '; }
        memcpy(out + o, e->name, e->len);
        o += e->len;
        out[o++] = '=';
        int a = e->mn;
        if (a < 0) { out[o++] = '-'; a = -a; }
        if (a >= 100) out[o++] = (char)('0' + (a / 100) % 10);
        out[o++] = (char)('0' + (a / 10) % 10);
        out[o++] = '.';
        out[o++] = (char)('0' + a % 10);
        out[o++] = '/';
        double d = (double)e->sum / (double)e->cnt / 10.0;
        double scaled = d * 10.0;
        double rr = scaled >= 0.0 ? floor(scaled + 0.5) : ceil(scaled - 0.5);
        long long r = (long long)rr;
        if (r == 0) {
            out[o++] = '0'; out[o++] = '.'; out[o++] = '0';
        } else {
            long long b = r < 0 ? -r : r;
            if (r < 0) out[o++] = '-';
            if (b >= 100) out[o++] = (char)('0' + (b / 100) % 10);
            out[o++] = (char)('0' + (b / 10) % 10);
            out[o++] = '.';
            out[o++] = (char)('0' + b % 10);
        }
        out[o++] = '/';
        int m = e->mx;
        if (m < 0) { out[o++] = '-'; m = -m; }
        if (m >= 100) out[o++] = (char)('0' + (m / 100) % 10);
        out[o++] = (char)('0' + (m / 10) % 10);
        out[o++] = '.';
        out[o++] = (char)('0' + m % 10);
    }
    out[o++] = '}';
    if (fwrite(out, 1, o, stdout) != o) { perror("fwrite"); return 1; }
    fflush(stdout);
    return 0;
}