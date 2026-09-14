// 1BRC Round A solution
#define _GNU_SOURCE
#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
#include <string.h>
#include <pthread.h>
#include <fcntl.h>
#include <unistd.h>
#include <sys/mman.h>
#include <sys/stat.h>

typedef struct {
    const char *name;
    uint32_t len;
    int32_t min, max;
    int64_t sum;
    int64_t count;
} Entry;

typedef struct {
    const char *buf;
    size_t start, end;
    Entry *table;
    uint64_t mask;
    int tid;
} Task;

#define TABLE_BITS 14
#define TABLE_SIZE (1u << TABLE_BITS)
#define TABLE_MASK (TABLE_SIZE - 1)

static inline uint64_t hash_name(const char *s, uint32_t len) {
    uint64_t h = 0xcbf29ce484222325ULL;
    for (uint32_t i = 0; i < len; i++) {
        h ^= (unsigned char)s[i];
        h *= 0x100000001b3ULL;
    }
    return h;
}

static void *worker(void *arg) {
    Task *t = (Task *)arg;
    const char *buf = t->buf;
    const char *p = buf + t->start;
    const char *e = buf + t->end;
    Entry *table = t->table;
    uint64_t mask = t->mask;

    while (p < e) {
        const char *name = p;
        const char *q = p;
        uint64_t h = 0xcbf29ce484222325ULL;
        unsigned char c;
        while ((c = (unsigned char)*q) != ';') {
            h ^= c;
            h *= 0x100000001b3ULL;
            q++;
        }
        uint32_t len = (uint32_t)(q - p);

        const char *tp = q + 1;
        int sign = 1;
        if (*tp == '-') { sign = -1; tp++; }
        int v;
        if (tp[1] == '.') {
            v = (tp[0] - '0') * 10 + (tp[2] - '0');
            p = tp + 4; // skip '\n'
        } else {
            v = (tp[0] - '0') * 100 + (tp[1] - '0') * 10 + (tp[3] - '0');
            p = tp + 5;
        }
        v *= sign;

        uint64_t idx = h & mask;
        for (;;) {
            Entry *en = &table[idx];
            if (en->name == NULL) {
                en->name = name;
                en->len = len;
                en->min = v;
                en->max = v;
                en->sum = v;
                en->count = 1;
                break;
            }
            if (en->len == len && memcmp(en->name, name, len) == 0) {
                if (v < en->min) en->min = v;
                if (v > en->max) en->max = v;
                en->sum += v;
                en->count++;
                break;
            }
            idx = (idx + 1) & mask;
        }
    }
    return NULL;
}

// find start of line at/after raw offset (position after previous newline)
static size_t line_boundary(const char *buf, size_t size, size_t raw) {
    if (raw == 0) return 0;
    if (raw >= size) return size;
    size_t p = raw;
    while (p > 0 && buf[p - 1] != '\n') p++;
    return p;
}

static inline void fmt_tenths(char **out, int64_t v) {
    char *o = *out;
    if (v == 0) {
        *o++ = '0'; *o++ = '.'; *o++ = '0';
    } else {
        if (v < 0) { *o++ = '-'; v = -v; }
        // integer part
        char tmp[24];
        int n = 0;
        int64_t ip = v / 10;
        int64_t fp = v % 10;
        if (ip == 0) tmp[n++] = '0';
        while (ip > 0) { tmp[n++] = (char)('0' + ip % 10); ip /= 10; }
        while (n > 0) *o++ = tmp[--n];
        *o++ = '.';
        *o++ = (char)('0' + fp);
    }
    *out = o;
}

static int cmp_entry(const void *a, const void *b) {
    const Entry *x = (const Entry *)a, *y = (const Entry *)b;
    uint32_t n = x->len < y->len ? x->len : y->len;
    int r = memcmp(x->name, y->name, n);
    if (r) return r;
    if (x->len < y->len) return -1;
    if (x->len > y->len) return 1;
    return 0;
}

int main(int argc, char **argv) {
    if (argc < 2) { fprintf(stderr, "usage: %s <file> [threads]\n", argv[0]); return 1; }
    const char *path = argv[1];
    int nthreads = argc >= 3 ? atoi(argv[2]) : 4;
    if (nthreads < 1) nthreads = 1;
    if (nthreads > 64) nthreads = 64;

    int fd = open(path, O_RDONLY);
    if (fd < 0) { perror("open"); return 1; }
    struct stat st;
    if (fstat(fd, &st) != 0) { perror("fstat"); return 1; }
    size_t size = (size_t)st.st_size;
    char *buf = mmap(NULL, size, PROT_READ, MAP_PRIVATE, fd, 0);
    if (buf == MAP_FAILED) { perror("mmap"); return 1; }
    madvise(buf, size, MADV_SEQUENTIAL);
    madvise(buf, size, MADV_WILLNEED);

    Entry **tables = calloc(nthreads, sizeof(Entry *));
    Task *tasks = calloc(nthreads, sizeof(Task));
    pthread_t *th = calloc(nthreads, sizeof(pthread_t));
    for (int i = 0; i < nthreads; i++) {
        tables[i] = calloc(TABLE_SIZE, sizeof(Entry));
        tasks[i].buf = buf;
        tasks[i].table = tables[i];
        tasks[i].mask = TABLE_MASK;
        tasks[i].tid = i;
    }
    for (int i = 0; i < nthreads; i++) {
        tasks[i].start = line_boundary(buf, size, size * (size_t)i / (size_t)nthreads);
        tasks[i].end = line_boundary(buf, size, size * (size_t)(i + 1) / (size_t)nthreads);
    }
    for (int i = 0; i < nthreads; i++) pthread_create(&th[i], NULL, worker, &tasks[i]);
    for (int i = 0; i < nthreads; i++) pthread_join(th[i], NULL);

    // merge
    Entry *global = calloc(TABLE_SIZE, sizeof(Entry));
    for (int i = 0; i < nthreads; i++) {
        Entry *tb = tables[i];
        for (uint32_t j = 0; j < TABLE_SIZE; j++) {
            Entry *en = &tb[j];
            if (en->name == NULL) continue;
            uint64_t idx = hash_name(en->name, en->len) & TABLE_MASK;
            for (;;) {
                Entry *g = &global[idx];
                if (g->name == NULL) { *g = *en; break; }
                if (g->len == en->len && memcmp(g->name, en->name, en->len) == 0) {
                    if (en->min < g->min) g->min = en->min;
                    if (en->max > g->max) g->max = en->max;
                    g->sum += en->sum;
                    g->count += en->count;
                    break;
                }
                idx = (idx + 1) & TABLE_MASK;
            }
        }
    }

    Entry *list = malloc(TABLE_SIZE * sizeof(Entry));
    uint32_t n = 0;
    for (uint32_t j = 0; j < TABLE_SIZE; j++) {
        if (global[j].name) list[n++] = global[j];
    }
    qsort(list, n, sizeof(Entry), cmp_entry);

    // output
    size_t cap = 1u << 16;
    char *out = malloc(cap);
    char *o = out;
    *o++ = '{';
    for (uint32_t i = 0; i < n; i++) {
        if (i) { *o++ = ','; *o++ = ' '; }
        // make sure capacity (max name 64 + suffix ~40)
        if ((size_t)(o - out) + 128 > cap) {
            size_t used = o - out;
            cap *= 2;
            out = realloc(out, cap);
            o = out + used;
        }
        Entry *en = &list[i];
        memcpy(o, en->name, en->len); o += en->len;
        *o++ = '=';
        fmt_tenths(&o, en->min);
        *o++ = '/';
        // mean
        int64_t q = en->sum / en->count;
        int64_t r = en->sum % en->count;
        if (r != 0) {
            int64_t ar = r < 0 ? -r : r;
            if (2 * ar >= en->count) q += (en->sum > 0 ? 1 : -1);
        }
        fmt_tenths(&o, q);
        *o++ = '/';
        fmt_tenths(&o, en->max);
    }
    *o++ = '}';
    fwrite(out, 1, o - out, stdout);
    return 0;
}
