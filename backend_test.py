import os
import time
import uuid
import requests

BASE = os.environ.get('NEXT_PUBLIC_BASE_URL', 'https://loop-feedback-ai.preview.emergentagent.com').rstrip('/')
API = f'{BASE}/api'
PASSWORD = 'loop-demo-2025'

def req(session, method, path, expected, **kwargs):
    try:
        r = session.request(method, API + path, timeout=30, **kwargs)
        ok = r.status_code in expected
        print(f"{'PASS' if ok else 'FAIL'} {method} {path}: HTTP {r.status_code}, expected {sorted(expected)} body={r.text[:220]}")
        return ok, r
    except Exception as e:
        print(f'FAIL {method} {path}: {e}')
        return False, None

def login_session(email):
    s = requests.Session()
    ok, r = req(s, 'GET', '/auth/csrf', {200})
    if not ok: return s, False
    csrf = r.json().get('csrfToken')
    ok, _ = req(s, 'POST', '/auth/callback/credentials', {200, 302}, data={
        'csrfToken': csrf, 'email': email, 'password': PASSWORD,
        'callbackUrl': BASE, 'json': 'true'
    }, allow_redirects=False, headers={'Content-Type': 'application/x-www-form-urlencoded'})
    ok2, r2 = req(s, 'GET', '/auth/session', {200})
    user = (r2.json() if r2 is not None and r2.text else {}).get('user') if ok2 else None
    return s, bool(ok and ok2 and user and user.get('email') == email)

def main():
    results = []
    anon = requests.Session()
    results.append(req(anon, 'GET', '/auth/providers', {200})[0])
    results.append(req(anon, 'GET', '/auth/session', {200})[0])
    results.append(req(anon, 'GET', '/feedback', {401})[0])
    results.append(req(anon, 'POST', '/feedback', {401}, json={'content':'Unauthorized feedback attempt','channel':'EMAIL'})[0])
    results.append(req(anon, 'GET', '/dashboard/stats', {401})[0])

    unique = f'phase1-{uuid.uuid4().hex[:10]}@example.com'
    signup_payload = {'name':'Jordan Lee','workspaceName':f'Phase One Workspace {uuid.uuid4().hex[:6]}','email':unique,'password':'SecurePhase1!2026'}
    results.append(req(anon, 'POST', '/auth/signup', {201}, json=signup_payload)[0])
    results.append(req(anon, 'POST', '/auth/login', {200}, json={'email':unique,'password':signup_payload['password']})[0])

    admin, admin_ok = login_session('admin@loop.demo'); results.append(admin_ok)
    analyst, analyst_ok = login_session('analyst@loop.demo'); results.append(analyst_ok)
    viewer, viewer_ok = login_session('viewer@loop.demo'); results.append(viewer_ok)
    if admin_ok:
        ok, feedback = req(admin, 'GET', '/feedback?page=1&limit=10', {200}); results.append(ok)
        if ok:
            body = feedback.json(); results.append(body.get('total') == 128 and len(body.get('items', [])) == 10 and body.get('page') == 1)
            fid = body['items'][0]['id'] if body.get('items') else ''
            results.append(req(admin, 'GET', f'/feedback?q=onboarding&limit=5', {200})[0])
            results.append(req(admin, 'GET', '/feedback?page=999&limit=10', {200})[0])
            okstats, stats = req(admin, 'GET', '/dashboard/stats', {200}); results.append(okstats)
            if okstats: results.append(stats.json().get('total') == 128)
            if fid:
                results.append(req(admin, 'GET', f'/feedback?q={fid}', {200})[0])
        results.append(req(admin, 'POST', '/feedback', {201}, json={'content':'Admin captured a clear onboarding insight','channel':'EMAIL','customerLabel':'Acme pilot'})[0])
    if analyst_ok:
        results.append(req(analyst, 'POST', '/feedback', {201}, json={'content':'Analyst captured a reliability insight','channel':'INTERCOM'})[0])
    if viewer_ok:
        results.append(req(viewer, 'GET', '/feedback?limit=3', {200})[0])
        results.append(req(viewer, 'GET', '/dashboard/stats', {200})[0])
        results.append(req(viewer, 'POST', '/feedback', {403}, json={'content':'Viewer must not ingest','channel':'EMAIL'})[0])
    print(f'RESULT: {sum(results)}/{len(results)} checks passed')
    return 0 if all(results) else 1

if __name__ == '__main__': raise SystemExit(main())
