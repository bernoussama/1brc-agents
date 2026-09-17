#!/bin/sh
set -eu
ROOT=/work/submission
if [ ! -x "$ROOT/read-v1" ]; then
  g++ -x c++ -std=c++17 -O3 -march=native -pthread -DSTREAMS=2 -DTBITS=12 -DTEMP=1 -DCOMPARE=1 -DIO=2 -DOWNFD=1 -DFADVICE=1 -o "$ROOT/read-v1.tmp" - <<'CPP_SOURCE'
#include <algorithm>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <cstdint>
#include <string>
#include <vector>
#include <thread>
#include <fcntl.h>
#include <unistd.h>
#include <sys/mman.h>
#include <sys/stat.h>
#include <immintrin.h>
#include <atomic>
#ifndef IO
#define IO 0
#endif
#ifndef CHUNK
#define CHUNK 22
#endif
#ifndef ADVICE
#define ADVICE 0
#endif
#ifndef OWNFD
#define OWNFD 0
#endif
#ifndef FADVICE
#define FADVICE 0
#endif
using namespace std;
#ifndef TBITS
#define TBITS 12
#endif
#ifndef STREAMS
#define STREAMS 1
#endif
struct Entry { char name[32]; uint32_t len; int mn=1000,mx=-1000; int64_t sum=0, count=0; };
static uint64_t load64(const char*p){uint64_t x;memcpy(&x,p,8);return x;}
struct Worker { Entry tab[1<<TBITS];
 __attribute__((always_inline)) inline void row(const char*&p) {
 const char* s=p;
 uint32_t mask=_mm256_movemask_epi8(_mm256_cmpeq_epi8(_mm256_loadu_si256((const __m256i*)p),_mm256_set1_epi8(';')));
 unsigned len=__builtin_ctz(mask);
 uint64_t key=load64(p); key=_bzhi_u64(key,len*8);
 uint64_t h=_mm_crc32_u64(len,key);
 p+=len+1;
#if TEMP==1
 uint64_t w=load64(p);
 unsigned decimal=__builtin_ctzll(~w & 0x10101000ULL);
 int64_t neg=(int64_t)(~w << 59) >> 63;
 uint64_t digits=((w & ~(neg & 0xff)) << (28-decimal)) & 0x0f000f0f00ULL;
 int v=(((digits * 0x640a0001ULL)>>32)&0x3ff);
 v=(v ^ neg)-neg;
 p+=(decimal>>3)+3;
#elif TEMP==2
 unsigned neg=(*p=='-');p+=neg;
 unsigned digits=(p[1]!='.');
 int v=((p[0]&15)*(10+90*digits)+(p[1]&15)*10*digits+(p[digits+2]&15))*(1-2*(int)neg);
 p+=digits+4;
#else
 int sign=1;if(*p=='-'){sign=-1;++p;}
 int v=p[0]-'0';unsigned digits=(p[1]!='.');
 if(digits)v=v*10+p[1]-'0';
 v=(v*10+p[digits+2]-'0')*sign;p+=digits+4;
#endif
 size_t slot=h&((1<<TBITS)-1);
#if COMPARE==1
 uint32_t valid=_bzhi_u32(~0u,len);
 while(tab[slot].len && (tab[slot].len!=len || ((uint32_t)_mm256_movemask_epi8(_mm256_cmpeq_epi8(_mm256_loadu_si256((const __m256i*)s),_mm256_loadu_si256((const __m256i*)tab[slot].name))) & valid)!=valid))slot=(slot+1)&((1<<TBITS)-1);
#else
 while(tab[slot].len && (tab[slot].len!=len || memcmp(tab[slot].name,s,len)))slot=(slot+1)&((1<<TBITS)-1);
#endif
 auto &e=tab[slot]; if(!e.len){e.len=len;memcpy(e.name,s,len);}
 e.sum+=v;++e.count;e.mn=min(e.mn,v);e.mx=max(e.mx,v);
 }
 void run(const char*p,const char*end) {
#if STREAMS==1
 while(p<end)row(p);
#else
 const char* q=p+(end-p)/2;while(q<end&&q[-1]!='\n')++q;
 const char* mid=q;
 while(p<mid && q<end){row(p);row(q);}
 while(p<mid)row(p);while(q<end)row(q);
#endif
 }
};
static string fmt(int64_t t) { return (t<0?"-":"")+to_string(llabs(t)/10)+"."+to_string(llabs(t)%10); }
int main(int argc,char**argv) {
 if(argc!=2)return 1;
 int fd=open(argv[1],O_RDONLY); if(fd<0)return 1;
 struct stat st; if(fstat(fd,&st))return 1;
 size_t sz=st.st_size; if(!sz){printf("{}");return 0;}
 // Pad the final page explicitly, so 32-byte loads never cross an unmapped boundary.
 size_t pages=(sz+4095)&~size_t(4095);
 char* data=(char*)mmap(nullptr,pages+4096,PROT_READ|PROT_WRITE,MAP_PRIVATE|MAP_ANONYMOUS,-1,0);
 if(data==MAP_FAILED)return 1;
 if(mmap(data,pages,PROT_READ,MAP_PRIVATE|MAP_FIXED,fd,0)==MAP_FAILED)return 1;
#if ADVICE==1
 madvise(data,pages,MADV_SEQUENTIAL);
#elif ADVICE==2
 madvise(data,pages,MADV_WILLNEED);
#elif ADVICE==3
 madvise(data,pages,MADV_RANDOM);
#endif
 int nt=4; if(getenv("BRC_THREADS"))nt=atoi(getenv("BRC_THREADS")); nt=max(1,min(nt,16));
 if(sz<65536)nt=1;
 vector<Worker> ws(nt); vector<thread> ts;
 vector<size_t> bounds(nt+1); bounds[nt]=sz;
 for(int i=1;i<nt;i++){size_t b=sz*i/nt; while(b<sz && data[b-1]!='\n')++b; bounds[i]=b;}
 atomic<size_t> next{0};
 auto work=[&](int i){
#if OWNFD
 int fd=open(argv[1],O_RDONLY);
#endif
#if FADVICE==1
 posix_fadvise(fd,0,0,POSIX_FADV_SEQUENTIAL);
#elif FADVICE==2
 posix_fadvise(fd,0,0,POSIX_FADV_RANDOM);
#elif FADVICE==3
 posix_fadvise(fd,0,0,POSIX_FADV_NOREUSE);
#endif
#if IO==0
 ws[i].run(data+bounds[i],data+bounds[i+1]);
#elif IO==1
 const size_t chunk=1ull<<CHUNK;
 for(;;){size_t a=next.fetch_add(chunk,memory_order_relaxed);if(a>=sz)break;size_t b=min(a+chunk,sz);while(a<sz&&a&&data[a-1]!='\n')++a;while(b<sz&&data[b-1]!='\n')++b;ws[i].run(data+a,data+b);}
#elif IO==2
 const size_t chunk=1ull<<CHUNK;
 char* buf=(char*)aligned_alloc(64,chunk+4096);
 size_t pos=bounds[i],end=bounds[i+1],carry=0;
 while(pos<end){size_t n=min(chunk-carry,end-pos);ssize_t got=pread(fd,buf+carry,n,pos);if(got<=0)abort();pos+=got;size_t have=carry+got;size_t used=have;if(pos<end){while(used&&buf[used-1]!='\n')--used;}memset(buf+have,0,64);ws[i].run(buf,buf+used);carry=have-used;memmove(buf,buf+used,carry);}
 free(buf);
#elif IO==3
 const size_t chunk=1ull<<CHUNK;
 char* buf=(char*)aligned_alloc(64,chunk+4096);
 for(;;){size_t start=next.fetch_add(chunk,memory_order_relaxed);if(start>=sz)break;size_t n=min(chunk+128,sz-start);size_t have=0;while(have<n){ssize_t got=pread(fd,buf+have,n-have,start+have);if(got<=0)abort();have+=got;}memset(buf+have,0,64);size_t a=0,b=min(chunk,sz-start);if(start){while(a<have&&buf[a]!='\n')++a;++a;}if(start+b<sz){while(b<have&&buf[b]!='\n')++b;++b;}ws[i].run(buf+a,buf+b);}
 free(buf);
#endif
 };
 for(int i=1;i<nt;i++)ts.emplace_back(work,i);
 work(0);for(auto &t:ts)t.join();
 vector<Entry> out;for(auto&w:ws)for(auto&e:w.tab)if(e.count)out.push_back(e);
 sort(out.begin(),out.end(),[](auto&a,auto&b){return string(a.name,a.len)<string(b.name,b.len);});
 vector<Entry> merged;
 for(auto&e:out){if(merged.empty()||merged.back().len!=e.len||memcmp(merged.back().name,e.name,e.len))merged.push_back(e);else{auto &g=merged.back();g.sum+=e.sum;g.count+=e.count;g.mn=min(g.mn,e.mn);g.mx=max(g.mx,e.mx);}}
 string result="{";
 for(auto&e:merged){if(result.size()>1)result+=", ";int64_t m=(llabs(e.sum)+e.count/2)/e.count;if(e.sum<0)m=-m;result+=string(e.name,e.len)+"="+fmt(e.mn)+"/"+fmt(m)+"/"+fmt(e.mx);}
 result+='}';fwrite(result.data(),1,result.size(),stdout);return 0;
}

CPP_SOURCE
  mv "$ROOT/read-v1.tmp" "$ROOT/read-v1"
fi
exec "$ROOT/read-v1" "$1"
