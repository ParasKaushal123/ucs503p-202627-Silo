def test_create_and_list_app(client, auth_cookies):
    r = client.post("/apps", json={"name": "My Dashboard"}, **auth_cookies)
    assert r.status_code == 201
    data = r.json()
    assert data["name"] == "My Dashboard"
    assert data["slug"] == "my-dashboard"

    r = client.get("/apps", **auth_cookies)
    assert len(r.json()) >= 1


def test_create_app_unauthenticated(client):
    r = client.post("/apps", json={"name": "Fail"})
    assert r.status_code == 401


def test_delete_app(client, auth_cookies):
    r = client.post("/apps", json={"name": "To Delete"}, **auth_cookies)
    app_id = r.json()["id"]

    r = client.delete(f"/apps/{app_id}", **auth_cookies)
    assert r.status_code == 204

    r = client.get(f"/apps/{app_id}", **auth_cookies)
    assert r.status_code == 404


def test_slug_uniqueness(client, auth_cookies):
    client.post("/apps", json={"name": "Same Name"}, **auth_cookies)
    r = client.post("/apps", json={"name": "Same Name"}, **auth_cookies)
    assert r.status_code == 201
    assert r.json()["slug"] == "same-name-1"
