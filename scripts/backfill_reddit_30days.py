#!/usr/bin/env python3
import json, os, re, time, requests
from datetime import datetime, timezone, timedelta
from pathlib import Path
from deep_translator import GoogleTranslator

OUT = Path('/Users/seonah/.openclaw/workspace-tiktok-ctk-ops/out/reddit')
OUT.mkdir(parents=True, exist_ok=True)

subs=["acne","SkincareAddiction","Bedding","Sleep","hygiene","CleaningTips"]
q='("pillowcase" OR "bedding" OR "acne" OR "breakout" OR "disposable pillowcase" OR "towel on pillow" OR "silk pillowcase" OR "germaphobia")'
headers={"User-Agent":"openclaw-reddit-backfill/0.1"}
tr=GoogleTranslator(source='en', target='ko')

start = datetime.now(timezone.utc) - timedelta(days=30)

by_day = {}

for sub in subs:
    url=f"https://www.reddit.com/r/{sub}/search.json"
    params={"q":q,"restrict_sr":"on","sort":"new","t":"month","limit":100}
    try:
        data=requests.get(url,headers=headers,params=params,timeout=25).json()["data"]["children"]
    except Exception:
        data=[]
    posts=[]
    for c in data:
        d=c.get('data',{})
        ts=d.get('created_utc',0)
        if not ts: continue
        dt=datetime.fromtimestamp(ts, tz=timezone.utc)
        if dt < start: continue
        title=d.get('title','')
        body=d.get('selftext','') or ''
        key=f"{sub}:{d.get('id') or d.get('permalink','')}"
        post={
            "id":d.get('id'),"title":title,"url":f"https://reddit.com{d.get('permalink','')}",
            "ups":d.get('ups',0),"comments":d.get('num_comments',0),"created_utc":ts,
            "selftext":body[:3500],"score": (d.get('ups',0)*0.4 + d.get('num_comments',0)*0.6),
            "keyword_relevance":1,"keyword_hits":[],"source_mix":"search",
            "key": key,
        }
        posts.append(post)
    # keep top 12/day/sub candidate later
    for p in posts:
        day=datetime.fromtimestamp(p['created_utc'],tz=timezone.utc).strftime('%Y-%m-%d')
        by_day.setdefault(day, {}).setdefault(sub, []).append(p)
    time.sleep(0.4)

for day, submap in by_day.items():
    report={"generated_at": datetime.now().isoformat(), "subreddits": {}}
    enriched={"generated_at": datetime.now().isoformat(), "subreddits": {}, "enriched_at": datetime.now().isoformat()}

    for sub, posts in submap.items():
        posts=sorted(posts, key=lambda x:x['score'], reverse=True)[:12]
        report['subreddits'][sub]=posts
        eposts=[]
        for p in posts:
            title=p.get('title','')
            body=p.get('selftext','')
            try:
                title_ko=tr.translate(title) if title else ''
            except Exception:
                title_ko=title
            try:
                body_ko=tr.translate(body[:3000]) if body else ''
            except Exception:
                body_ko=body
            eposts.append({
                **p,
                "title_ko": title_ko,
                "body_ko": body_ko,
                "image_url": "",
                "categories": [],
                "situation_note": "본문 중심으로 상황을 파악 중이며, 댓글 맥락은 상세 수집 시 보강 필요",
                "comment_note": "백필 데이터는 댓글 원문을 별도 확장 수집하지 않음",
                "insight_notes": ["최근 30일 내 관련 이슈로 분류된 포스트", "세부 인사이트는 당일 파이프라인에서 댓글 기반으로 강화됨"],
            })
        enriched['subreddits'][sub]=eposts

    base_path=OUT / f"reddit_daily_report_{day}.json"
    enr_path=OUT / f"reddit_daily_report_{day}_enriched.json"
    with open(base_path,'w') as f: json.dump(report,f,ensure_ascii=False,indent=2)
    with open(enr_path,'w') as f: json.dump(enriched,f,ensure_ascii=False,indent=2)

print(f"wrote {len(by_day)} days")