#!/bin/sh
# Round A submission launcher. Self-contained: uses the prebuilt binary if
# present, otherwise writes the embedded C++ source and compiles it.
set -e
DIR=/work/submission
BIN="$DIR/solution"
SRC="$DIR/solution.cpp"
if [ ! -x "$BIN" ]; then
  mkdir -p "$DIR"
  if [ ! -f "$SRC" ]; then
    cat > "$SRC" <<'ONEBRC_SRC_EOF'
// 1BRC Round A - cache-aware mmap + O_DIRECT hybrid, compact hot table
#include <cstdio>
#include <cstdint>
#include <cstring>
#include <cstdlib>
#include <string>
#include <vector>
#include <algorithm>
#include <atomic>
#include <thread>
#include <fcntl.h>
#include <unistd.h>
#include <sys/mman.h>
#include <sys/stat.h>
#include <emmintrin.h>

static const int MAXLEN = 32;
static const size_t ALIGN = 4096;
static const uint32_t TABLE_BITS = 12;
static const uint32_t TABLE_SIZE = 1u << TABLE_BITS;
static const uint32_t TABLE_MASK = TABLE_SIZE - 1;

struct Hot {
    uint64_t key;
    int32_t mn, mx;
    int64_t sum;
    uint32_t cnt;
};

static inline uint32_t slot_of(uint64_t key) {
    return (uint32_t)((key * 0x9E3779B97F4A7C15ULL) >> (64 - TABLE_BITS));
}

static inline const char* find_semi_long(const char* p) {
    for (;;) {
        uint64_t x;
        memcpy(&x, p, 8);
        x ^= 0x3b3b3b3b3b3b3b3bULL;
        uint64_t mm = (x - 0x0101010101010101ULL) & ~x & 0x8080808080808080ULL;
        if (mm) return p + (__builtin_ctzll(mm) >> 3);
        p += 8;
    }
}

static inline void process_buf(const char* buf, size_t start, size_t end,
                               Hot* table, char (*names)[MAXLEN]) {
    const __m128i semiv = _mm_set1_epi8(';');
    const char* p = buf + start;
    const char* stop = buf + end;
    while (p < stop) {
        __m128i sv = _mm_loadu_si128((const __m128i*)p);
        int m = _mm_movemask_epi8(_mm_cmpeq_epi8(sv, semiv));
        const char* semi;
        if (m) semi = p + __builtin_ctz(m);
        else semi = find_semi_long(p + 16);
        uint64_t raw = (uint64_t)_mm_cvtsi128_si64(sv);
        const char* q = semi + 1;
        int neg = (*q == '-');
        q += neg;
        int v;
        int templen;
        if (q[1] == '.') {
            v = (q[0] - '0') * 10 + (q[2] - '0');
            templen = 3;
        } else {
            v = ((q[0] - '0') * 10 + (q[1] - '0')) * 10 + (q[3] - '0');
            templen = 4;
        }
        v = (v ^ -neg) + neg;

        uint32_t len = (uint32_t)(semi - p);
        uint32_t l8 = len < 8 ? len : 8;
        raw &= (~0ULL) >> ((8 - l8) * 8);
        uint64_t key = raw + ((uint64_t)len << 56);
        uint32_t idx = slot_of(key);
        Hot* e = &table[idx];
        for (;;) {
            if (e->cnt == 0) {
                e->key = key;
                memcpy(names[idx], p, len);
                names[idx][len] = 0;
                e->mn = e->mx = v;
                e->sum = v;
                e->cnt = 1;
                break;
            }
            if (e->key == key) {
                if (v < e->mn) e->mn = v;
                else if (v > e->mx) e->mx = v;
                e->sum += v;
                e->cnt += 1;
                break;
            }
            idx = (idx + 1) & TABLE_MASK;
            e = &table[idx];
        }
        p = q + templen + 1;
    }
}

static bool pread_full(int fd, void* buf, size_t len, uint64_t off) {
    size_t done = 0;
    while (done < len) {
        ssize_t n = pread(fd, (char*)buf + done, len - done, (off_t)(off + done));
        if (n < 0) return false;
        if (n == 0) return false;
        done += (size_t)n;
    }
    return true;
}

struct Shared {
    const char* data;
    uint64_t* bounds;
    uint64_t* order;
    uint64_t norder;
    std::atomic<uint64_t> next;
    int fd_d;
    int fd_b;
    uint64_t filesize;
    size_t chunk;
    unsigned char* seg_res;
    int use_odirect;
};

static void worker(Shared* sh, Hot* table, char (*names)[MAXLEN]) {
    memset(table, 0, sizeof(Hot) * TABLE_SIZE);
    unsigned char* buf = nullptr;
    if (posix_memalign((void**)&buf, ALIGN, sh->chunk + ALIGN * 2) != 0) return;
    size_t cap = sh->chunk + ALIGN * 2;
    for (;;) {
        uint64_t k = sh->next.fetch_add(1, std::memory_order_relaxed);
        if (k >= sh->norder) break;
        uint64_t i = sh->order[k];
        uint64_t s = sh->bounds[i];
        uint64_t e = sh->bounds[i + 1];
        if (s >= e) continue;
        if (sh->seg_res && !sh->seg_res[i]) {
            uint64_t al = s & ~(uint64_t)(ALIGN - 1);
            size_t skip = (size_t)(s - al);
            uint64_t want = e - al;
            size_t len = (size_t)((want + ALIGN - 1) & ~(uint64_t)(ALIGN - 1));
            if (len > cap) len = cap;
            if (al + (uint64_t)len > sh->filesize) {
                size_t blen = (size_t)(sh->filesize - al);
                if (blen > cap) blen = cap;
                if (!pread_full(sh->fd_b, buf, blen, al)) continue;
                size_t endoff = (size_t)(e - al);
                if (endoff > blen) endoff = blen;
                process_buf((char*)buf, skip, endoff, table, names);
            } else {
                int rfd = sh->use_odirect ? sh->fd_d : sh->fd_b;
                if (!pread_full(rfd, buf, len, al)) {
                    if (rfd == sh->fd_b || !pread_full(sh->fd_b, buf, len, al)) continue;
                }
                process_buf((char*)buf, skip, (size_t)want, table, names);
            }
        } else {
            process_buf(sh->data, (size_t)s, (size_t)e, table, names);
        }
    }
    free(buf);
}

int main(int argc, char** argv) {
    if (argc < 2) { fprintf(stderr, "usage: %s <file>\n", argv[0]); return 1; }
    const char* path = argv[1];
    int nthreads = 32;
    if (const char* e = getenv("NTHREADS")) {
        int t = atoi(e);
        if (t > 0 && t <= 256) nthreads = t;
    }
    size_t chunk = 16u << 20;
    if (const char* e = getenv("CHUNK")) {
        long long c = atoll(e);
        if (c >= (1 << 16)) chunk = (size_t)c;
    }
    int use_mincore = 1;
    if (const char* e = getenv("MINCORE")) use_mincore = atoi(e);
    int debug = 0;
    if (const char* e = getenv("DEBUG")) debug = atoi(e);

    int fd = open(path, O_RDONLY);
    if (fd < 0) { perror("open"); return 1; }
    int fd_d = open(path, O_RDONLY | O_DIRECT);
    if (fd_d < 0) fd_d = fd;
    struct stat st;
    if (fstat(fd, &st) != 0) { perror("fstat"); return 1; }
    uint64_t filesize = (uint64_t)st.st_size;
    long pg = sysconf(_SC_PAGESIZE);

    size_t map_len = filesize + (size_t)pg;
    char* base = (char*)mmap(nullptr, map_len, PROT_READ | PROT_WRITE,
                             MAP_PRIVATE | MAP_ANONYMOUS, -1, 0);
    if (base == MAP_FAILED) { perror("mmap anon"); return 1; }
    void* r = mmap(base, filesize, PROT_READ, MAP_PRIVATE | MAP_FIXED, fd, 0);
    if (r == MAP_FAILED) { perror("mmap file"); return 1; }
    const char* DATA = base;

    uint64_t nseg = (filesize + chunk - 1) / chunk;
    if (nseg < 1) nseg = 1;
    std::vector<uint64_t> bounds(nseg + 1);
    bounds[0] = 0;
    bounds[nseg] = filesize;
    {
        char tmp[8192];
        for (uint64_t i = 1; i < nseg; ++i) {
            uint64_t raw = i * (uint64_t)chunk;
            if (raw >= filesize) { bounds[i] = filesize; continue; }
            uint64_t pos = raw;
            uint64_t nlpos = filesize;
            while (pos < filesize) {
                size_t want = sizeof(tmp);
                if (pos + want > filesize) want = (size_t)(filesize - pos);
                ssize_t n = pread(fd, tmp, want, (off_t)pos);
                if (n <= 0) break;
                void* nl = memchr(tmp, '\n', (size_t)n);
                if (nl) { nlpos = pos + (uint64_t)((char*)nl - tmp) + 1; break; }
                pos += (size_t)n;
            }
            bounds[i] = nlpos;
        }
    }

    std::vector<unsigned char> resident;
    if (use_mincore) {
        uint64_t pages = (filesize + (uint64_t)pg - 1) / (uint64_t)pg;
        resident.resize(pages, 0);
        if (mincore(base, filesize, resident.data()) != 0) {
            perror("mincore");
            resident.assign(pages, 1);
        }
    }

    std::vector<uint64_t> order;
    order.reserve(nseg);
    std::vector<unsigned char> seg_res_store;
    unsigned char* seg_res_ptr = nullptr;
    double resident_frac = 1.0;
    if (use_mincore) {
        std::vector<unsigned char> seg_res(nseg, 0);
        uint64_t total_res = 0;
        for (uint64_t i = 0; i < nseg; ++i) {
            uint64_t s = bounds[i], e = bounds[i + 1];
            if (s >= e) { seg_res[i] = 0; continue; }
            uint64_t p0 = s / (uint64_t)pg;
            uint64_t p1 = (e + (uint64_t)pg - 1) / (uint64_t)pg;
            uint64_t cnt = 0;
            for (uint64_t p = p0; p < p1 && p < resident.size(); ++p) cnt += resident[p] & 1;
            uint64_t np = p1 - p0;
            if (np && cnt * 2 >= np) seg_res[i] = 1;
            total_res += cnt;
        }
        std::vector<uint64_t> res, non;
        for (uint64_t i = 0; i < nseg; ++i) {
            if (bounds[i] >= bounds[i + 1]) continue;
            if (seg_res[i]) res.push_back(i); else non.push_back(i);
        }
        size_t ri = 0, ni = 0;
        while (ri < res.size() || ni < non.size()) {
            if (ri < res.size()) order.push_back(res[ri++]);
            if (ni < non.size()) order.push_back(non[ni++]);
        }
        seg_res_store.swap(seg_res);
        seg_res_ptr = seg_res_store.empty() ? nullptr : seg_res_store.data();
        resident_frac = resident.empty() ? 1.0 : (double)total_res / (double)resident.size();
        if (debug) {
            fprintf(stderr, "mincore: resident_pages=%llu/%llu (%.1f%%) resident_segs=%zu/%llu\n",
                    (unsigned long long)total_res, (unsigned long long)resident.size(),
                    100.0 * total_res / (double)(resident.size() ? resident.size() : 1),
                    (size_t)std::count(seg_res_store.begin(), seg_res_store.end(), (unsigned char)1),
                    (unsigned long long)nseg);
        }
    } else {
        for (uint64_t i = 0; i < nseg; ++i) order.push_back(i);
    }

    Shared sh;
    sh.data = DATA;
    sh.bounds = bounds.data();
    sh.order = order.data();
    sh.norder = order.size();
    sh.next.store(0);
    sh.fd_d = fd_d;
    sh.fd_b = fd;
    sh.filesize = filesize;
    sh.chunk = chunk;
    sh.seg_res = seg_res_ptr;
    sh.use_odirect = (resident_frac >= 0.35) ? 1 : 0;
    if (const char* e = getenv("ODIRECT")) sh.use_odirect = atoi(e);
    if (debug) fprintf(stderr, "use_odirect=%d resident_frac=%.3f\n", sh.use_odirect, resident_frac);

    std::vector<Hot*> tables(nthreads);
    std::vector<char (*)[MAXLEN]> nametabs(nthreads);
    std::vector<std::thread> threads;
    for (int t = 0; t < nthreads; ++t) {
        tables[t] = (Hot*)malloc(sizeof(Hot) * TABLE_SIZE);
        nametabs[t] = (char (*)[MAXLEN])malloc((size_t)MAXLEN * TABLE_SIZE);
        threads.emplace_back(worker, &sh, tables[t], nametabs[t]);
    }
    for (auto& th : threads) th.join();

    Hot* g = (Hot*)malloc(sizeof(Hot) * TABLE_SIZE);
    char (*gnames)[MAXLEN] = (char (*)[MAXLEN])malloc((size_t)MAXLEN * TABLE_SIZE);
    memset(g, 0, sizeof(Hot) * TABLE_SIZE);
    for (int i = 0; i < nthreads; ++i) {
        Hot* tbl = tables[i];
        char (*nm)[MAXLEN] = nametabs[i];
        for (uint32_t j = 0; j < TABLE_SIZE; ++j) {
            Hot* e = &tbl[j];
            if (e->cnt == 0) continue;
            uint32_t idx = slot_of(e->key);
            Hot* d = &g[idx];
            for (;;) {
                if (d->cnt == 0) {
                    *d = *e;
                    memcpy(gnames[idx], nm[j], MAXLEN);
                    break;
                }
                if (d->key == e->key) {
                    if (e->mn < d->mn) d->mn = e->mn;
                    if (e->mx > d->mx) d->mx = e->mx;
                    d->sum += e->sum;
                    d->cnt += e->cnt;
                    break;
                }
                idx = (idx + 1) & TABLE_MASK;
                d = &g[idx];
            }
        }
    }

    struct OutEntry { const char* name; uint32_t len; int32_t mn, mx; int64_t sum; uint32_t cnt; };
    std::vector<OutEntry> out;
    out.reserve(512);
    for (uint32_t j = 0; j < TABLE_SIZE; ++j) {
        Hot* e = &g[j];
        if (e->cnt == 0) continue;
        out.push_back({gnames[j], (uint32_t)strlen(gnames[j]), e->mn, e->mx, e->sum, e->cnt});
    }
    std::sort(out.begin(), out.end(), [](const OutEntry& a, const OutEntry& b) {
        uint32_t m = a.len < b.len ? a.len : b.len;
        int c = memcmp(a.name, b.name, m);
        if (c) return c < 0;
        return a.len < b.len;
    });

    std::string res;
    res.reserve(64 * out.size());
    res.push_back('{');
    char buf[128];
    for (size_t i = 0; i < out.size(); ++i) {
        if (i) { res.push_back(','); res.push_back(' '); }
        res.append(out[i].name, out[i].len);
        res.push_back('=');
        int32_t mn = out[i].mn, mx = out[i].mx;
        int64_t s = out[i].sum;
        int64_t c = (int64_t)out[i].cnt;
        int64_t qv = s / c;
        int64_t rem = s % c;
        if (rem < 0) { if (-2 * rem >= c) qv -= 1; }
        else { if (2 * rem >= c) qv += 1; }
        auto fmt = [&](int64_t t10) {
            char* b = buf;
            if (t10 < 0) { *b++ = '-'; t10 = -t10; }
            uint32_t ip = (uint32_t)(t10 / 10);
            if (ip >= 10) { *b++ = char('0' + ip / 10); }
            *b++ = char('0' + ip % 10);
            *b++ = '.';
            *b++ = char('0' + t10 % 10);
            res.append(buf, b - buf);
        };
        fmt(mn);
        res.push_back('/');
        fmt(qv);
        res.push_back('/');
        fmt(mx);
    }
    res.push_back('}');
    fwrite(res.data(), 1, res.size(), stdout);
    return 0;
}
ONEBRC_SRC_EOF
  fi
  g++ -O3 -march=native -pthread -o "$BIN.tmp" "$SRC"
  mv "$BIN.tmp" "$BIN"
fi
exec "$BIN" "$1"
