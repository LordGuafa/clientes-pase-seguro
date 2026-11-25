from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from urllib.parse import parse_qs

import httpx
from fastapi.testclient import TestClient

from app.core.database import SessionLocal
from app.main import app as crud
from app.models.boleta import Boleta
from app.models.evento import Evento
from mid_compras.clientes import Acceso, Ticketmaster
from mid_compras.compras import Compra, ahora_utc
from mid_compras.main import app

fallar_acceso = False
consultas_externas = []


def gateway(peticion):
    if peticion.url.path == "/token":
        assert parse_qs(peticion.content.decode())["grant_type"] == ["client_credentials"]
        return httpx.Response(200, json={"access_token": "token", "expires_in": 120})
    assert peticion.headers["Authorization"] == "Bearer token"
    assert peticion.url.path.endswith("/estado-acceso")
    if fallar_acceso:
        return httpx.Response(503)
    return httpx.Response(200, json={"ingreso": False, "bloqueada": False, "transferencias": 0})


def discovery(peticion):
    assert peticion.url.path == "/discovery/v2/events/externo-1.json"
    assert peticion.url.params["apikey"] == "clave-prueba"
    consultas_externas.append(peticion.url.path)
    return httpx.Response(200, json={"name": "Evento externo"})


cabeceras = {"X-Gateway-Secret": "gateway-prueba"}
solicitud = {"eventoId": "evento-prueba", "compradorId": "a", "cantidad": 1}

with (
    TestClient(crud) as eventos,
    TestClient(app) as compras,
    httpx.Client(base_url="http://gateway.test", transport=httpx.MockTransport(gateway)) as acceso,
    httpx.Client(base_url="http://discovery.test", transport=httpx.MockTransport(discovery)) as externo,
):
    app.state.acceso = Acceso(acceso, app.state.config)
    app.state.ticketmaster = Ticketmaster(externo, app.state.config)
    with SessionLocal.begin() as db:
        db.add(Evento(
            id="evento-prueba", nombre="Evento", recinto="Recinto",
            fecha_hora=ahora_utc() + timedelta(days=1), aforo=1, precio_base=100,
            boletas=[Boleta()],
        ))

    def reservar(comprador):
        return compras.post("/compras/reservar", headers=cabeceras, json={**solicitud, "compradorId": comprador})

    assert compras.post("/compras/reservar", json=solicitud).status_code == 401
    fallar_acceso = True
    assert reservar("a").status_code == 503
    fallar_acceso = False
    with ThreadPoolExecutor(max_workers=2) as pool:
        resultados = list(pool.map(reservar, ("a", "b")))
    assert sorted(r.status_code for r in resultados) == [201, 409]
    primera = next(r.json() for r in resultados if r.status_code == 201)
    assert primera["ticketmaster"]["id"] == "externo-1"
    with SessionLocal.begin() as db:
        db.get(Compra, primera["id"]).vence_en = ahora_utc() - timedelta(seconds=1)
    vencida = compras.post(
        f"/compras/{primera['id']}/confirmar", headers=cabeceras, json={"referenciaPago": "pago-vencido"},
    )
    assert vencida.status_code == 409 and vencida.json()["codigo"] == "reserva_vencida"

    siguiente = reservar("a")
    assert siguiente.status_code == 201
    assert len(consultas_externas) == 1
    reserva = siguiente.json()
    codigo = reserva["boletas"][0]["codigo"]
    assert codigo == primera["boletas"][0]["codigo"]
    ruta = f"/compras/{reserva['id']}/confirmar"
    confirmada = compras.post(ruta, headers=cabeceras, json={"referenciaPago": "pago-123"})
    assert confirmada.status_code == 200
    assert compras.post(ruta, headers=cabeceras, json={"referenciaPago": "otro"}).json() == confirmada.json()
    assert confirmada.json()["boletas"][0]["codigoQr"].split(".")[0] == codigo
    boleta = eventos.get(f"/boletas/{codigo}", headers=cabeceras).json()
    assert boleta["estado"] == "vendida"
    assert boleta["propietario_id"] == "a"

