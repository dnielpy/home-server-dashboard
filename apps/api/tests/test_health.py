def test_health(client) -> None:
    assert client.get("/health").json() == {"status": "ok"}
