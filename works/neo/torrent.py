#!/usr/bin/env python3
import sys,re,ssl,urllib.request,urllib.parse,http.cookiejar,base64,time,json,gzip,os
from urllib.parse import urljoin,unquote
from concurrent.futures import ThreadPoolExecutor,as_completed
COOKIE_FILE="bilibili_cookies.txt"
MAX_WORKERS=8
SITES={
"dygang":{"name":"电影港","base":"https://www.dygang.tv","sp":"/e/search/index.php","spa":{"keyboard":"{q}","show":"title,smalltext","tempid":"1","tbname":"article","Submit":"搜索"},"dp":r'href\s*=\s*["\']([^"\']*(?:/ys/|/bd/|/gy/|/gp/|/dsj/|/dsj1/|/yx/|/zy/|/dmq/|/jilupian/|/1080p/|/720P/|/SCR/|/4K/|/3d/|/dyzt/)[^"\']*\.html?)["\']',"tc":r'\s*[-_|]\s*电影港.*$'},
"hao6v":{"name":"6v电影","base":"https://www.hao6v.cc","sp":"/e/search/index.php","spa":{"keyboard":"{q}","show":"title,smalltext","tempid":"1","tbname":"article","x":"0","y":"0"},"dp":None,"tc":r'\s*[-_|]\s*(?:6v|hao6v).*$'},
"clg":{"name":"磁力狗","base":"https://163.192.2.126:12580","t":"mg"},
"sobt":{"name":"Sobt","base":"https://sobt.me","t":"mg"},
"clm":{"name":"磁力猫","base":"https://154.17.225.115:10010","t":"mg"},
"hdzu":{"name":"高清族","base":"https://hdzu.org","t":"hdzu"},
"mp4ba":{"name":"MP4吧","base":"https://www.mp4ba.vip","t":"mp4ba"},
"seedhub":{"name":"SeedHub","base":"http://104.243.25.80","t":"seedhub"},
}
H={"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36","Accept":"text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8","Accept-Language":"zh-CN,zh;q=0.9,en;q=0.8"}
BH={"User-Agent":H["User-Agent"],"Referer":"https://www.bilibili.com/"}
T=30
SC=ssl.create_default_context()
SC.check_hostname=False
SC.verify_mode=False
def he(e):
 try:"测试".encode(e);return True
 except:return False
SE=[e for e in["gb2312","gb18030","gbk","utf-8"]if he(e)]or["utf-8"]
DE=["gb2312","gbk","gb18030","utf-8","big5"]
def sd(r,h):
 ct=h.get("Content-Type","")
 m=re.search(r'charset\s*=\s*([^\s;]+)',ct,re.I)
 if m:
  try:return r.decode(m.group(1).strip().lower())
  except:pass
 for e in DE:
  try:return r.decode(e)
  except:continue
 return r.decode("latin-1")
cj=http.cookiejar.CookieJar()
op=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj),urllib.request.HTTPSHandler(context=SC))
def hg(url,data=None,referer=None,ar=True,eh=None,ub=False):
 rh=BH.copy()if ub else H.copy()
 if eh:rh.update(eh)
 req=urllib.request.Request(url,headers=rh,data=data)
 if referer:req.add_header("Referer",referer)
 try:
  r=urllib.request.urlopen(req,timeout=T,context=SC)if ar else urllib.request.build_opener(urllib.request.HTTPRedirectHandler(),urllib.request.HTTPCookieProcessor(cj),urllib.request.HTTPSHandler(context=SC)).open(req,timeout=T)
  raw=r.read()
  if r.headers.get("Content-Encoding")=="gzip":raw=gzip.decompress(raw)
  if ar and r.status in(301,302,303,307):return r.status,r.getheader("Location")
  return r.status,sd(raw,r.headers)
 except urllib.error.HTTPError as e:return e.code,str(e)
 except Exception as e:return None,str(e)
def jd(html):
 if not isinstance(html,str):return html
 m=re.search(r'window\.atob\("([^"]+)"\)',html)
 if m:
  try:d=base64.b64decode(m.group(1)).decode("utf-8");return urllib.parse.unquote(d)
  except:pass
 return html
def el(html,bu):
 if not isinstance(html,str):return{"magnet":set(),"ed2k":set(),"thunder":set(),"torrent":set()}
 mg=set(re.findall(r'magnet:\?xt=urn:btih:[a-fA-F0-9]{40}[^\s"\'<>]*',html,re.I))
 ed=set(re.findall(r'ed2k://[^\s"\'<>]+',html,re.I))
 th=set(re.findall(r'thunder://[^\s"\'<>]+',html,re.I))
 to=set()
 for m in re.finditer(r'href\s*=\s*["\']([^"\']+\.torrent)["\']',html,re.I):
  l=m.group(1)
  if not l.startswith("http"):l=urljoin(bu,l)
  to.add(l)
 return{"magnet":mg,"ed2k":ed,"thunder":th,"torrent":to}
def gt(html,sc,mgs=None):
 if not isinstance(html,str):return"未知标题"
 m=re.search(r'<title>(.*?)</title>',html,re.I|re.S)
 if m:
  t=m.group(1).strip()
  cl=sc.get("tc")
  if cl:t=re.sub(cl,'',t,flags=re.I).strip()
  if t and t!="无标题":return t
 if mgs:
  for mg in mgs:
   m=re.search(r'dn=([^&]+)',mg)
   if m:
    try:return unquote(m.group(1))
    except:pass
 return"未知标题"
def load_cookies_from_netscape(filepath):
 cj=http.cookiejar.CookieJar()
 if not os.path.exists(filepath):return cj
 with open(filepath,"r",encoding="utf-8")as f:
  for line in f:
   line=line.strip()
   if not line or line.startswith("#"):continue
   parts=line.split("\t")
   if len(parts)<7:continue
   domain,flag,path,secure,expires,name,value=parts[0],parts[1],parts[2],parts[3],parts[4],parts[5],parts[6]
   cookie=http.cookiejar.Cookie(version=0,name=name,value=value,port=None,port_specified=False,domain=domain,domain_specified=domain.startswith('.'),domain_initial_dot=domain.startswith('.'),path=path,path_specified=True,secure=(secure=="TRUE"),expires=int(expires)if expires!="0"else None,discard=False,comment=None,comment_url=None,rest={"HttpOnly":None},rfc2109=False)
   cj.set_cookie(cookie)
 print(f"已加载 {len(cj)} 个Cookie")
 return cj
def search_bilibili_api(query,bili_cj):
 if len(bili_cj)==0:return[]
 opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(bili_cj),urllib.request.HTTPSHandler(context=SC))
 params={"keyword":query,"search_type":"video","page":1,"order":"totalrank"}
 url="https://api.bilibili.com/x/web-interface/search/all/v2?"+urllib.parse.urlencode(params)
 req=urllib.request.Request(url,headers={"User-Agent":BH["User-Agent"],"Referer":"https://www.bilibili.com/","Accept":"application/json, text/plain, */*"})
 try:
  with opener.open(req,timeout=T)as resp:data=json.loads(resp.read().decode("utf-8"))
 except Exception as e:print(f"[B站] API失败: {e}");return[]
 if data.get("code")!=0:print(f"[B站] API错误: {data.get('message')}");return[]
 video_list=[]
 for item in data.get("data",{}).get("result",[]):
  if item.get("result_type")=="video":video_list=item.get("data",[]);break
 BLX=["解说","攻略","剧情流程","评测","我的世界","乐高","一口气看完","合集","混剪","mod","MOD","试玩","体验","直播","录播","通关","流程","游戏电影","互动电影","实况","剪辑","狗粮"]
 results=[]
 for v in video_list:
  title=v.get("title","").replace('<em class="keyword">','').replace('</em>','')
  bvid=v.get("bvid","")
  d=v.get("duration","0:0").split(":")
  sec=int(d[0])*60+int(d[1])if len(d)==2 else int(d[0])*3600+int(d[1])*60+int(d[2])if len(d)==3 else 0
  if sec<900 or any(w.lower()in title.lower()for w in BLX):continue
  results.append(("B站","bilibili",f"{title} ({format_duration(sec)})",f"https://www.bilibili.com/video/{bvid}"))
 return results
def format_duration(sec):
 m,s=divmod(sec,60)
 h,m=divmod(m,60)
 return f"{h}:{m:02d}:{s:02d}"if h else f"{m}:{s:02d}"
def sdg(q):
 s=SITES["dygang"];b=s["base"];su=b+s["sp"]
 st0,ht0=hg(b)
 if st0!=200:print(f"  电影港首页状态码: {st0}")
 pa={k:v.replace("{q}",q)for k,v in s["spa"].items()}
 for e in SE:
  try:pd_data=urllib.parse.urlencode(pa,encoding=e).encode(e)
  except:continue
  ex={"Content-Type":f"application/x-www-form-urlencoded; charset={e}"}
  st,re_=hg(su,data=pd_data,referer=b,ar=False,eh=ex)
  if st is None or not isinstance(re_,str):continue
  if re_.startswith("/"):
   ru=b+re_ if re_.startswith("/")else re_
   st2,ht=hg(ru,referer=su)
   if isinstance(ht,str)and("搜索"in ht or"高级搜索"in ht):return ht
   else:print(f"  电影港重定向后状态:{st2} 长度:{len(ht)if ht else 0}")
  elif"搜索"in re_ or"高级搜索"in re_:return re_
  else:print(f"  电影港返回非预期 状态:{st} 长度:{len(re_)}")
 return None
def sh6(q):
 s=SITES["hao6v"];b=s["base"];su=b+s["sp"]
 st0,ht0=hg(b)
 if st0!=200:print(f"  6v首页状态码: {st0}")
 pa={k:v.replace("{q}",q)for k,v in s["spa"].items()}
 for e in SE:
  try:pd_data=urllib.parse.urlencode(pa,encoding=e).encode(e)
  except:continue
  ex={"Content-Type":f"application/x-www-form-urlencoded; charset={e}"}
  st,re_=hg(su,data=pd_data,referer=b,ar=False,eh=ex)
  if st is None or not isinstance(re_,str):continue
  if re_.startswith("/"):
   ru=b+re_ if re_.startswith("/")else re_
   st2,ht=hg(ru,referer=su)
   if isinstance(ht,str)and("搜索"in ht or"高级搜索"in ht):return ht
   else:print(f"  6v重定向后状态:{st2} 长度:{len(ht)if ht else 0}")
  elif"搜索"in re_ or"高级搜索"in re_:return re_
  elif"系统限制"in re_:print("  hao6v 频率限制，等待10秒...");time.sleep(10)
  else:print(f"  6v返回非预期 状态:{st} 长度:{len(re_)}")
 return None
def gdu_d(ht):
 p=SITES["dygang"]["dp"];b=SITES["dygang"]["base"];us=set()
 for m in re.finditer(p,ht,re.I):
  l=m.group(1)
  if not l.startswith("http"):l=urljoin(b,l)
  us.add(l)
 if not us:
  for m in re.finditer(r'href\s*=\s*["\']([^"\']+\.html?)["\']',ht,re.I):
   l=m.group(1)
   if"search"not in l and"gbook"not in l:us.add(urljoin(b,l))
 return list(us)[:15]
def gdu_h(ht):
 b=SITES["hao6v"]["base"];us=[]
 for m in re.finditer(r'<a\s[^>]*href\s*=\s*"([^"]*)"[^>]*>(.*?)</a>',ht,re.I|re.S):
  h=m.group(1)
  if re.match(r'/(?:dy|zydy|gq|gydy|jddy|3D|shoujidianyingmp4|dlz|mj|rj)/\d{4}-\d{2}-\d{2}/\d+\.html?',h):us.append(urljoin(b,h))
 return us
def grb(su):
 req=urllib.request.Request(su,headers=H)
 try:
  with op.open(req,timeout=T)as r:return r.geturl().rstrip("/")if r.status==200 else None
 except:return None
def smg(q,su,sp="/search?word="):
 b=grb(su)
 if not b:return None
 b64=base64.b64encode(q.encode("utf-8")).decode()
 for u in[f"{b}{sp}{b64}",f"{b}/q/{b64}"]:
  st,ht=hg(u)
  if st==200 and isinstance(ht,str)and len(ht)>500:
   ht=jd(ht)
   if len(ht)>500:return ht
 return None
def gmd(ht,bu):
 us=set()
 for m in re.finditer(r'href="(/information/[a-z0-9]+)"',ht,re.I):us.add(urljoin(bu,m.group(1)))
 for m in re.finditer(r'href="(/torrent/[a-f0-9]+\.html)"',ht,re.I):us.add(urljoin(bu,m.group(1)))
 if not us:
  for m in re.finditer(r'href="(/information/[a-z0-9]{30,})"',ht,re.I):us.add(urljoin(bu,m.group(1)))
 return list(us)
def gmf(u):
 st,ht=hg(u)
 if not isinstance(ht,str)or st!=200:return None,None
 ht=jd(ht)
 tm=re.search(r'<h1 class="Information_title">(.*?)</h1>',ht,re.I|re.S)or re.search(r'<title>(.*?)</title>',ht,re.I|re.S)
 ti=tm.group(1).strip()if tm else"未知标题"
 mm=re.search(r'<input[^>]+id="m_link"[^>]+value="(magnet:\?xt=urn:btih:[a-fA-F0-9]{40}[^"]*)"',ht,re.I)or re.search(r'<a[^>]+class="(?:download|Information_magnet)"[^>]+href="(magnet:\?xt=urn:btih:[a-fA-F0-9]{40}[^"]*)"',ht,re.I)
 mg=mm.group(1)if mm else None
 return ti,mg
def gsm(u):
 st,ht=hg(u)
 if not isinstance(ht,str)or st!=200:return None,None
 ht=jd(ht)
 tm=re.search(r'<h1 class="res-title">(.*?)</h1>',ht,re.I|re.S)or re.search(r'<title>(.*?)</title>',ht,re.I|re.S)
 ti=tm.group(1).strip()if tm else"未知标题"
 mm=re.search(r'<input[^>]+id="m_link"[^>]+value="(magnet:\?xt=urn:btih:[a-fA-F0-9]{40})"',ht,re.I)or re.search(r'href="(magnet:\?xt=urn:btih:[a-fA-F0-9]{40})"',ht,re.I)
 mg=mm.group(1)if mm else None
 return ti,mg
def search_dygang(q):
 results=[]
 ht=sdg(q)
 if isinstance(ht,str):
  us=gdu_d(ht)
  for u in us:
   st_pg,pg=hg(u)
   if not isinstance(pg,str):continue
   ls=el(pg,u)
   t=gt(pg,SITES["dygang"],ls["magnet"])
   for tp in["magnet","ed2k","thunder","torrent"]:
    for l in ls[tp]:results.append(("电影港",tp,t,l))
   time.sleep(0.1)
 return results
def search_hao6v(q):
 results=[]
 ht=sh6(q)
 if isinstance(ht,str):
  us=gdu_h(ht)
  for u in us:
   st_pg,pg=hg(u)
   if not isinstance(pg,str):continue
   ls=el(pg,u)
   t=gt(pg,SITES["hao6v"],ls["magnet"])
   for tp in["magnet","ed2k","thunder","torrent"]:
    for l in ls[tp]:results.append(("6v电影",tp,t,l))
   time.sleep(0.1)
 return results
def search_magnet(site_key,q):
 results=[]
 su=SITES[site_key]["base"];name=SITES[site_key]["name"]
 sp="/q/"if site_key=="sobt" else"/search?word="
 ht=smg(q,su,sp)
 if not isinstance(ht,str)and site_key=="sobt":ht=smg(q,su,"/search?word=")
 if isinstance(ht,str):
  bu=grb(su)or su
  us=gmd(ht,bu)
  for u in us[:30]:
   if site_key=="sobt":t,mg=gsm(u)
   else:t,mg=gmf(u)
   if mg:results.append((name,"magnet",t,mg))
   time.sleep(0.2)
 return results
def search_hdzu(q):
 results=[]
 u="https://hdzu.org/movie/filter?act=title&wd="+urllib.parse.quote(q)
 st,ht=hg(u)
 if st==200 and isinstance(ht,str):
  lm=re.search(r'<ul[^>]*id="list-topic"[^>]*>(.*?)</ul>',ht,re.I|re.S)
  if lm:ls=re.findall(r'<a href="(/t/\d+)"',lm.group(1))
  else:ls=re.findall(r'<a href="(/t/\d+)"',ht)
  for u in[urljoin("https://hdzu.org",l)for l in ls]:
   st2,ht2=hg(u)
   if not isinstance(ht2,str)or st2!=200:continue
   tm=re.search(r'<title>(.*?)</title>',ht2,re.I|re.S)
   ti=tm.group(1).strip()if tm else"未知标题"
   ti=re.sub(r'\s*[-|]\s*高清族.*$','',ti).strip()
   mg=set(re.findall(r'magnet:\?xt=urn:btih:[a-fA-F0-9]{40}[^\s"\'<>]*',ht2,re.I))
   ed=set(re.findall(r'ed2k://[^\s"\'<>]+',ht2,re.I))
   th=set(re.findall(r'thunder://[^\s"\'<>]+',ht2,re.I))
   to=set(re.findall(r'href="([^"]+\.torrent)"',ht2,re.I))
   for l in mg:results.append(("高清族","magnet",ti,l))
   for l in ed:results.append(("高清族","ed2k",ti,l))
   for l in th:results.append(("高清族","thunder",ti,l))
   for l in to:results.append(("高清族","torrent",ti,l))
   time.sleep(0.2)
 return results
def search_mp4ba(q):
 results=[]
 b=SITES["mp4ba"]["base"]
 hg(b)
 params=urllib.parse.urlencode({"s":q})
 url=f"{b}/?{params}"
 html=hg(url)
 if not html:return results
 for _ in range(5):
  if"人机验证"not in html:break
  adds=re.findall(r'(\d+)\s*\+\s*(\d+)\s*',html)
  if adds:
   ans=sum(int(a)+int(b)for a,b in adds)
   post_data=urllib.parse.urlencode({"s":q,"result":str(ans)}).encode("utf-8")
   html=hg(url,data=post_data,referer=url,eh={"Content-Type":"application/x-www-form-urlencoded"})
   if not html:return results
  else:return results
 if isinstance(html,str)and"人机验证"not in html:
  us=set()
  for m in re.finditer(r'href="(/item/\d+)"',html,re.I):us.add(urljoin(b,m.group(1)))
  for u in list(us)[:10]:
   st2,ht2=hg(u)
   if not isinstance(ht2,str)or st2!=200:continue
   tm=re.search(r'<title>(.*?)</title>',ht2,re.I|re.S)
   ti=tm.group(1).strip().replace(" 下载 - 高清Mp4吧","").strip()if tm else"未知标题"
   mg=set(re.findall(r'magnet:\?xt=urn:btih:[a-fA-F0-9]{40}[^\s"\'<>]*',ht2,re.I))
   ed=set(re.findall(r'ed2k://[^\s"\'<>]+',ht2,re.I))
   th=set(re.findall(r'thunder://[^\s"\'<>]+',ht2,re.I))
   to=set(re.findall(r'href="([^"]+\.torrent)"',ht2,re.I))
   for l in mg:results.append(("MP4吧","magnet",ti,l))
   for l in ed:results.append(("MP4吧","ed2k",ti,l))
   for l in th:results.append(("MP4吧","thunder",ti,l))
   for l in to:results.append(("MP4吧","torrent",ti,l))
   time.sleep(0.2)
 return results
def search_seedhub(q):
 results=[]
 b=SITES["seedhub"]["base"]
 url=f"{b}/s/{urllib.parse.quote(q)}/"
 st,ht=hg(url)
 if st!=200 or not isinstance(ht,str):return results
 us=set()
 for m in re.finditer(r'href="(/movies/\d+/)"',ht,re.I):us.add(urljoin(b,m.group(1)))
 for u in us:
  st2,ht2=hg(u)
  if not isinstance(ht2,str)or st2!=200:continue
  title_m=re.search(r'<title>(.*?) - SeedHub',ht2,re.I)
  title=title_m.group(1).strip()if title_m else"未知标题"
  seed_ids=set()
  for sm in re.finditer(r'seed_id=(\d+)',ht2):seed_ids.add(sm.group(1))
  magnets=set(re.findall(r'magnet:\?xt=urn:btih:[a-fA-F0-9]{40}[^\s"\'<>]*',ht2,re.I))
  for sid in list(seed_ids)[:5]:
   link_url=f"{b}/link_start/?seed_id={sid}&movie_title={urllib.parse.quote(title)}"
   st3,ht3=hg(link_url,referer=u)
   if isinstance(ht3,str):
    m=re.search(r'const\s+data\s*=\s*"([^"]+)"',ht3)
    if m:
     try:decoded=base64.b64decode(m.group(1)).decode("utf-8");magnets.add(decoded)if decoded.startswith("magnet:")else None
     except:pass
    magnets.update(re.findall(r'magnet:\?xt=urn:btih:[a-fA-F0-9]{40}[^\s"\'<>]*',ht3,re.I))
   time.sleep(0.2)
  for mg in magnets:results.append(("SeedHub","magnet",title,mg))
  time.sleep(0.2)
 return results
def ag(q,bili_cj):
 tasks={
  "bilibili":lambda:search_bilibili_api(q,bili_cj),
  "dygang":lambda:search_dygang(q),
  "hao6v":lambda:search_hao6v(q),
  "clg":lambda:search_magnet("clg",q),
  "sobt":lambda:search_magnet("sobt",q),
  "clm":lambda:search_magnet("clm",q),
  "hdzu":lambda:search_hdzu(q),
  "mp4ba":lambda:search_mp4ba(q),
  "seedhub":lambda:search_seedhub(q),
 }
 all_results=[]
 with ThreadPoolExecutor(max_workers=MAX_WORKERS)as executor:
  future_to_site={executor.submit(task):name for name,task in tasks.items()}
  for future in as_completed(future_to_site):
   site=future_to_site[future]
   try:
    res=future.result()
    if res:print(f"[{site}] {len(res)}个结果");all_results.extend(res)
    else:print(f"[{site}] 无结果")
   except Exception as e:print(f"[{site}] 异常: {e}")
 dd={}
 for s,tp,ti,l in all_results:
  if l not in dd:dd[l]=(s,tp,ti)
 final=[(s,tp,ti,l)for l,(s,tp,ti)in dd.items()]
 return final
def pr(it):
 if not it:print("未找到任何下载链接。");return
 bi=[(t,l)for s,tp,t,l in it if tp=="bilibili"]
 ot=[(s,tp,t,l)for s,tp,t,l in it if tp!="bilibili"]
 if bi:
  print(f"\nB站视频 ({len(bi)}):")
  for i,(t,l)in enumerate(bi,1):print(f"  {i}. [{t}] {l}")
 bt={}
 for s,tp,t,l in ot:bt.setdefault(tp,[]).append((s,t,l))
 for tp in["magnet","ed2k","thunder","torrent"]:
  ls=bt.get(tp,[])
  if ls:
   print(f"\n{tp} ({len(ls)}):")
   for i,(s,t,l)in enumerate(ls,1):print(f"  {i}. [{s}] [{t}] {l}")
def main():
 print("="*60)
 print("聚合搜索 多线程版 B站+电影港+6v+磁力狗+Sobt+磁力猫+高清族+MP4吧+SeedHub")
 print(f"线程数:{MAX_WORKERS}")
 print("输入电影名自动搜索/粘贴URL/r重试/q退出")
 print("="*60)
 bili_cj=load_cookies_from_netscape(COOKIE_FILE)
 last=""
 while True:
  try:ui=input("\n电影名或URL: ").strip()
  except(EOFError,KeyboardInterrupt):break
  if ui.lower()=="q":break
  if ui.lower()=="r":
   if not last:print("没有上次搜索词");continue
   ui=last
  if not ui:continue
  if ui.startswith("http://")or ui.startswith("https://"):
   st,ht=hg(ui)
   if isinstance(ht,str):
    ht=jd(ht)
    ls=el(ht,ui)
    tm=re.search(r'<title>(.*?)</title>',ht,re.I|re.S)
    t=tm.group(1).strip()if tm else"未知"
    it=[]
    for tp in["magnet","ed2k","thunder","torrent"]:
     for l in ls[tp]:it.append(("手动",tp,t,l))
    print("\n"+"="*60)
    pr(it)
    print("="*60)
   else:print("无法访问该URL")
  else:
   last=ui
   it=ag(ui,bili_cj)
   print("\n"+"="*60)
   pr(it)
   print("="*60)
if __name__=="__main__":
 main()