from datetime import datetime, timedelta, timezone


def datos_evento(id_evento, dias=30, aforo=3):
    return {
        "id": id_evento,
        "nombre": f"Evento {id_evento}",
        "recinto": "Teatro Central",
        "fecha_hora": (datetime.now(timezone.utc) + timedelta(days=dias)).isoformat(),
        "aforo": aforo,
        "precio_base": "80000.00",
    }


def test_crear_evento_genera_boletas(cliente_prueba, cabeceras_gateway):
    respuesta = cliente_prueba.post(
        "/eventos",
        headers=cabeceras_gateway,
        json={
            "id": "evt-test",
            "nombre": "Evento de prueba",
            "recinto": "Teatro Central",
            "fecha_hora": (datetime.now(timezone.utc) + timedelta(days=30)).isoformat(),
            "aforo": 50,
            "precio_base": "80000.00",
        },
    )

    assert respuesta.status_code == 201
    evento = respuesta.json()
    assert evento["id"] == "evt-test"

    boletas = cliente_prueba.get(
        "/boletas",
        headers=cabeceras_gateway,
        params={"eventoId": "evt-test"},
    )
    assert boletas.status_code == 200
    assert boletas.json()["total"] == 50


def test_detalle_evento_incluye_cantidad_disponible(cliente_prueba, cabeceras_gateway):
    cliente_prueba.post(
        "/eventos",
        headers=cabeceras_gateway,
        json={
            "id": "evt-detail",
            "nombre": "Detalle",
            "recinto": "Arena",
            "fecha_hora": (datetime.now(timezone.utc) + timedelta(days=10)).isoformat(),
            "aforo": 3,
            "precio_base": "50000.00",
        },
    )

    respuesta = cliente_prueba.get("/eventos/evt-detail", headers=cabeceras_gateway)

    assert respuesta.status_code == 200
    assert respuesta.json()["boletas_disponibles"] == 3


def test_rechaza_evento_con_fecha_pasada(cliente_prueba, cabeceras_gateway):
    respuesta = cliente_prueba.post(
        "/eventos",
        headers=cabeceras_gateway,
        json={
            "id": "evt-past",
            "nombre": "Pasado",
            "recinto": "Arena",
            "fecha_hora": (datetime.now(timezone.utc) - timedelta(days=1)).isoformat(),
            "aforo": 10,
            "precio_base": "50000.00",
        },
    )

    assert respuesta.status_code == 400
    assert respuesta.json()["codigo"] == "fecha_evento_invalida"


def test_rechaza_peticion_sin_secreto_gateway(cliente_prueba):
    respuesta = cliente_prueba.get("/eventos")
    assert respuesta.status_code == 401
    assert respuesta.json()["codigo"] == "sin_cabecera_gateway"


def test_rechaza_cancelar_evento_con_boleta_vendida(cliente_prueba, cabeceras_gateway):
    cliente_prueba.post(
        "/eventos",
        headers=cabeceras_gateway,
        json={
            "id": "evt-cancel",
            "nombre": "Cancelación",
            "recinto": "Arena",
            "fecha_hora": (datetime.now(timezone.utc) + timedelta(days=15)).isoformat(),
            "aforo": 1,
            "precio_base": "70000.00",
        },
    )
    boletas = cliente_prueba.get(
        "/boletas",
        headers=cabeceras_gateway,
        params={"eventoId": "evt-cancel"},
    ).json()["items"]
    codigo = boletas[0]["codigo"]
    cliente_prueba.patch(
        f"/boletas/{codigo}/propietario",
        headers=cabeceras_gateway,
        json={"propietario_id": "usr-1", "precio_pagado": "70000.00"},
    )

    respuesta = cliente_prueba.delete(
        "/eventos/evt-cancel",
        headers=cabeceras_gateway,
    )

    assert respuesta.status_code == 409
    assert respuesta.json()["codigo"] == "evento_con_boletas_vendidas"


def test_actualizar_evento_modifica_datos_y_estado(cliente_prueba, cabeceras_gateway):
    creado = cliente_prueba.post(
        "/eventos",
        headers=cabeceras_gateway,
        json=datos_evento("evt-actualizar"),
    )
    assert creado.status_code == 201

    respuesta = cliente_prueba.put(
        "/eventos/evt-actualizar",
        headers=cabeceras_gateway,
        json={"nombre": "Nombre actualizado", "estado": "finalizado"},
    )

    assert respuesta.status_code == 200
    assert respuesta.json()["nombre"] == "Nombre actualizado"
    assert respuesta.json()["estado"] == "finalizado"


def test_evento_inexistente_responde_404_en_consulta_y_actualizacion(
    cliente_prueba,
    cabeceras_gateway,
):
    consulta = cliente_prueba.get(
        "/eventos/no-existe",
        headers=cabeceras_gateway,
    )
    actualizacion = cliente_prueba.put(
        "/eventos/no-existe",
        headers=cabeceras_gateway,
        json={"nombre": "No existe"},
    )

    assert consulta.status_code == 404
    assert consulta.json()["codigo"] == "evento_inexistente"
    assert actualizacion.status_code == 404
    assert actualizacion.json()["codigo"] == "evento_inexistente"


def test_cancelar_evento_sin_boletas_vendidas(cliente_prueba, cabeceras_gateway):
    creado = cliente_prueba.post(
        "/eventos",
        headers=cabeceras_gateway,
        json=datos_evento("evt-cancelar"),
    )
    assert creado.status_code == 201

    cancelacion = cliente_prueba.delete(
        "/eventos/evt-cancelar",
        headers=cabeceras_gateway,
    )
    detalle = cliente_prueba.get(
        "/eventos/evt-cancelar",
        headers=cabeceras_gateway,
    )

    assert cancelacion.status_code == 204
    assert detalle.status_code == 200
    assert detalle.json()["estado"] == "cancelado"


def test_listar_eventos_filtra_por_estado_fecha_y_pagina(
    cliente_prueba,
    cabeceras_gateway,
):
    for id_evento, dias in (
        ("evt-lista-1", 10),
        ("evt-lista-2", 12),
        ("evt-lista-3", 14),
    ):
        respuesta = cliente_prueba.post(
            "/eventos",
            headers=cabeceras_gateway,
            json=datos_evento(id_evento, dias),
        )
        assert respuesta.status_code == 201

    cliente_prueba.put(
        "/eventos/evt-lista-2",
        headers=cabeceras_gateway,
        json={"estado": "finalizado"},
    )
    respuesta = cliente_prueba.get(
        "/eventos",
        headers=cabeceras_gateway,
        params={
            "estado": "activo",
            "desde": (datetime.now(timezone.utc) + timedelta(days=9)).isoformat(),
            "hasta": (datetime.now(timezone.utc) + timedelta(days=15)).isoformat(),
            "limit": 1,
            "offset": 1,
        },
    )

    assert respuesta.status_code == 200
    assert respuesta.json()["total"] == 2
    assert respuesta.json()["limit"] == 1
    assert respuesta.json()["offset"] == 1
    assert len(respuesta.json()["items"]) == 1
    assert respuesta.json()["items"][0]["id"] == "evt-lista-3"
