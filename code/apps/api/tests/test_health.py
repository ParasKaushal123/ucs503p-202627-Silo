def test_healthz(client):
    r = client.get("/healthz")
    assert r.status_code == 200
    assert r.json() == {"ok": True}


def test_me_unauthenticated(client):
    r = client.get("/auth/me")
    assert r.json()["authenticated"] is False
