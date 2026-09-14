#include <algorithm>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <string>
#include <vector>
#include <thread>
#include <map>
#include <sys/mman.h>
#include <sys/stat.h>
#include <fcntl.h>
#include <unistd.h>
struct Entry { std::string name; long long sum=0,count=0; int lo=1000,hi=-1000; };
struct Table { Entry e[2048]; };
static void process(const char* p,const char* end,Table& tab) {
 while(p<end) {
  const char* s=p; unsigned h=2166136261u;
  while(*p!=';') h=(h^(unsigned char)*p++)*16777619u;
  size_t len=p-s; ++p; bool neg=*p=='-'; p+=neg;
  int t=*p++-'0'; if(*p!='.') t=t*10+*p++-'0'; ++p; t=t*10+*p++-'0'; ++p; if(neg)t=-t;
  unsigned i=h&2047;
  while(tab.e[i].count && (tab.e[i].name.size()!=len || memcmp(tab.e[i].name.data(),s,len)))i=(i+1)&2047;
  auto& e=tab.e[i]; if(!e.count)e.name.assign(s,len);
  e.sum+=t; ++e.count; e.lo=std::min(e.lo,t);e.hi=std::max(e.hi,t);
 }
}
static void number(long long t) { if(t<0){putchar('-');t=-t;}printf("%lld.%lld",t/10,t%10); }
int main(int argc,char**argv) {
 if(argc<2)return 1; int fd=open(argv[1],O_RDONLY);if(fd<0)return 1; struct stat st;fstat(fd,&st);size_t n=st.st_size;
 if(!n){fputs("{}",stdout);return 0;}
 const char* data=(char*)mmap(nullptr,n,PROT_READ,MAP_PRIVATE,fd,0);if(data==MAP_FAILED)return 1;
 const int nt=4; std::vector<Table> tables(nt); std::vector<std::thread> threads;const char* bounds[nt+1]; bounds[0]=data;bounds[nt]=data+n;
 for(int i=1;i<nt;++i){const char*p=data+n*i/nt;while(p<data+n&&p[-1]!='\n')++p;bounds[i]=p;}
 for(int i=1;i<nt;++i)threads.emplace_back(process,bounds[i],bounds[i+1],std::ref(tables[i]));process(bounds[0],bounds[1],tables[0]);for(auto&t:threads)t.join();
 std::map<std::string,Entry> result;
 for(auto&tab:tables)for(auto&e:tab.e)if(e.count){auto&r=result[e.name];r.sum+=e.sum;r.count+=e.count;r.lo=std::min(r.lo,e.lo);r.hi=std::max(r.hi,e.hi);}
 putchar('{');bool first=true;for(auto&[name,e]:result){if(!first)fputs(", ",stdout);first=false;fwrite(name.data(),1,name.size(),stdout);putchar('=');number(e.lo);putchar('/');long long a=e.sum<0?-e.sum:e.sum;long long v=(a+e.count/2)/e.count;if(e.sum<0)v=-v;number(v);putchar('/');number(e.hi);}putchar('}');
 munmap((void*)data,n);close(fd);return 0;
}
