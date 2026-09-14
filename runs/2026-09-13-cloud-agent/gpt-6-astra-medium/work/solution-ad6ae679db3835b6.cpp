#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <cstdint>
#include <string>
#include <vector>
#include <algorithm>
#include <thread>
#include <atomic>
#include <immintrin.h>
#include <sys/mman.h>
#include <sys/stat.h>
#include <fcntl.h>
#include <unistd.h>
#ifndef WORKERS
#define WORKERS 4
#endif
#ifndef BITS
#define BITS 14
#endif
#ifndef STREAMS
#define STREAMS 4
#endif
#ifndef HASH
#define HASH 0
#endif
#ifndef LAYOUT
#define LAYOUT 0
#endif
#ifndef COLD_WORKERS
#define COLD_WORKERS 6
#endif
#ifndef BLOCK
#define BLOCK 24
#endif
#ifndef MODE
#define MODE -1
#endif
#ifndef READ_ADVICE
#define READ_ADVICE 0
#endif
static const char* names[]={"Abha","Abidjan","Abéché","Accra","Addis Ababa","Adelaide","Aden","Ahvaz","Albuquerque","Alexandra","Alexandria","Algiers","Alice Springs","Almaty","Amsterdam","Anadyr","Anchorage","Andorra la Vella","Ankara","Antananarivo","Antsiranana","Arkhangelsk","Ashgabat","Asmara","Assab","Astana","Athens","Atlanta","Auckland","Austin","Baghdad","Baguio","Baku","Baltimore","Bamako","Bangkok","Bangui","Banjul","Barcelona","Bata","Batumi","Beijing","Beirut","Belgrade","Belize City","Benghazi","Bergen","Berlin","Bilbao","Birao","Bishkek","Bissau","Blantyre","Bloemfontein","Boise","Bordeaux","Bosaso","Boston","Bouaké","Bratislava","Brazzaville","Bridgetown","Brisbane","Brussels","Bucharest","Budapest","Bujumbura","Bulawayo","Burnie","Busan","Cabo San Lucas","Cairns","Cairo","Calgary","Canberra","Cape Town","Changsha","Charlotte","Chiang Mai","Chicago","Chihuahua","Chittagong","Chișinău","Chongqing","Christchurch","City of San Marino","Colombo","Columbus","Conakry","Copenhagen","Cotonou","Cracow","Da Lat","Da Nang","Dakar","Dallas","Damascus","Dampier","Dar es Salaam","Darwin","Denpasar","Denver","Detroit","Dhaka","Dikson","Dili","Djibouti","Dodoma","Dolisie","Douala","Dubai","Dublin","Dunedin","Durban","Dushanbe","Edinburgh","Edmonton","El Paso","Entebbe","Erbil","Erzurum","Fairbanks","Fianarantsoa","Flores,  Petén","Frankfurt","Fresno","Fukuoka","Gaborone","Gabès","Gagnoa","Gangtok","Garissa","Garoua","George Town","Ghanzi","Gjoa Haven","Guadalajara","Guangzhou","Guatemala City","Halifax","Hamburg","Hamilton","Hanga Roa","Hanoi","Harare","Harbin","Hargeisa","Hat Yai","Havana","Helsinki","Heraklion","Hiroshima","Ho Chi Minh City","Hobart","Hong Kong","Honiara","Honolulu","Houston","Ifrane","Indianapolis","Iqaluit","Irkutsk","Istanbul","Jacksonville","Jakarta","Jayapura","Jerusalem","Johannesburg","Jos","Juba","Kabul","Kampala","Kandi","Kankan","Kano","Kansas City","Karachi","Karonga","Kathmandu","Khartoum","Kingston","Kinshasa","Kolkata","Kuala Lumpur","Kumasi","Kunming","Kuopio","Kuwait City","Kyiv","Kyoto","La Ceiba","La Paz","Lagos","Lahore","Lake Havasu City","Lake Tekapo","Las Palmas de Gran Canaria","Las Vegas","Launceston","Lhasa","Libreville","Lisbon","Livingstone","Ljubljana","Lodwar","Lomé","London","Los Angeles","Louisville","Luanda","Lubumbashi","Lusaka","Luxembourg City","Lviv","Lyon","Madrid","Mahajanga","Makassar","Makurdi","Malabo","Malé","Managua","Manama","Mandalay","Mango","Manila","Maputo","Marrakesh","Marseille","Maun","Medan","Mek'ele","Melbourne","Memphis","Mexicali","Mexico City","Miami","Milan","Milwaukee","Minneapolis","Minsk","Mogadishu","Mombasa","Monaco","Moncton","Monterrey","Montreal","Moscow","Mumbai","Murmansk","Muscat","Mzuzu","N'Djamena","Naha","Nairobi","Nakhon Ratchasima","Napier","Napoli","Nashville","Nassau","Ndola","New Delhi","New Orleans","New York City","Ngaoundéré","Niamey","Nicosia","Niigata","Nouadhibou","Nouakchott","Novosibirsk","Nuuk","Odesa","Odienné","Oklahoma City","Omaha","Oranjestad","Oslo","Ottawa","Ouagadougou","Ouahigouya","Ouarzazate","Oulu","Palembang","Palermo","Palm Springs","Palmerston North","Panama City","Parakou","Paris","Perth","Petropavlovsk-Kamchatsky","Philadelphia","Phnom Penh","Phoenix","Pittsburgh","Podgorica","Pointe-Noire","Pontianak","Port Moresby","Port Sudan","Port Vila","Port-Gentil","Portland (OR)","Porto","Prague","Praia","Pretoria","Pyongyang","Rabat","Rangpur","Reggane","Reykjavík","Riga","Riyadh","Rome","Roseau","Rostov-on-Don","Sacramento","Saint Petersburg","Saint-Pierre","Salt Lake City","San Antonio","San Diego","San Francisco","San Jose","San José","San Juan","San Salvador","Sana'a","Santo Domingo","Sapporo","Sarajevo","Saskatoon","Seattle","Seoul","Seville","Shanghai","Singapore","Skopje","Sochi","Sofia","Sokoto","Split","St. John's","St. Louis","Stockholm","Surabaya","Suva","Suwałki","Sydney","Ségou","Tabora","Tabriz","Taipei","Tallinn","Tamale","Tamanrasset","Tampa","Tashkent","Tauranga","Tbilisi","Tegucigalpa","Tehran","Tel Aviv","Thessaloniki","Thiès","Tijuana","Timbuktu","Tirana","Toamasina","Tokyo","Toliara","Toluca","Toronto","Tripoli","Tromsø","Tucson","Tunis","Ulaanbaatar","Upington","Vaduz","Valencia","Valletta","Vancouver","Veracruz","Vienna","Vientiane","Villahermosa","Vilnius","Virginia Beach","Vladivostok","Warsaw","Washington, D.C.","Wau","Wellington","Whitehorse","Wichita","Willemstad","Winnipeg","Wrocław","Xi'an","Yakutsk","Yangon","Yaoundé","Yellowknife","Yerevan","Yinchuan","Zagreb","Zanzibar City","Zürich","Ürümqi","İzmir"};

struct Stat { int64_t sum=0; uint32_t count=0; int16_t min=1000,max=-1000; };
alignas(64) uint32_t lookup[1<<BITS];std::vector<uint32_t> secondary;
inline unsigned hash(uint32_t w){
#if HASH == 0
return _mm_crc32_u32(0,w)&((1<<BITS)-1);
#elif HASH == 1
return (w*0x9e3779b9U)>>(32-BITS);
#else
return ((w*0x9e3779b9U)^(w>>12))&((1<<BITS)-1);
#endif
}
uint32_t tree(std::vector<int> ids){if(ids.size()==1)return (strlen(names[ids[0]])<<16)|ids[0];unsigned minlen=1000;for(int i:ids)minlen=std::min<unsigned>(minlen,strlen(names[i]));int best=0,bestscore=1000000;for(unsigned pos=0;pos<=minlen;pos++){int cnt[256]={};for(int i:ids)cnt[(unsigned char)(names[i][pos]?names[i][pos]:';')]++;int score=0;for(int n:cnt)score+=n*n;if(score<bestscore){bestscore=score;best=pos;}}
 unsigned base=secondary.size();secondary.resize(base+256);for(int c=0;c<256;c++){std::vector<int>sub;for(int i:ids)if((unsigned char)(names[i][best]?names[i][best]:';')==c)sub.push_back(i);if(!sub.empty()){auto code=tree(sub);secondary[base+c]=code;}}return 0x80000000u|(best<<24)|base;
}
inline uint32_t identify(const char*p){uint32_t w;memcpy(&w,p,4);uint32_t code=lookup[hash(w)];while(code&0x80000000u)code=secondary[(code&0xffffff)+(unsigned char)p[(code>>24)&127]];return code;}
inline void row(const char*&p,Stat*tab){uint32_t code=identify(p);p+=(code>>16)+1;uint64_t w;memcpy(&w,p,8);unsigned dot=__builtin_ctzll(~w&0x10101000);int64_t sign=(int64_t)(~w<<59)>>63;uint64_t digits=((w&~(sign&0xff))<<(28-dot))&0x0f000f0f00ULL;int v=(((digits*0x640a0001ULL)>>32)&0x3ff);v=(v^sign)-sign;p+=(dot>>3)+3;auto&e=tab[code&65535];e.sum+=v;e.count++;e.min=std::min<int>(e.min,v);e.max=std::max<int>(e.max,v);}
void process(const char*data,size_t start,size_t span,Stat*tab,bool prefix=false){
 const char*ps[STREAMS];const char*es[STREAMS];for(int s=0;s<STREAMS;s++){size_t a=start+span*s/STREAMS,b=start+span*(s+1)/STREAMS;while((a||prefix)&&data[a-1]!='\n')a++;while((b||prefix)&&data[b-1]!='\n')b++;ps[s]=data+a;es[s]=data+b;}
 for(;;){bool done=false;for(int s=0;s<STREAMS;s++)if(ps[s]>=es[s])done=true;if(done)break;for(int s=0;s<STREAMS;s++)row(ps[s],tab);}for(int s=0;s<STREAMS;s++)while(ps[s]<es[s])row(ps[s],tab);
}
int main(int argc,char**argv){if(argc!=2)return 1;int fd=open(argv[1],O_RDONLY);struct stat st;if(fd<0||fstat(fd,&st))return 1;size_t size=st.st_size;if(!size){printf("{}");return 0;}const char*data=(char*)mmap(0,size,PROT_READ,MAP_PRIVATE,fd,0);if(data==MAP_FAILED)return 1;
 std::vector<int> buckets[1<<BITS];for(int i=0;i<413;i++){std::string s=std::string(names[i])+";";uint32_t w;memcpy(&w,s.data(),4);buckets[hash(w)].push_back(i);}for(int i=0;i<(1<<BITS);i++)if(!buckets[i].empty())lookup[i]=tree(buckets[i]);
 size_t safe=size>128?size-128:0;while(safe&&data[safe-1]!='\n')safe--;std::string tail(data+safe,size-safe);tail.resize(tail.size()+64,0);
 bool cold=false;
 #if MODE < 0
 if(size>(1ULL<<29)){unsigned resident=0;for(size_t i=0;i<128;i++){size_t off=(size*i/128)&~4095ULL;unsigned char vec=0;if(!mincore((void*)(data+off),1,&vec))resident+=(vec&1)!=0;}cold=resident<120;}
 #else
 cold=MODE;
 #endif
 if(cold){
 #if READ_ADVICE & 1
 posix_fadvise(fd,0,size,POSIX_FADV_SEQUENTIAL);
 #endif
 #if READ_ADVICE & 2
 posix_fadvise(fd,0,size,POSIX_FADV_NOREUSE);
 #endif
 }
 int workers=cold?COLD_WORKERS:WORKERS;std::vector<std::vector<Stat>>tables(workers);std::vector<std::thread>threads;
 for(int t=0;t<workers;t++)threads.emplace_back([&,t]{auto&tab=tables[t];tab.resize(413);
 if(!cold){size_t start=safe*t/workers,finish=safe*(t+1)/workers;process(data,start,finish-start,tab.data());if(t==0){const char*p=tail.data();while(p<tail.data()+size-safe)row(p,tab.data());}}
 else{size_t cap=(1ULL<<BLOCK)+4096;char*buffer=(char*)mmap(0,cap,PROT_READ|PROT_WRITE,MAP_PRIVATE|MAP_ANONYMOUS,-1,0);if(buffer==MAP_FAILED)exit(2);madvise(buffer,cap,MADV_HUGEPAGE);size_t finish=size*(t+1)/workers;for(size_t start=size*t/workers;start<finish;start+=1ULL<<BLOCK){size_t span=std::min<size_t>(1ULL<<BLOCK,finish-start),off=start?start-1:0,need=std::min<size_t>(size-off,span+128),got=0;char*dest=buffer+64-(start!=0);while(got<need){ssize_t n=pread(fd,dest+got,need-got,off+got);if(n<=0)exit(2);got+=n;}memset(dest+got,0,64);process(buffer+64,0,span,tab.data(),start!=0);}munmap(buffer,cap);}
 });for(auto&t:threads)t.join();
 auto value=[](long long v){if(v<0){putchar('-');v=-v;}printf("%lld.%lld",v/10,v%10);};putchar('{');bool first=true;for(int i=0;i<413;i++){Stat e;for(auto&tab:tables){auto&x=tab[i];e.sum+=x.sum;e.count+=x.count;e.min=std::min(e.min,x.min);e.max=std::max(e.max,x.max);}if(!e.count)continue;if(!first)printf(", ");first=false;printf("%s=",names[i]);value(e.min);putchar('/');long long a=llabs(e.sum),mean=(a+e.count/2)/e.count;if(e.sum<0)mean=-mean;value(mean);putchar('/');value(e.max);}putchar('}');}

