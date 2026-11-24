def crear_evento(cliente_prueba, cabeceras_gateway, id_evento="evt-ticket"):
    from datetime import datetime, timedelta, timezone

    return cliente_prueba.post(
        "/eventos",
        headers=cabeceras_gateway,
        json={
            "id": id_evento,
            "nombre": "Boletas",
            "recinto": "Arena",
            "fecha_hora": (datetime.now(timezone.utc) + timedelta(days=20)).isoformat(),
            "aforo": 2,
            "precio_base": "80000.00",
        },
    )


def test_consultar_boleta_y_actualizar_propietario(cliente_prueba, cabeceras_gateway):
    assert crear_evento(cliente_prueba, cabeceras_gateway).status_code == 201
    boletas = cliente_prueba.get(
        "/boletas",
        headers=cabeceras_gateway,
        params={"eventoId": "evt-ticket"},
    ).json()["items"]
    codigo = boletas[0]["codigo"]

    respuesta = cliente_prueba.patch(
        f"/boletas/{codigo}/propietario",
        headers=cabeceras_gateway,
        json={
            "propietario_id": "usr-9",
            "precio_pagado": "80000.00",
        },
    )

    assert respuesta.status_code == 200
    assert respuesta.json()["propietario_id"] == "usr-9"
    assert respuesta.json()["estado"] == "vendida"


def test_boleta_inexistente_responde_404(cliente_prueba, cabeceras_gateway):
    respuesta = cliente_prueba.get(
        "/boletas/00000000-0000-0000-0000-000000000000",
        headers=cabeceras_gateway,
    )
    assert respuesta.status_code == 404
    assert respuesta.json()["codigo"] == "boleta_inexistente"


def test_listar_boletas_filtra_por_evento_estado_y_propietario(
    cliente_prueba,
    cabeceras_gateway,
):
    assert crear_evento(
        cliente_prueba,
        cabeceras_gateway,
        id_evento="evt-filtros",
    ).status_code == 201
    boletas = cliente_prueba.get(
        "/boletas",
        headers=cabeceras_gateway,
        params={"eventoId": "evt-filtros"},
    ).json()["items"]

    primera = cliente_prueba.patch(
        f"/boletas/{boletas[0]['codigo']}/propietario",
        headers=cabeceras_gateway,
        json={"propietario_id": "usr-filtro", "precio_pagado": "80000.00"},
    )
    segunda = cliente_prueba.patch(
        f"/boletas/{boletas[1]['codigo']}/propietario",
        headers=cabeceras_gateway,
        json={"propietario_id": "usr-otro", "precio_pagado": "80000.00"},
    )
    assert primera.status_code == 200
    assert segunda.status_code == 200

    respuesta = cliente_prueba.get(
        "/boletas",
        headers=cabeceras_gateway,
        params={
            "eventoId": "evt-filtros",
            "estado": "vendida",
            "propietarioId": "usr-filtro",
        },
    )

    assert respuesta.status_code == 200
    assert respuesta.json()["total"] == 1
    assert respuesta.json()["items"][0]["propietario_id"] == "usr-filtro"


def test_listar_boletas_aplica_paginacion(cliente_prueba, cabeceras_gateway):
    assert crear_evento(
        cliente_prueba,
        cabeceras_gateway,
        id_evento="evt-paginacion",
    ).status_code == 201

    respuesta = cliente_prueba.get(
        "/boletas",
        headers=cabeceras_gateway,
        params={"eventoId": "evt-paginacion", "limit": 1, "offset": 1},
    )

    assert respuesta.status_code == 200
    assert respuesta.json()["total"] == 2
    assert respuesta.json()["limit"] == 1
    assert respuesta.json()["offset"] == 1
    assert len(respuesta.json()["items"]) == 1
