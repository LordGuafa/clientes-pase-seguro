import os
import subprocess
import sys
from pathlib import Path


def test_flujo_compras(tmp_path):
    entorno = {
        **os.environ,
        "URL_BASE_DATOS": f"sqlite+pysqlite:///{(tmp_path / 'compras.db').as_posix()}",
        "SECRETO_GATEWAY": "gateway-prueba",
        "GATEWAY_URL": "http://gateway.test",
        "CLIENT_ID": "compras",
        "CLIENT_SECRET": "credencial-prueba",
        "QR_SECRET": "qr-prueba",
        "TICKETMASTER_API_KEY": "clave-prueba",
        "TICKETMASTER_EVENTOS": '{"evento-prueba":"externo-1"}',
    }
    carpeta = Path(__file__).resolve().parents[1]
    entorno["PYTHONPATH"] = os.pathsep.join(map(str, (carpeta, carpeta.parent / "Eventos y boletas")))
    subprocess.run(
        [sys.executable, str(Path(__file__).with_name("flujo_compras.py"))],
        cwd=carpeta, env=entorno, check=True, timeout=30,
    )
