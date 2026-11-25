from threading import Lock
from time import monotonic
from urllib.parse import quote

import httpx

from app.domain.errors import DomainError


class Acceso:
    def __init__(self, http: httpx.Client, config):
        self.http = http
        self.config = config
        self.lock = Lock()
        self.token = ""
        self.vence = 0.0

    def obtener_token(self, rechazado=None):
        with self.lock:
            if self.token != rechazado and monotonic() < self.vence:
                return self.token
            respuesta = self.http.post(
                self.config.gateway_token_path,
                data={
                    "grant_type": "client_credentials",
                    "client_id": self.config.client_id,
                    "client_secret": self.config.client_secret.get_secret_value(),
                },
            )
            respuesta.raise_for_status()
            datos = respuesta.json()
            token = datos["access_token"]
            if not isinstance(token, str) or not token:
                raise ValueError("Token inválido")
            vigencia = datos.get("expires_in", 60)
            self.vence = monotonic() + max(0, float(vigencia) - 30)
            self.token = token
            return token

    def disponible(self, codigo):
        try:
            token = self.obtener_token()
            ruta = f"/boletas/{codigo}/estado-acceso"
            respuesta = self.http.get(ruta, headers={"Authorization": f"Bearer {token}"})
            if respuesta.status_code == 401:
                token = self.obtener_token(rechazado=token)
                respuesta = self.http.get(ruta, headers={"Authorization": f"Bearer {token}"})
            respuesta.raise_for_status()
            datos = respuesta.json()
            ingreso, bloqueada = datos["ingreso"], datos["bloqueada"]
            if type(ingreso) is not bool or type(bloqueada) is not bool:
                raise ValueError("Estado de acceso inválido")
            return not ingreso and not bloqueada
        except (httpx.HTTPError, ValueError, KeyError, TypeError):
            raise DomainError(
                "servicio_no_disponible", "No se pudo consultar Acceso y reventa",
                {"servicio": "Acceso y reventa"}, status_code=503,
            ) from None


class Ticketmaster:
    def __init__(self, http: httpx.Client, config):
        self.http = http
        self.config = config
        self.cache = {}
        self.lock = Lock()

    def evento(self, evento_id):
        externo = self.config.ticketmaster_eventos.get(evento_id)
        clave = self.config.ticketmaster_api_key.get_secret_value()
        if not externo or not clave:
            return None
        with self.lock:
            anterior, vence = self.cache.get(externo, (None, 0))
            if monotonic() < vence:
                return anterior

        ruta = f"/discovery/v2/events/{quote(externo, safe='')}.json"
        for intento in range(2):
            try:
                respuesta = self.http.get(ruta, params={"apikey": clave})
                if respuesta.status_code >= 500 and intento == 0:
                    continue
                respuesta.raise_for_status()
                datos = respuesta.json()
                nombre, url = datos["name"], datos.get("url")
                if not isinstance(nombre, str) or (url is not None and not isinstance(url, str)):
                    break
                evento = {"id": externo, "nombre": nombre, "url": url}
                with self.lock:
                    self.cache[externo] = (evento, monotonic() + 300)
                return evento
            except (httpx.TimeoutException, httpx.NetworkError):
                continue
            except (httpx.HTTPError, ValueError, KeyError, TypeError, AttributeError):
                break
        with self.lock:
            degradado = {**anterior, "desactualizado": True} if anterior else None
            self.cache[externo] = (degradado, monotonic() + 30)
        return degradado
