#define _GNU_SOURCE
#include <errno.h>
#include <fcntl.h>
#include <pthread.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/mman.h>
#include <sys/stat.h>
#include <sys/types.h>
#include <unistd.h>

#define THREADS 6
#define TABLE_SIZE 1024
#define TABLE_MASK (TABLE_SIZE - 1)

typedef struct {
    const char *name;
    uint64_t hash;
    int64_t sum;
    uint64_t count;
    int min;
    int max;
    uint16_t len;
    uint8_t used;
} Entry;

typedef struct {
    const char *begin;
    const char *end;
    Entry table[TABLE_SIZE];
} Worker;

static inline uint64_t hash_and_find_semicolon(const char *p, const char **semi) {
    uint64_t h = 1469598103934665603ULL;
    unsigned char c;
    while ((c = (unsigned char)*p) != ';') {
        h ^= c;
        h *= 1099511628211ULL;
        ++p;
    }
    *semi = p;
    return h;
}

static inline int parse_temperature(const char *p) {
    int neg = *p == '-';
    p += neg;
    int v = *p++ - '0';
    if (*p != '.') v = v * 10 + (*p++ - '0');
    ++p;
    v = v * 10 + (*p - '0');
    return neg ? -v : v;
}

static inline int same_name(const Entry *e, const char *name, unsigned len, uint64_t hash) {
    return e->hash == hash && e->len == len && memcmp(e->name, name, len) == 0;
}

static inline Entry *find_or_add(Entry *table, const char *name, unsigned len, uint64_t hash, int temperature) {
    Entry *e = &table[hash & TABLE_MASK];
    while (e->used) {
        if (same_name(e, name, len, hash)) return e;
        e = &table[((e - table) + 1) & TABLE_MASK];
    }
    e->used = 1;
    e->name = name;
    e->hash = hash;
    e->len = len;
    e->min = temperature;
    e->max = temperature;
    e->sum = 0;
    e->count = 0;
    return e;
}

static void *process(void *arg) {
    Worker *w = arg;
    const char *p = w->begin;
    while (p < w->end) {
        const char *semi;
        uint64_t hash = hash_and_find_semicolon(p, &semi);
        unsigned len = (unsigned)(semi - p);
        int t = parse_temperature(semi + 1);
        Entry *e = find_or_add(w->table, p, len, hash, t);
        if (t < e->min) e->min = t;
        if (t > e->max) e->max = t;
        e->sum += t;
        e->count++;
        const char *q = semi + 1;
        if (*q == '-') ++q;
        if (q[1] == '.') p = q + 4;
        else p = q + 5;
    }
    return NULL;
}

static inline void merge_entry(Entry *table, const Entry *src) {
    Entry *e = &table[src->hash & TABLE_MASK];
    while (e->used) {
        if (same_name(e, src->name, src->len, src->hash)) {
            if (src->min < e->min) e->min = src->min;
            if (src->max > e->max) e->max = src->max;
            e->sum += src->sum;
            e->count += src->count;
            return;
        }
        e = &table[((e - table) + 1) & TABLE_MASK];
    }
    *e = *src;
}

static int name_compare(const void *a, const void *b) {
    const Entry *x = *(const Entry * const *)a;
    const Entry *y = *(const Entry * const *)b;
    unsigned n = x->len < y->len ? x->len : y->len;
    int c = memcmp(x->name, y->name, n);
    if (c) return c;
    return (x->len > y->len) - (x->len < y->len);
}

static char *append_uint(char *out, unsigned long long x) {
    char tmp[24];
    char *p = tmp + sizeof(tmp);
    do { *--p = (char)('0' + x % 10); x /= 10; } while (x);
    while (p < tmp + sizeof(tmp)) *out++ = *p++;
    return out;
}

static char *append_temp(char *out, int v) {
    if (v < 0) { *out++ = '-'; v = -v; }
    out = append_uint(out, (unsigned)v / 10);
    *out++ = '.';
    *out++ = (char)('0' + (unsigned)v % 10);
    return out;
}

int main(int argc, char **argv) {
    if (argc != 2) return 2;
    int fd = open(argv[1], O_RDONLY);
    if (fd < 0) return 2;
    struct stat st;
    if (fstat(fd, &st) || st.st_size == 0) { close(fd); return 2; }
    size_t size = (size_t)st.st_size;
    const char *data = mmap(NULL, size, PROT_READ, MAP_PRIVATE, fd, 0);
    close(fd);
    if (data == MAP_FAILED) return 2;

    Worker workers[THREADS];
    pthread_t tids[THREADS];
    for (int i = 0; i < THREADS; ++i) {
        size_t start = size * (size_t)i / THREADS;
        size_t end = size * (size_t)(i + 1) / THREADS;
        if (i) while (start < size && data[start++] != '\n') {}
        workers[i].begin = data + start;
        workers[i].end = data + end;
        memset(workers[i].table, 0, sizeof(workers[i].table));
        if (pthread_create(&tids[i], NULL, process, &workers[i])) return 2;
    }
    for (int i = 0; i < THREADS; ++i) pthread_join(tids[i], NULL);

    Entry all[TABLE_SIZE] = {0};
    for (int i = 0; i < THREADS; ++i)
        for (int j = 0; j < TABLE_SIZE; ++j)
            if (workers[i].table[j].used) merge_entry(all, &workers[i].table[j]);

    Entry *ordered[TABLE_SIZE];
    int n = 0;
    for (int i = 0; i < TABLE_SIZE; ++i) if (all[i].used) ordered[n++] = &all[i];
    qsort(ordered, n, sizeof(*ordered), name_compare);

    char output[65536];
    char *out = output;
    *out++ = '{';
    for (int i = 0; i < n; ++i) {
        Entry *e = ordered[i];
        if (i) { *out++ = ','; *out++ = ' '; }
        memcpy(out, e->name, e->len); out += e->len;
        *out++ = '=';
        out = append_temp(out, e->min);
        *out++ = '/';
        int mean = e->sum >= 0 ? (int)((e->sum + (int64_t)e->count / 2) / (int64_t)e->count)
                               : -(int)((-e->sum + (int64_t)e->count / 2) / (int64_t)e->count);
        out = append_temp(out, mean);
        *out++ = '/';
        out = append_temp(out, e->max);
    }
    *out++ = '}';
    size_t bytes = (size_t)(out - output);
    ssize_t ignored = write(STDOUT_FILENO, output, bytes);
    (void)ignored;
    munmap((void *)data, size);
    return 0;
}
