#include <cstdint>
#include <cstdio>
#include <cstring>
#include <fstream>
#include <string>
#include <vector>
#include <unordered_map>
#include <random>
struct K { uint32_t k; int w; };
int main() {
  std::ifstream f("/work/stations.txt"); std::vector<std::string> xs; std::string s;
  while (std::getline(f,s)) xs.push_back(s);
  std::vector<K> ks;
  for (auto &x:xs) { uint32_t k=0; std::memcpy(&k,x.data(),x.size()>=4?4:x.size()); bool found=false; for(auto &z:ks) if(z.k==k){z.w++;found=true;break;} if(!found)ks.push_back({k,1}); }
  uint64_t best=~0ULL; uint32_t bestc=0; int bestmax=0;
  uint32_t seed=1;
  for (int iter=0;iter<5000000;iter++) {
    seed=seed*1664525u+1013904223u; uint32_t c=seed|1;
    uint32_t slots[2048]; for(auto &z:slots) z=0xffffffffu;
    uint64_t score=0; int maxp=0;
    for(auto &z:ks){ uint32_t pos=(uint32_t)((((uint64_t)z.k*c)&0xffffffffULL)>>21), p=0; while(slots[pos]!=0xffffffffu){pos=(pos+1)&2047;p++;} slots[pos]=z.k; score+=(uint64_t)p*z.w; if((int)p>maxp)maxp=p; }
    if(score<best || (score==best&&maxp<bestmax)){best=score;bestc=c;bestmax=maxp; std::printf("%llu %u max%d\n",(unsigned long long)best,bestc,bestmax);}
  }
  std::printf("FINAL %llu %u max%d\n",(unsigned long long)best,bestc,bestmax);
}
