// Fast 1BRC solver: mmap + 6 threads + AVX2 scan + w0-keyed open addressing.
#define _GNU_SOURCE
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include <fcntl.h>
#include <unistd.h>
#include <math.h>
#include <pthread.h>
#include <sys/mman.h>
#include <sys/stat.h>
#include <immintrin.h>

#define NTHREADS 6
#define NBUCKETS 1024          /* power of 2 */
#define MAXENTS 512
#define EMPTY 0xFFFF

typedef struct {
    uint64_t a;       /* first min(len,8) name bytes, zero-masked */
    uint64_t w1;      /* name bytes 8..15 (masked if len<16) */
    int64_t sum;      /* sum of tenths */
    int32_t count;
    int16_t min, max;
    uint16_t len;
    uint16_t pad;
} Ent;

typedef struct {
    uint16_t buckets[NBUCKETS];
    Ent ents[MAXENTS];
    const uint8_t *names[MAXENTS];   /* first-occurrence pointers */
    int nents;
} Table;

static uint64_t m1tab[32];

static void init_masks(void) {
    for (int s = 0; s < 32; s++) {
        uint64_t m1;
        if (s >= 16) m1 = ~0ULL; else if (s > 8) m1 = (1ULL << (8 * (s - 8))) - 1; else m1 = 0;
        m1tab[s] = m1;
    }
}

static inline uint64_t load64(const uint8_t *p) {
    uint64_t v; memcpy(&v, p, 8); return v;
}

static void *worker(void *arg);

typedef struct {
    Table *t;
    const uint8_t *start, *end;
    int tidx;
} Job;

static void *worker(void *arg);

static inline int lexcmp(const uint8_t *a, size_t la, const uint8_t *b, size_t lb) {
    size_t m = la < lb ? la : lb;
    int c = memcmp(a, b, m);
    if (c) return c;
    return (la < lb) ? -1 : (la > lb ? 1 : 0);
}

int main(int argc, char **argv) {
    if (argc < 2) { fprintf(stderr, "usage: %s <file>\n", argv[0]); return 1; }
    init_masks();
    int fd = open(argv[1], O_RDONLY);
    if (fd < 0) { perror("open"); return 1; }
    struct stat st;
    if (fstat(fd, &st) < 0) { perror("fstat"); return 1; }
    size_t size = (size_t)st.st_size;

    /* map file plus guard region of zero pages so 32B loads past EOF are safe */
    size_t guard = 1 << 20;
    uint8_t *base = mmap(NULL, size + guard, PROT_READ, MAP_PRIVATE | MAP_ANONYMOUS, -1, 0);
    if (base == MAP_FAILED) { perror("mmap anon"); return 1; }
    uint8_t *fm = mmap(base, size, PROT_READ, MAP_PRIVATE | MAP_FIXED, fd, 0);
    if (fm != base) { perror("mmap file"); return 1; }
    close(fd);

    /* split into NTHREADS chunks at newline boundaries */
    const uint8_t *starts[NTHREADS + 1];
    starts[0] = base;
    starts[NTHREADS] = base + size;
    size_t per = size / NTHREADS + 1;
    for (int i = 1; i < NTHREADS; i++) {
        const uint8_t *q = base + (size_t)i * per;
        if (q >= base + size) q = base + size - 1;
        const uint8_t *r = memchr(q, '\n', (size_t)(base + size - q));
        starts[i] = r ? r + 1 : base + size;
    }
    for (int i = 1; i < NTHREADS; i++)
        if (starts[i] < starts[i-1]) starts[i] = starts[i-1];

    static Table tables[NTHREADS];
    for (int i = 0; i < NTHREADS; i++) memset(tables[i].buckets, 0xFF, sizeof(tables[i].buckets));

    pthread_t th[NTHREADS];
    Job jobs[NTHREADS];
    for (int i = 0; i < NTHREADS; i++) {
        jobs[i].t = &tables[i];
        jobs[i].start = starts[i];
        jobs[i].end = starts[i + 1];
        jobs[i].tidx = i;
        if (i == 0) continue;
        if (pthread_create(&th[i], NULL, worker, &jobs[i]) != 0) {
            fprintf(stderr, "pthread_create failed\n"); return 1;
        }
    }
    worker(&jobs[0]);
    for (int i = 1; i < NTHREADS; i++) pthread_join(th[i], NULL);

    /* merge into global table */
    Table *g = calloc(1, sizeof(Table));
    memset(g->buckets, 0xFF, sizeof(g->buckets));
    for (int ti = 0; ti < NTHREADS; ti++) {
        Table *t = &tables[ti];
        for (int e = 0; e < t->nents; e++) {
            Ent *E = &t->ents[e];
            int found = -1;
            for (int k = 0; k < g->nents; k++) {
                if (g->ents[k].len == E->len && memcmp(g->names[k], t->names[e], E->len) == 0) { found = k; break; }
            }
            if (found < 0) {
                g->ents[g->nents] = *E;
                g->names[g->nents] = t->names[e];
                found = g->nents++;
            } else {
                Ent *G = &g->ents[found];
                G->sum += E->sum; G->count += E->count;
                if (E->min < G->min) G->min = E->min;
                if (E->max > G->max) G->max = E->max;
            }
        }
    }

    int n = g->nents;
    int *order = malloc(sizeof(int) * n);
    for (int i = 0; i < n; i++) order[i] = i;
    for (int i = 1; i < n; i++) {
        int key = order[i];
        int j = i - 1;
        while (j >= 0 && lexcmp(g->names[order[j]], g->ents[order[j]].len, g->names[key], g->ents[key].len) > 0) {
            order[j + 1] = order[j]; j--;
        }
        order[j + 1] = key;
    }

    /* output — replicates reference.py semantics exactly */
    char *out = malloc(1 << 20);
    size_t outn = 0;
    out[outn++] = '{';
    for (int i = 0; i < n; i++) {
        Ent *E = &g->ents[order[i]];
        const uint8_t *nm = g->names[order[i]];
        if (i) { out[outn++] = ','; out[outn++] = ' '; }
        memcpy(out + outn, nm, E->len); outn += E->len;
        out[outn++] = '=';
        outn += sprintf(out + outn, "%.1f", (double)E->min / 10.0);
        out[outn++] = '/';
        double x = (double)E->sum / (double)E->count / 10.0;
        double scaled = x * 10.0;
        double r = (scaled >= 0.0) ? floor(scaled + 0.5) : ceil(scaled - 0.5);
        double v = r / 10.0;
        char buf[32];
        int L = sprintf(buf, "%.1f", v);
        if (L == 4 && buf[0] == '-' && buf[1] == '0' && buf[2] == '.' && buf[3] == '0') { buf[0] = '0'; }
        memcpy(out + outn, buf, L); outn += L;
        out[outn++] = '/';
        outn += sprintf(out + outn, "%.1f", (double)E->max / 10.0);
    }
    out[outn++] = '}';
    out[outn++] = '\n';
    fwrite(out, 1, outn, stdout);
    return 0;
}

#define QB 8
typedef struct { const uint8_t *p; uint32_t s, nl0; } Ld;

static void *worker(void *arg) {
    Job *J = (Job *)arg;
    Table *t = J->t;
    const uint8_t *p = J->start;
    const uint8_t *end = J->end;
    madvise((void *)J->start, (size_t)(J->end - J->start), MADV_WILLNEED);

    const __m256i vsemi = _mm256_set1_epi8(';');
    const __m256i vnl = _mm256_set1_epi8('\n');
    Ld q[QB];
    uint32_t sm = 0, nm = 0;

    while (p < end) {
        int n = 0;
        while (n < QB && p < end) {
            if (nm == 0) {
                __m256i v = _mm256_loadu_si256((const __m256i *)p);
                sm = (uint32_t)_mm256_movemask_epi8(_mm256_cmpeq_epi8(v, vsemi));
                nm = (uint32_t)_mm256_movemask_epi8(_mm256_cmpeq_epi8(v, vnl));
                if (nm == 0) {
                    /* rare long line: scalar scan */
                    const uint8_t *r = p;
                    while (*r != ';') r++;
                    uint32_t s = (uint32_t)(r - p);
                    while (*r != '\n') r++;
                    q[n].p = p; q[n].s = s; q[n].nl0 = (uint32_t)(r - p);
                    n++;
                    p = r + 1;
                    continue;
                }
            }
            uint32_t nl0 = (uint32_t)__builtin_ctz(nm);
            uint32_t smp = sm & ((1u << nl0) - 1u);
            uint32_t sh = nl0 + 1;
            const uint8_t *lp = p;
            p += sh;
            sm = (uint32_t)((uint64_t)sm >> sh);
            nm = (uint32_t)((uint64_t)nm >> sh);
            if (smp == 0) continue;   /* empty or malformed line */
            q[n].p = lp; q[n].s = (uint32_t)__builtin_ctz(smp); q[n].nl0 = nl0;
            n++;
        }
        for (int i = 0; i < n; i++) {
            const uint8_t *p = q[i].p;
            uint32_t s = q[i].s, nl0 = q[i].nl0;

            /* ---- temperature (end-based, branchless) ---- */
            const uint8_t *q0 = p + s + 1;
            uint32_t neg = (*q0 == '-');
            uint64_t we = load64(p + nl0 - 7);
            uint32_t f  = (uint32_t)(we >> 48) & 0xF;
            uint32_t i1 = (uint32_t)(we >> 32) & 0xF;
            uint32_t c3 = (uint32_t)(we >> 24) & 0xFF;
            uint32_t twod = (uint32_t)(c3 - 0x30) < 10u;
            uint32_t i2 = c3 & 0xF;
            int32_t ip = (int32_t)(i1 + twod * (10u * i2));
            int32_t t10 = ip * 10 + (int32_t)f;
            t10 = (t10 ^ -(int32_t)neg) + (int32_t)neg;

            /* ---- key ---- */
            uint64_t a = _bzhi_u64(load64(p), (uint64_t)s * 8);
            uint64_t w1 = load64(p + 8) & m1tab[s < 16 ? s : 16];
            uint32_t bkt = (uint32_t)((a * 0x9E3779B97F4A7C15ULL) >> 54);

            for (;;) {
                uint16_t e = t->buckets[bkt];
                if (__builtin_expect(e != EMPTY, 1)) {
                    Ent *E = &t->ents[e];
                    if (__builtin_expect(E->a == a && E->w1 == w1 && E->len == (uint16_t)s, 1)
                        && __builtin_expect(s <= 16, 1)) {
                        E->sum += t10;
                        E->count++;
                        if (t10 < E->min) E->min = (int16_t)t10;
                        if (t10 > E->max) E->max = (int16_t)t10;
                        break;
                    } else if (s > 16 && E->a == a && E->w1 == w1 && E->len == (uint16_t)s
                               && memcmp(p + 16, t->names[e] + 16, s - 16) == 0) {
                        E->sum += t10;
                        E->count++;
                        if (t10 < E->min) E->min = (int16_t)t10;
                        if (t10 > E->max) E->max = (int16_t)t10;
                        break;
                    }
                    bkt = (bkt + 1) & (NBUCKETS - 1);
                } else {
                    int ne = t->nents;
                    Ent *E = &t->ents[ne];
                    E->a = a; E->w1 = w1;
                    E->sum = t10; E->count = 1; E->min = (int16_t)t10; E->max = (int16_t)t10;
                    E->len = (uint16_t)s;
                    t->names[ne] = p;
                    t->buckets[bkt] = (uint16_t)ne;
                    t->nents = ne + 1;
                    break;
                }
            }
        }
    }
    return NULL;
}
