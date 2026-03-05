#!/usr/bin/env python3
import os, re, json, time, requests
from pathlib import Path
from deep_translator import GoogleTranslator

BASE = Path('/Users/seonah/.openclaw/workspace-tiktok-ctk-ops/out/reddit')


def latest_report_path():
    files=[p for p in BASE.glob('reddit_daily_report_*.json') if '_translated' not in p.name and '_enriched' not in p.name]
    if not files:
        raise SystemExit('no report json')
    files.sort(key=lambda p:p.stat().st_mtime, reverse=True)
    return files[0]


def post_image_url(permalink_url:str):
    try:
        r=requests.get(permalink_url+'.json', headers={'User-Agent':'openclaw-social-dashboard/0.1'}, timeout=20)
        arr=r.json()
        post=arr[0]['data']['children'][0]['data']
        prev=(post.get('preview') or {}).get('images') or []
        if prev:
            u=prev[0].get('source',{}).get('url')
            if u: return u.replace('&amp;','&')
        thumb=post.get('thumbnail')
        if isinstance(thumb,str) and thumb.startswith('http'): return thumb
        u=post.get('url_overridden_by_dest') or post.get('url')
        if isinstance(u,str) and re.search(r'\.(jpg|jpeg|png|webp)$',u,re.I): return u
    except Exception:
        return ''
    return ''


def llm_insight(title:str, body:str):
    key=os.getenv('OPENAI_API_KEY','').strip()
    if not key:
        return [], []
    prompt=f'''You are analyzing Reddit skincare/wellness posts for a brand validating disposable pillowcase solution.
Return strict JSON with keys: categories (array from ["인식","루틴","강박","대체솔루션"]), insight_notes (1-3 bullets in Korean, concrete and post-specific).
Post title: {title}\nPost body: {body[:2500]}'''
    try:
        rr=requests.post('https://api.openai.com/v1/chat/completions',
            headers={'Authorization':f'Bearer {key}','Content-Type':'application/json'},
            json={'model':'gpt-4o-mini','messages':[{'role':'user','content':prompt}], 'temperature':0.2}, timeout=30)
        txt=rr.json()['choices'][0]['message']['content']
        m=re.search(r'\{[\s\S]*\}',txt)
        obj=json.loads(m.group(0) if m else txt)
        cats=[c for c in obj.get('categories',[]) if c in ['인식','루틴','강박','대체솔루션']]
        notes=[n for n in obj.get('insight_notes',[]) if isinstance(n,str)]
        return cats[:4], notes[:3]
    except Exception:
        return [], []


def main():
    src=latest_report_path()
    data=json.load(open(src))
    tr=GoogleTranslator(source='en', target='ko')

    out=[]
    for sub, posts in (data.get('subreddits') or {}).items():
        for p in posts:
            key=f"{sub}:{p.get('id') or p.get('url')}"
            title=p.get('title','')
            body=(p.get('selftext') or '')
            try:
                title_ko=tr.translate(title) if title else ''
                body_ko=tr.translate(body[:3500]) if body else ''
            except Exception:
                title_ko=title
                body_ko=body

            image_url=post_image_url(p.get('url','')) if p.get('url') else ''
            cats, notes = llm_insight(title, body)
            out.append({
                'key':key,
                'title_ko':title_ko,
                'body_ko':body_ko,
                'image_url':image_url,
                'categories':cats,
                'insight_notes':notes,
            })
            time.sleep(0.2)

    out_path=src.with_name(src.stem + '_enriched.json')
    json.dump(out, open(out_path,'w'), ensure_ascii=False, indent=2)
    print(out_path)


if __name__=='__main__':
    main()
