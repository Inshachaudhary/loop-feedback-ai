import os
import requests

BASE = os.environ.get("NEXT_PUBLIC_BASE_URL", "https://loop-feedback-ai.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"


def check(name, method, path, expected, **kwargs):
    try:
        response = requests.request(method, f"{API}{path}", timeout=20, **kwargs)
        ok = response.status_code in expected
        print(f"{'PASS' if ok else 'FAIL'} {name}: HTTP {response.status_code}, expected {sorted(expected)}; body={response.text[:300]}")
        return ok, response
    except Exception as exc:
        print(f"FAIL {name}: {exc}")
        return False, None


def main():
    results = []
    results.append(check("signup without database", "POST", "/auth/signup", {503}, json={
        "name": "Avery Chen", "workspaceName": "Northstar Customer Insights",
        "email": "avery.chen+loop@example.com", "password": "SecurePass!2026"
    })[0])
    results.append(check("login without database", "POST", "/auth/login", {503}, json={
        "email": "avery.chen+loop@example.com", "password": "SecurePass!2026"
    })[0])
    results.append(check("feedback unauthenticated", "GET", "/feedback", {401})[0])
    results.append(check("feedback post unauthenticated", "POST", "/feedback", {401}, json={
        "content": "The export workflow is difficult to understand", "channel": "email"
    })[0])
    results.append(check("dashboard unauthenticated", "GET", "/dashboard/stats", {401})[0])
    results.append(check("nextauth providers setup", "GET", "/auth/providers", {200})[0])
    results.append(check("nextauth session unauthenticated", "GET", "/auth/session", {200})[0])
    print(f"RESULT: {sum(results)}/{len(results)} checks passed")
    return 0 if all(results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
