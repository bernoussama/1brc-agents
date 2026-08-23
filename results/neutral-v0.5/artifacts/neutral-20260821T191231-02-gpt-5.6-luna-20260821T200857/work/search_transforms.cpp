#include <cstdint>
#include <cstdio>
#include <cstring>
#include <fstream>
#include <string>
#include <vector>
struct K { uint32_t k; int w; };
int main() {
  std::ifstream f("/work/stations.txt"); std::vector<std::string> xs; std::string s;
  while (std::getline(f,s)) xs.push_back(s);
  const uint32_t ds[] = {0,1,0x9e3779b9u,0x01010101u,0x7f4a7c15u,0x45d9f3bu,0x27d4eb2du,0x165667b1u};
  for (uint32_t d : ds) {
    std::vector<K> ks;
    for (auto &x:xs) { uint32_t raw=0; std::memcpy(&raw,x.data(),4); uint32_t k=raw ^ (uint32_t)x.size()*d; bool found=false; for(auto &z:ks) if(z.k==k){z.w++;found=true;break;} if(!found)ks.push_back({k,1}); }
    uint64_t best=~0ULL; uint32_t bestc=0; int bestmax=999; int bestu=0;
    uint32_t seed=1;
    for (int iter=0;iter<1500000;iter++) {
      seed=seed*1664525u+1013904223u; uint32_t c=seed|1;
      uint32_t slots[1024]; for(auto &z:slots) z=0xffffffffu;
      uint64_t score=0; int unweighted=0,maxp=0;
      for(auto &z:ks){ uint32_t pos=(uint32_t)((((uint64_t)z.k*c)&0xffffffffULL)>>22), p=0; while(slots[pos]!=0xffffffffu){pos=(pos+1)&1023;p++;} slots[pos]=z.k; score+=(uint64_t)p*z.w; unweighted+=p; if((int)p>maxp)maxp=p; }
      if(score<best || (score==best&&maxp<bestmax)){best=score;bestc=c;bestmax=maxp;bestu=unweighted;}
    }
    std::printf("d=%u groups=%zu score=%llu unweighted=%d c=%u max=%d\n",d,ks.size(),(unsigned long long)best,bestu,bestc,bestmax);
  }
}
